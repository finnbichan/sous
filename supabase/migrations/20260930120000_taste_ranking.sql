-- Taste-based suggestions.
--
-- household_taste(): the average embedding of the household's last 60 kept
-- meals and last 30 explicitly chosen recipes, pushed away from its last 30
-- re-rolled or removed ones. Null until the household has any history with
-- embedded recipes.
--
-- suggest_recipe and generate_mealplans_between_dates keep their filters and
-- variety rules, then pick by taste-weighted random sampling (details above
-- the functions). Households without a taste yet get plain random, as before.
--
-- Rollback: re-create suggest_recipe / generate_mealplans_between_dates from
--   20260930100000_plan_slots_and_events.sql; drop function
--   public.household_taste().

begin;

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
      and r.embedding is not null
    order by pr.date desc
    limit 60
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
  ),
  disliked as (
    select r.embedding
    from plan_events e
    join recipes r on r.id = e.recipe_id
    where e.household_owner = (select id from owner)
      and e.event in ('rerolled', 'removed')
      and r.embedding is not null
    order by e.created_at desc
    limit 30
  )
  -- cosine distance ignores length, so 2*liked - disliked is liked - 0.5*disliked
  select case
    when not exists (select 1 from liked) then null
    when not exists (select 1 from disliked) then (select avg(embedding) from liked)
    else (select avg(embedding) from liked) + (select avg(embedding) from liked)
         - (select avg(embedding) from disliked)
  end;
$function$;

-- Ranking: candidates are ranked by cosine distance to the household taste
-- (rank k = k-th closest) and one is sampled with weight 1/k, by ordering on
-- -ln(1 - random()) * k (Efraimidis-Spirakis weighted sampling). Out of 12
-- dinners the closest is picked ~32% of the time, the next ~16%, then ~11%...
-- so suggestions lean towards the household's taste without repeating one
-- favourite. With no taste yet every candidate has rank 1: plain random.

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
        order by planned_recently, -ln(1 - random()) * taste_rank
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

revoke execute on function public.household_taste() from public, anon;
grant execute on function public.household_taste() to authenticated;

commit;
