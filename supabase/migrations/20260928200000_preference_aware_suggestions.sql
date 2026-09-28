-- Suggestions and generated plans respect the preferences collected at
-- onboarding (previously stored but never used):
--   * diet: vegetarian users only get veggie/vegan recipes, vegan users only vegan
--   * allergies and dislikes: skip recipes whose name or ingredients mention them
--   * variety: prefer recipes not already planned within 3 days
-- Returns null (no suggestion) when nothing fits; the app shows a message.
--
-- Rollback: re-create suggest_recipe / generate_mealplans_between_dates from
-- 20260928160000_lock_down_user_data.sql and drop recipe_suits_user(bigint, uuid).

begin;

create or replace function public.recipe_suits_user(p_recipe_id bigint, p_user uuid)
 returns boolean
 language sql
 stable
 set search_path = public, pg_temp
as $function$
  select coalesce((
    select coalesce(r.diet, 0) >= coalesce(p.dietary, 0)
       and not exists (
         select 1
         from unnest(coalesce(p.allergies, '{}') || coalesce(p.dislikes, '{}')) as avoid(term)
         where trim(avoid.term) <> ''
           and (
             r.name ilike '%' || trim(avoid.term) || '%'
             or exists (
               select 1 from public.recipe_ingredients(r.ingredients) as ing
               where ing ilike '%' || trim(avoid.term) || '%'
             )
           )
       )
    from public.recipes r
    left join public.profiles p on p.id = p_user
    where r.id = p_recipe_id
  ), false);
$function$;

create or replace function public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare inserted_id int8;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  insert into plannedrecipes (meal_type, date, recipe_id, user_id)
  select p_mealtype, p_date, r.id, p_user_id
  from recipes r
  where r.meals @> ('[' || p_mealtype || ']')::jsonb
    and (r.user_id = p_user_id or r.id in (
          select lr.recipe_id from likedrecipes lr where lr.user_id = p_user_id
        ))
    and public.recipe_suits_user(r.id, p_user_id)
  order by
    exists (
      select 1 from plannedrecipes pr
      where pr.user_id = p_user_id and pr.active and pr.recipe_id = r.id
        and pr.date between p_date - 3 and p_date + 3
    ),
    random()
  limit 1
  returning id into inserted_id;

  -- null when the user has no suitable recipe for this meal type; the app handles it
  return (
    select jsonb_build_object(
      'plannedrecipe_id', pr.id,
      'date', pr.date,
      'meal_type', pr.meal_type,
      'recipe', jsonb_build_object(
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
      )
    )
    from plannedrecipes pr
    join recipes r on r.id = pr.recipe_id
    where pr.id = inserted_id
  );
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
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for d in select generate_series(p_start_date, p_end_date, interval '1 day')::date
  loop
    for m in select unnest(array[1,2,3])
    loop
      insert into plannedrecipes (meal_type, date, recipe_id, user_id)
      select m, d, r.id, p_user_id
      from recipes r
      where r.meals @> ('[' || m || ']')::jsonb
        and (r.user_id = p_user_id or r.id in (
               select lr.recipe_id from likedrecipes lr where lr.user_id = p_user_id
            ))
        and public.recipe_suits_user(r.id, p_user_id)
        and not exists (
            select 1 from plannedrecipes pr
            where pr.user_id = p_user_id and pr.date = d and pr.meal_type = m and pr.active = true
        )
      -- meals planned earlier in this loop are visible here, so this spreads recipes out
      order by
        exists (
          select 1 from plannedrecipes pr
          where pr.user_id = p_user_id and pr.active and pr.recipe_id = r.id
            and pr.date between d - 3 and d + 3
        ),
        random()
      limit 1;
    end loop;
  end loop;
end;
$function$;

revoke execute on function public.recipe_suits_user(bigint, uuid) from public, anon;
grant execute on function public.recipe_suits_user(bigint, uuid) to authenticated;

commit;
