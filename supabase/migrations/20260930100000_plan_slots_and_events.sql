-- Meal slots are owned by the server, and planning actions are logged.
--
--   * One active meal per (plan, date, meal type), enforced by a unique index.
--     Previously suggest/choose/note always inserted and the app deactivated the
--     old meal in a second call; a failure or two people tapping at once left
--     two active meals in a slot.
--   * suggest_recipe, add_single_planned_recipe and add_planned_note now replace
--     whatever is in the slot in the same transaction. remove_planned_recipe is
--     new (the app used to update plannedrecipes directly).
--   * Inputs are validated; every function returns planned_recipe_json; a
--     re-roll avoids returning the recipe it replaces when there's an alternative;
--     add_single_planned_recipe only accepts the household's recipes.
--   * plan_events records suggested / generated / chosen / noted / rerolled /
--     replaced / removed / moved, for taste-based suggestions.
--
-- Rollback: drop table public.plan_events; drop schema private cascade;
--   drop function public.remove_planned_recipe(bigint);
--   drop index plannedrecipes_one_active_per_slot, plannedrecipes_recent_by_recipe;
--   re-create the functions from 20260929120000_meal_plan_editing.sql and
--   20260929100000_shared_household.sql / 20260928200000_preference_aware_suggestions.sql.

begin;

-------------------------------------------------------------------------------
-- Slot integrity
-------------------------------------------------------------------------------
create unique index plannedrecipes_one_active_per_slot
  on public.plannedrecipes (user_id, date, meal_type)
  where active;

-- variety checks look up recent plans of a recipe
create index plannedrecipes_recent_by_recipe
  on public.plannedrecipes (user_id, recipe_id, date)
  where active;

-------------------------------------------------------------------------------
-- Feedback log
-------------------------------------------------------------------------------
create table public.plan_events (
  id bigint generated always as identity primary key,
  household_owner uuid not null,
  user_id uuid not null default auth.uid(),
  recipe_id bigint references public.recipes(id) on delete cascade,
  plannedrecipe_id bigint,
  date date,
  meal_type smallint,
  event text not null check (event in (
    'suggested', 'generated', 'chosen', 'noted', 'rerolled', 'replaced', 'removed', 'moved'
  )),
  created_at timestamptz not null default now()
);

create index plan_events_owner_recent on public.plan_events (household_owner, created_at desc);
create index plan_events_recipe on public.plan_events (recipe_id);

alter table public.plan_events enable row level security;

create policy "Users can log their own plan events"
  on public.plan_events for insert
  to authenticated
  with check (user_id = (select auth.uid()) and household_owner = (select public.household_owner()));

create policy "Users can read their household's plan events"
  on public.plan_events for select
  to authenticated
  using (household_owner = (select public.household_owner()) or user_id = (select auth.uid()));

revoke all on public.plan_events from anon;

-------------------------------------------------------------------------------
-- Internal helpers (not exposed through the API: separate schema)
-------------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.check_slot(p_date date, p_mealtype integer)
 returns void
 language plpgsql
 immutable
 set search_path = public, pg_temp
as $function$
begin
  if p_date is null or p_mealtype is null or p_mealtype not in (1, 2, 3) then
    raise exception 'Invalid meal slot' using errcode = '22023';
  end if;
end;
$function$;

create or replace function private.log_plan_event(
  p_event text, p_recipe_id bigint, p_plannedrecipe_id bigint, p_date date, p_mealtype integer
)
 returns void
 language sql
 set search_path = public, pg_temp
as $function$
  insert into public.plan_events (household_owner, recipe_id, plannedrecipe_id, date, meal_type, event)
  values (public.household_owner(), p_recipe_id, p_plannedrecipe_id, p_date, p_mealtype, p_event);
$function$;

-- Deactivate whatever is planned in the slot, logging p_event for it.
create or replace function private.vacate_slot(p_date date, p_mealtype integer, p_event text)
 returns void
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_old record;
begin
  for v_old in
    update public.plannedrecipes
    set active = false
    where user_id = public.household_owner()
      and date = p_date and meal_type = p_mealtype and active
    returning id, recipe_id
  loop
    perform private.log_plan_event(p_event, v_old.recipe_id, v_old.id, p_date, p_mealtype);
  end loop;
end;
$function$;

grant execute on all functions in schema private to authenticated;

-------------------------------------------------------------------------------
-- Planning functions
-------------------------------------------------------------------------------
create or replace function public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_owner uuid := public.household_owner();
  v_current bigint;
  v_pick bigint;
  v_id bigint;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform private.check_slot(p_date, p_mealtype);

  select recipe_id into v_current
  from plannedrecipes
  where user_id = v_owner and date = p_date and meal_type = p_mealtype and active;

  select r.id into v_pick
  from recipes r
  where r.meals @> jsonb_build_array(p_mealtype)
    and r.id in (select public.household_recipe_ids())
    and public.recipe_suits_household(r.id)
  order by
    r.id is not distinct from v_current,            -- a re-roll prefers a different recipe
    exists (
      select 1 from plannedrecipes pr
      where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
        and pr.date between p_date - 3 and p_date + 3
        and not (pr.date = p_date and pr.meal_type = p_mealtype)
    ),                                              -- then one not planned in the last/next 3 days
    random()
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

create or replace function public.add_single_planned_recipe(p_user_id uuid, p_mealtype integer, p_date date, p_recipe_id integer)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_id bigint;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform private.check_slot(p_date, p_mealtype);
  if p_recipe_id is null or p_recipe_id not in (select public.household_recipe_ids()) then
    raise exception 'Recipe not found' using errcode = 'P0002';
  end if;

  perform private.vacate_slot(p_date, p_mealtype, 'replaced');
  insert into plannedrecipes (meal_type, date, recipe_id, user_id)
  values (p_mealtype, p_date, p_recipe_id, public.household_owner())
  returning id into v_id;
  perform private.log_plan_event('chosen', p_recipe_id, v_id, p_date, p_mealtype);

  return public.planned_recipe_json(v_id);
end;
$function$;

create or replace function public.add_planned_note(p_mealtype integer, p_date date, p_note text)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_note text := nullif(trim(p_note), '');
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.check_slot(p_date, p_mealtype);
  if v_note is null or length(v_note) > 100 then
    raise exception 'Notes must be 1 to 100 characters';
  end if;

  perform private.vacate_slot(p_date, p_mealtype, 'replaced');
  insert into plannedrecipes (meal_type, date, recipe_id, user_id, note)
  values (p_mealtype, p_date, null, public.household_owner(), v_note)
  returning id into v_id;
  perform private.log_plan_event('noted', null, v_id, p_date, p_mealtype);

  return public.planned_recipe_json(v_id);
end;
$function$;

create or replace function public.remove_planned_recipe(p_plannedrecipe_id bigint)
 returns void
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_row plannedrecipes;
begin
  update plannedrecipes
  set active = false
  where id = p_plannedrecipe_id and user_id = public.household_owner() and active
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Meal not found' using errcode = 'P0002';
  end if;
  perform private.log_plan_event('removed', v_row.recipe_id, v_row.id, v_row.date, v_row.meal_type);
end;
$function$;

-- Swap-safe with the one-meal-per-slot index: take the source out of its slot
-- first, move the target into it, then put the source in the target slot.
create or replace function public.move_planned_recipe(p_plannedrecipe_id bigint, p_date date, p_mealtype integer)
 returns void
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_owner uuid := public.household_owner();
  v_source plannedrecipes;
  v_target_id bigint;
begin
  perform private.check_slot(p_date, p_mealtype);

  select * into v_source
  from plannedrecipes
  where id = p_plannedrecipe_id and user_id = v_owner and active
  for update;

  if v_source.id is null then
    raise exception 'Meal not found' using errcode = 'P0002';
  end if;

  if v_source.date = p_date and v_source.meal_type = p_mealtype then
    return;
  end if;

  select id into v_target_id
  from plannedrecipes
  where user_id = v_owner and active and date = p_date and meal_type = p_mealtype
  for update;

  update plannedrecipes set active = false where id = v_source.id;

  if v_target_id is not null then
    update plannedrecipes
    set date = v_source.date, meal_type = v_source.meal_type
    where id = v_target_id;
  end if;

  update plannedrecipes
  set date = p_date, meal_type = p_mealtype, active = true
  where id = v_source.id;

  perform private.log_plan_event('moved', v_source.recipe_id, v_source.id, p_date, p_mealtype);
end;
$function$;

create or replace function public.generate_mealplans_between_dates(p_user_id uuid, p_start_date date, p_end_date date)
 returns void
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  d date;
  m int;
  v_owner uuid := public.household_owner();
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
      with picked as (
        insert into plannedrecipes (meal_type, date, recipe_id, user_id)
        select m, d, r.id, v_owner
        from recipes r
        where r.meals @> jsonb_build_array(m)
          and r.id in (select public.household_recipe_ids())
          and public.recipe_suits_household(r.id)
          and not exists (
              select 1 from plannedrecipes pr
              where pr.user_id = v_owner and pr.date = d and pr.meal_type = m and pr.active
          )
        order by
          exists (
            select 1 from plannedrecipes pr
            where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
              and pr.date between d - 3 and d + 3
          ),
          random()
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

-------------------------------------------------------------------------------
-- Privileges
-------------------------------------------------------------------------------
revoke execute on function public.remove_planned_recipe(bigint) from public, anon;
grant execute on function public.remove_planned_recipe(bigint) to authenticated;
grant select, insert on public.plan_events to authenticated;

commit;
