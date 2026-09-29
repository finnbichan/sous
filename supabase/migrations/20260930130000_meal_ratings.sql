-- "We cooked it": rate planned meals.
--
--   * plannedrecipes.rating (1 = loved it, -1 = not again) and cooked_at, set by
--     rate_planned_meal() for meals dated up to today (+1 day for timezones).
--     The rating belongs to the household's meal, so either person can set it.
--   * Taste: "loved it" meals count again on top of being kept; "not again"
--     meals no longer count as kept and push the taste away.
--   * Ranking: a recipe whose latest rating is "not again" goes to the back
--     (after the re-roll and 3-day variety rules), so it only comes up when
--     nothing else fits.
--   * planned_recipe_json returns rating and cooked_at; plan_events logs
--     cooked_liked / cooked_disliked.
--
-- Rollback: re-create household_taste / suggest_recipe /
--   generate_mealplans_between_dates from 20260930120000_taste_ranking.sql and
--   planned_recipe_json from 20260929120000_meal_plan_editing.sql; drop function
--   public.rate_planned_meal(bigint, smallint); drop the columns and restore the
--   plan_events event check.

begin;

alter table public.plannedrecipes
  add column rating smallint check (rating in (-1, 1)),
  add column cooked_at timestamptz;

alter table public.plan_events drop constraint plan_events_event_check;
alter table public.plan_events add constraint plan_events_event_check check (event in (
  'suggested', 'generated', 'chosen', 'noted', 'rerolled', 'replaced', 'removed', 'moved',
  'cooked_liked', 'cooked_disliked'
));

create or replace function public.planned_recipe_json(p_id bigint)
 returns jsonb
 language sql
 stable
 set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'plannedrecipe_id', pr.id,
    'date', pr.date,
    'meal_type', pr.meal_type,
    'note', pr.note,
    'rating', pr.rating,
    'cooked_at', pr.cooked_at,
    'recipe', case when r.id is null then null else jsonb_build_object(
      'recipe_id', r.id,
      'name', r.name,
      'ease', r.ease,
      'cuisine', r.cuisine,
      'diet', r.diet,
      'description', r.description,
      'steps', r.steps,
      'ingredients', r.ingredients,
      'meals', r.meals,
      'image_uri', r.image_uri,
      'user_id', r.user_id
    ) end
  )
  from plannedrecipes pr
  left join recipes r on r.id = pr.recipe_id
  where pr.id = p_id;
$function$;

-- p_rating: 1 = loved it, -1 = not again, null = clear.
create or replace function public.rate_planned_meal(p_plannedrecipe_id bigint, p_rating smallint)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_row plannedrecipes;
begin
  if p_rating is not null and p_rating not in (-1, 1) then
    raise exception 'Invalid rating' using errcode = '22023';
  end if;

  update plannedrecipes
  set rating = p_rating,
      cooked_at = case when p_rating is null then null else coalesce(cooked_at, now()) end
  where id = p_plannedrecipe_id
    and user_id = public.household_owner()
    and active
    and recipe_id is not null
    and date <= current_date + 1
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Meal not found' using errcode = 'P0002';
  end if;

  if p_rating is not null then
    perform private.log_plan_event(
      case p_rating when 1 then 'cooked_liked' else 'cooked_disliked' end,
      v_row.recipe_id, v_row.id, v_row.date, v_row.meal_type
    );
  end if;

  return public.planned_recipe_json(v_row.id);
end;
$function$;

create or replace function public.household_taste()
 returns extensions.vector
 language sql
 stable
 security definer
 set search_path = public, extensions, pg_temp
as $function$
  with owner as (
    select public.household_owner() as id
  ),
  -- Most recent history rather than a time window, so a household that has
  -- been away still has a taste.
  kept as (
    -- the last 60 meals kept on the plan (up to two weeks ahead)
    select r.embedding
    from plannedrecipes pr
    join recipes r on r.id = pr.recipe_id
    where pr.user_id = (select id from owner)
      and pr.active
      and pr.date <= current_date + 14
      and pr.rating is distinct from -1
      and r.embedding is not null
    order by pr.date desc
    limit 60
  ),
  loved as (
    -- meals rated "loved it" count again on top of being kept
    select r.embedding
    from plannedrecipes pr
    join recipes r on r.id = pr.recipe_id
    where pr.user_id = (select id from owner)
      and pr.rating = 1
      and r.embedding is not null
    order by pr.cooked_at desc
    limit 30
  ),
  chosen as (
    -- recipes someone picked themselves count again
    select r.embedding
    from plan_events e
    join recipes r on r.id = e.recipe_id
    where e.household_owner = (select id from owner)
      and e.event = 'chosen'
      and r.embedding is not null
    order by e.created_at desc
    limit 30
  ),
  liked as (
    select embedding from kept
    union all
    select embedding from chosen
    union all
    select embedding from loved
  ),
  disliked as (
    (
      select r.embedding
      from plan_events e
      join recipes r on r.id = e.recipe_id
      where e.household_owner = (select id from owner)
        and e.event in ('rerolled', 'removed')
        and r.embedding is not null
      order by e.created_at desc
      limit 30
    )
    union all
    (
      -- meals rated "not again"
      select r.embedding
      from plannedrecipes pr
      join recipes r on r.id = pr.recipe_id
      where pr.user_id = (select id from owner)
        and pr.rating = -1
        and r.embedding is not null
      order by pr.cooked_at desc
      limit 30
    )
  )
  -- cosine distance ignores length, so 2*liked - disliked is liked - 0.5*disliked
  select case
    when not exists (select 1 from liked) then null
    when not exists (select 1 from disliked) then (select avg(embedding) from liked)
    else (select avg(embedding) from liked) + (select avg(embedding) from liked)
         - (select avg(embedding) from disliked)
  end;
$function$;

create or replace function public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 returns jsonb
 language plpgsql
 set search_path = public, extensions, pg_temp
as $function$
declare
  v_owner uuid := public.household_owner();
  v_current bigint;
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
    -ln(1 - random()) * taste_rank              -- then taste-weighted random (see above)
  limit 1;

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
        where r.meals @> jsonb_build_array(m)
          and r.id in (select public.household_recipe_ids())
          and public.recipe_suits_household(r.id)
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

revoke execute on function public.rate_planned_meal(bigint, smallint) from public, anon;
grant execute on function public.rate_planned_meal(bigint, smallint) to authenticated;

commit;
