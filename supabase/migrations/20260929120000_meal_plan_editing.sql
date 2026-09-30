-- Meal plan editing:
--   * Free-text slots ("Eating out", "Leftovers"): plannedrecipes.note, with no
--     recipe. Notes count as planned (generation skips the slot) and are
--     ignored by shopping list generation (it inner-joins recipes).
--   * Move a meal to another day/meal, swapping with whatever is there.
-- Both work on the household plan (household_owner()).
--
-- Rollback: drop function public.add_planned_note(integer, date, text),
--   public.move_planned_recipe(bigint, date, integer); re-create
--   get_planned_recipes from 20260929100000_shared_household.sql;
--   delete note rows; alter table plannedrecipes drop column note.

begin;

alter table public.plannedrecipes add column note text;
alter table public.plannedrecipes
  add constraint plannedrecipes_recipe_or_note
  check (recipe_id is not null or nullif(trim(note), '') is not null);

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

create or replace function public.get_planned_recipes(p_user_id uuid, p_start_date date, p_end_date date)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(public.planned_recipe_json(pr.id))
      from plannedrecipes pr
      where pr.user_id = public.household_owner()
        and pr.active = true
        and pr.date >= p_start_date
        and pr.date <= p_end_date
    ),
    '[]'::jsonb
  );
end;
$function$;

create or replace function public.add_planned_note(p_mealtype integer, p_date date, p_note text)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  v_note text := nullif(trim(p_note), '');
  inserted_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_note is null or length(v_note) > 100 then
    raise exception 'Notes must be 1 to 100 characters';
  end if;

  insert into plannedrecipes (meal_type, date, recipe_id, user_id, note)
  values (p_mealtype, p_date, null, public.household_owner(), v_note)
  returning id into inserted_id;

  return public.planned_recipe_json(inserted_id);
end;
$function$;

-- Moves a planned meal (recipe or note). If the target slot already has an
-- active meal, the two swap places.
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
  limit 1
  for update;

  if v_target_id is not null then
    update plannedrecipes
    set date = v_source.date, meal_type = v_source.meal_type
    where id = v_target_id;
  end if;

  update plannedrecipes
  set date = p_date, meal_type = p_mealtype
  where id = p_plannedrecipe_id;
end;
$function$;

revoke execute on function
  public.planned_recipe_json(bigint),
  public.add_planned_note(integer, date, text),
  public.move_planned_recipe(bigint, date, integer)
from public, anon;

grant execute on function
  public.planned_recipe_json(bigint),
  public.add_planned_note(integer, date, text),
  public.move_planned_recipe(bigint, date, integer)
to authenticated;

commit;
