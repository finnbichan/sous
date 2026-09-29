-- Shared household: while two people share (an accepted share_invite), they
-- share one meal plan and one recipe pool.
--
--   * The plan belongs to the invite sender (same rule as the Shared list);
--     both people read and write it. The receiver's own plan is untouched and
--     comes back when sharing stops.
--   * Recipe pool = recipes owned or liked by either person (Explore is gone,
--     so the partner's recipes are the only other recipes anyone sees).
--   * Suggestions must suit both people's diet, allergies and dislikes.
--   * recipes are no longer readable by every signed-in user: only the
--     household's pool, plus anything in the household's plan history.
--
-- RPC signatures are unchanged; functions still reject p_user_id <> auth.uid().
-- Rollback: re-create the previous function versions from
--   20260928200000_preference_aware_suggestions.sql (suggest_recipe,
--   generate_mealplans_between_dates, recipe_suits_user),
--   20260928190000_create_list_from_meal_plan.sql (create_list),
--   20260928160000_lock_down_user_data.sql (the rest, and plannedrecipes policies);
--   restore recipes policy "Enable SELECT for authenticated users" (using true);
--   drop the household_* / recipe_visible functions.

begin;

-------------------------------------------------------------------------------
-- Household helpers. No user argument: they only describe the caller's household.
-------------------------------------------------------------------------------
create or replace function public.household_members()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select auth.uid()
  where auth.uid() is not null
  union
  select case when si.sender = auth.uid() then si.receiver else si.sender end
  from public.share_invites si
  where si.status = 1 and auth.uid() in (si.sender, si.receiver);
$function$;

-- Whose plan the household uses: the sender of the active share, else yourself.
create or replace function public.household_owner()
 returns uuid
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select coalesce(
    (select si.sender from public.share_invites si
     where si.status = 1 and auth.uid() in (si.sender, si.receiver)
     order by si.created_at desc limit 1),
    auth.uid()
  );
$function$;

-- Recipes the household can plan with: owned or liked by any member.
create or replace function public.household_recipe_ids()
 returns setof bigint
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select r.id from public.recipes r
  where r.user_id in (select public.household_members())
  union
  select lr.recipe_id from public.likedrecipes lr
  where lr.user_id in (select public.household_members());
$function$;

-- Can the caller see this recipe? Household pool, or referenced by any plan
-- (current or past) of the household, so meal history keeps its recipes.
create or replace function public.recipe_visible(p_recipe_id bigint)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select p_recipe_id in (select public.household_recipe_ids())
      or exists (
        select 1 from public.plannedrecipes pr
        where pr.recipe_id = p_recipe_id
          and pr.user_id in (select public.household_members())
      );
$function$;

-- Now security definer so it can read the partner's preferences; only answers
-- for members of the caller's household.
create or replace function public.recipe_suits_user(p_recipe_id bigint, p_user uuid)
 returns boolean
 language sql
 stable
 security definer
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
      and p_user in (select public.household_members())
  ), false);
$function$;

-- Suits everyone in the caller's household.
create or replace function public.recipe_suits_household(p_recipe_id bigint)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select not exists (
    select 1 from public.household_members() m
    where not public.recipe_suits_user(p_recipe_id, m)
  );
$function$;

-------------------------------------------------------------------------------
-- Policies
-------------------------------------------------------------------------------
drop policy if exists "Enable SELECT for authenticated users" on public.recipes;
create policy "Users can view household recipes"
  on public.recipes for select
  to authenticated
  using (public.recipe_visible(id));

drop policy if exists "Users can view own planned recipes" on public.plannedrecipes;
drop policy if exists "Users can plan recipes for themselves" on public.plannedrecipes;
drop policy if exists "Users can update own planned recipes" on public.plannedrecipes;

create policy "Users can view own and household planned recipes"
  on public.plannedrecipes for select
  to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.household_owner()));

create policy "Users can plan for themselves or their household"
  on public.plannedrecipes for insert
  to authenticated
  with check (user_id = (select auth.uid()) or user_id = (select public.household_owner()));

create policy "Users can update own and household planned recipes"
  on public.plannedrecipes for update
  to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.household_owner()))
  with check (user_id = (select auth.uid()) or user_id = (select public.household_owner()));

-------------------------------------------------------------------------------
-- RPCs: plan = household owner's plan; pool = household recipes
-------------------------------------------------------------------------------
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
      select jsonb_agg(
        jsonb_build_object(
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
      )
      from plannedrecipes pr
      join recipes r on r.id = pr.recipe_id
      where pr.user_id = public.household_owner()
        and pr.active = true
        and pr.date >= p_start_date
        and pr.date <= p_end_date
    ),
    '[]'::jsonb
  );
end;
$function$;

create or replace function public.get_user_recipes(p_user_id uuid)
 returns table(recipe_id bigint, name text, ease bigint, cuisine bigint, diet bigint, description text, steps jsonb, ingredients jsonb, meals jsonb, image_uri text, user_id uuid)
 language plpgsql
 set search_path = public, pg_temp
as $function$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id
  from recipes r
  where r.id in (select public.household_recipe_ids())
  order by r.name;
end;
$function$;

create or replace function public.search_recipes_by_name(p_search_term text, p_user_id uuid)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  perform set_limit(0.1);

  return coalesce(
    (
      with ranked as (
        select r.*
        from recipes r
        where r.id in (select public.household_recipe_ids())
          and r.name % p_search_term
        order by similarity(r.name, p_search_term) desc
        limit 10
      )
      select jsonb_agg(
        jsonb_build_object(
          'recipe_id', ra.id,
          'name', ra.name,
          'ease', ra.ease,
          'cuisine', ra.cuisine,
          'diet', ra.diet,
          'description', ra.description,
          'steps', ra.steps,
          'ingredients', ra.ingredients,
          'meals', ra.meals,
          'image_uri', ra.image_uri,
          'user_id', ra.user_id
        )
      )
      from ranked ra
    ),
    '[]'::jsonb
  );
end;
$function$;

create or replace function public.add_single_planned_recipe(p_user_id uuid, p_mealtype integer, p_date date, p_recipe_id integer)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare inserted_id int;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  insert into plannedrecipes (meal_type, date, recipe_id, user_id)
  values (p_mealtype, p_date, p_recipe_id, public.household_owner())
  returning id into inserted_id;

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

create or replace function public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 returns jsonb
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare
  inserted_id int8;
  v_owner uuid := public.household_owner();
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  insert into plannedrecipes (meal_type, date, recipe_id, user_id)
  select p_mealtype, p_date, r.id, v_owner
  from recipes r
  where r.meals @> ('[' || p_mealtype || ']')::jsonb
    and r.id in (select public.household_recipe_ids())
    and public.recipe_suits_household(r.id)
  order by
    exists (
      select 1 from plannedrecipes pr
      where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
        and pr.date between p_date - 3 and p_date + 3
    ),
    random()
  limit 1
  returning id into inserted_id;

  -- null when the household has no suitable recipe for this meal type
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
  v_owner uuid := public.household_owner();
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for d in select generate_series(p_start_date, p_end_date, interval '1 day')::date
  loop
    for m in select unnest(array[1,2,3])
    loop
      insert into plannedrecipes (meal_type, date, recipe_id, user_id)
      select m, d, r.id, v_owner
      from recipes r
      where r.meals @> ('[' || m || ']')::jsonb
        and r.id in (select public.household_recipe_ids())
        and public.recipe_suits_household(r.id)
        and not exists (
            select 1 from plannedrecipes pr
            where pr.user_id = v_owner and pr.date = d and pr.meal_type = m and pr.active = true
        )
      order by
        exists (
          select 1 from plannedrecipes pr
          where pr.user_id = v_owner and pr.active and pr.recipe_id = r.id
            and pr.date between d - 3 and d + 3
        ),
        random()
      limit 1;
    end loop;
  end loop;
end;
$function$;

create or replace function public.create_list(p_list_id uuid, p_start_date date, p_end_date date)
 returns jsonb
 language plpgsql
 security invoker
 set search_path = public, pg_temp
as $function$
declare
  v_me uuid := auth.uid();
  v_added int := 0;
  v_merged int := 0;
  r record;
  v_existing list_items.id%type;
  v_category text;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not exists (select 1 from lists where id = p_list_id) then
    raise exception 'List not found' using errcode = 'P0002';
  end if;

  for r in
    select min(ing) as item, count(*)::smallint as qty
    from plannedrecipes pr
    join recipes rec on rec.id = pr.recipe_id
    cross join lateral recipe_ingredients(rec.ingredients) ing
    where pr.user_id = public.household_owner()
      and pr.active = true
      and pr.date between p_start_date and p_end_date
    group by lower(ing)
    order by 1
  loop
    select li.id into v_existing
    from list_items li
    where li.list_id = p_list_id
      and li.checked = false
      and lower(li.item) = lower(r.item)
    limit 1;

    if v_existing is not null then
      update list_items set quantity = quantity + r.qty where id = v_existing;
      v_merged := v_merged + 1;
    else
      select ic.category into v_category
      from item_categories ic
      where r.item ~* ('\y' || ic.pattern || '\y')
      order by length(ic.pattern) desc
      limit 1;

      insert into list_items (list_id, item, quantity, user_id, category)
      values (p_list_id, r.item, r.qty, v_me, v_category);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'merged', v_merged);
end;
$function$;

-------------------------------------------------------------------------------
-- Privileges
-------------------------------------------------------------------------------
revoke execute on function
  public.household_members(),
  public.household_owner(),
  public.household_recipe_ids(),
  public.recipe_visible(bigint),
  public.recipe_suits_household(bigint)
from public, anon;

grant execute on function
  public.household_members(),
  public.household_owner(),
  public.household_recipe_ids(),
  public.recipe_visible(bigint),
  public.recipe_suits_household(bigint)
to authenticated;

commit;
