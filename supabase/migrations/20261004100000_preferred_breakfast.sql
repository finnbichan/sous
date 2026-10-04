-- Preferred breakfast: the same breakfast on chosen days of the week.
--
--   * profiles.preferred_breakfast_recipe_id and preferred_breakfast_days
--     (ISO weekdays, 1 = Monday ... 7 = Sunday), edited on the Profile screen.
--   * private.preferred_breakfast(date): the household's preferred breakfast
--     for that day. Either member's preference counts; the caller's own wins
--     if both apply. Ignored if the recipe is no longer in the household pool.
--   * suggest_recipe: an empty breakfast slot on a preferred day gets the
--     preferred recipe. A re-roll (slot already filled) uses the normal taste
--     ranking, so the preferred breakfast can be swapped out for a day.
--   * generate_mealplans_between_dates: fills preferred days with it.
--
-- Rollback: re-create suggest_recipe / generate_mealplans_between_dates from
--   20260930130000_meal_ratings.sql; drop function private.preferred_breakfast(date);
--   alter table public.profiles drop column preferred_breakfast_recipe_id,
--   drop column preferred_breakfast_days.

begin;

alter table public.profiles
  add column preferred_breakfast_recipe_id bigint references public.recipes(id) on delete set null,
  add column preferred_breakfast_days smallint[] not null default '{}'
    check (preferred_breakfast_days <@ '{1,2,3,4,5,6,7}'::smallint[]);

grant insert (preferred_breakfast_recipe_id, preferred_breakfast_days) on public.profiles to authenticated;
grant update (preferred_breakfast_recipe_id, preferred_breakfast_days) on public.profiles to authenticated;

-- Security definer so it can read the partner's profile; only returns a recipe id.
create or replace function private.preferred_breakfast(p_date date)
 returns bigint
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select p.preferred_breakfast_recipe_id
  from profiles p
  where p.id in (select public.household_members())
    and p.preferred_breakfast_recipe_id in (select public.household_recipe_ids())
    and extract(isodow from p_date)::smallint = any(p.preferred_breakfast_days)
  order by p.id = auth.uid() desc
  limit 1;
$function$;

revoke execute on function private.preferred_breakfast(date) from public, anon;
grant execute on function private.preferred_breakfast(date) to authenticated;

create or replace function public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 returns jsonb
 language plpgsql
 set search_path = public, extensions, pg_temp
as $function$
declare
  v_owner uuid := public.household_owner();
  v_current bigint;
  v_preferred bigint;
  v_pick bigint;
  v_id bigint;
  v_taste extensions.vector := public.household_taste();
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform private.check_slot(p_date, p_mealtype);

  select recipe_id into v_current
  from plannedrecipes
  where user_id = v_owner and date = p_date and meal_type = p_mealtype and active;

  -- an empty breakfast slot on a preferred day gets the preferred breakfast
  if p_mealtype = 1 and v_current is null then
    v_preferred := private.preferred_breakfast(p_date);
  end if;

  if v_preferred is not null then
    v_pick := v_preferred;
  else
    with candidates as (
      select
        r.id,
        r.id is not distinct from v_current as is_current,
        exists (
          select 1 from plannedrecipes pr
          where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
            and pr.date between p_date - 3 and p_date + 3
            and not (pr.date = p_date and pr.meal_type = p_mealtype)
        ) as planned_recently,
        coalesce((
          select pr.rating = -1
          from plannedrecipes pr
          where pr.user_id = v_owner and pr.recipe_id = r.id and pr.rating is not null
          order by pr.cooked_at desc
          limit 1
        ), false) as not_again,
        r.embedding <=> v_taste as distance
      from recipes r
      where r.meals @> jsonb_build_array(p_mealtype)
        and r.id in (select public.household_recipe_ids())
        and public.recipe_suits_household(r.id)
    ),
    ranked as (
      select *, rank() over (order by distance nulls last) as taste_rank
      from candidates
    )
    select id into v_pick
    from ranked
    order by
      is_current,                                 -- a re-roll prefers a different recipe
      planned_recently,                           -- then one not planned in the last/next 3 days
      not_again,                                  -- then not one the household rated "not again"
      -ln(1 - random()) * taste_rank              -- then taste-weighted random
    limit 1;
  end if;

  -- nothing suitable: leave the slot as it is; the app shows a message
  if v_pick is null then
    return null;
  end if;

  perform private.vacate_slot(p_date, p_mealtype, 'rerolled');
  insert into plannedrecipes (meal_type, date, recipe_id, user_id)
  values (p_mealtype, p_date, v_pick, v_owner)
  returning id into v_id;
  perform private.log_plan_event('suggested', v_pick, v_id, p_date, p_mealtype);

  return public.planned_recipe_json(v_id);
end;
$function$;

create or replace function public.generate_mealplans_between_dates(p_user_id uuid, p_start_date date, p_end_date date)
 returns void
 language plpgsql
 set search_path = public, extensions, pg_temp
as $function$
declare
  d date;
  m int;
  v_owner uuid := public.household_owner();
  v_taste extensions.vector := public.household_taste();
  v_preferred bigint;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 31 then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  for d in select generate_series(p_start_date, p_end_date, interval '1 day')::date
  loop
    for m in select unnest(array[1,2,3])
    loop
      v_preferred := case when m = 1 then private.preferred_breakfast(d) end;

      with candidates as (
        select
          r.id,
          exists (
            select 1 from plannedrecipes pr
            where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
              and pr.date between d - 3 and d + 3
          ) as planned_recently,
          coalesce((
            select pr.rating = -1
            from plannedrecipes pr
            where pr.user_id = v_owner and pr.recipe_id = r.id and pr.rating is not null
            order by pr.cooked_at desc
            limit 1
          ), false) as not_again,
          r.embedding <=> v_taste as distance
        from recipes r
        -- a preferred breakfast day only considers that recipe
        where (
            r.id = v_preferred
            or (
              v_preferred is null
              and r.meals @> jsonb_build_array(m)
              and r.id in (select public.household_recipe_ids())
              and public.recipe_suits_household(r.id)
            )
          )
          and not exists (
              select 1 from plannedrecipes pr
              where pr.user_id = v_owner and pr.date = d and pr.meal_type = m and pr.active
          )
      ),
      ranked as (
        select *, rank() over (order by distance nulls last) as taste_rank
        from candidates
      ),
      picked as (
        insert into plannedrecipes (meal_type, date, recipe_id, user_id)
        select m, d, id, v_owner
        from ranked
        order by planned_recently, not_again, -ln(1 - random()) * taste_rank
        limit 1
        -- someone filled the slot meanwhile: leave theirs
        on conflict (user_id, date, meal_type) where active do nothing
        returning id, recipe_id
      )
      insert into plan_events (household_owner, recipe_id, plannedrecipe_id, date, meal_type, event)
      select v_owner, picked.recipe_id, picked.id, d, m, 'generated' from picked;
    end loop;
  end loop;
end;
$function$;

commit;
