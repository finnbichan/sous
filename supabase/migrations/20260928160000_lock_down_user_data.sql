-- Lock down per-user data.
--
-- Before this migration:
--   * profiles (incl. allergies), plannedrecipes and lists were readable by anyone, even signed out
--   * RPCs trusted the p_user_id sent by the client, so any user could read/write as any other user
--   * add_list_item (SECURITY DEFINER, callable by anon) skipped list access checks
--   * users could set profiles.premium on themselves
--   * share invites could be inserted/updated on behalf of other users
--
-- RPC signatures are unchanged so the current app keeps working; functions now reject
-- any p_user_id that is not the caller's own id.
-- Rollback: supabase/snapshots/20260928_before_lock_down.sql

begin;

-------------------------------------------------------------------------------
-- profiles: owner-only reads, no self-granted premium
-------------------------------------------------------------------------------
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, display_name, avatar_url, dietary, allergies, dislikes, portion_size, updated_at)
  on public.profiles to authenticated;
-- id is included because PostgREST upserts SET every posted column; the UPDATE policy
-- still pins id to auth.uid().
grant update (id, display_name, avatar_url, dietary, allergies, dislikes, portion_size, updated_at)
  on public.profiles to authenticated;

-- Display names of other users (recipe authors, invite senders) without exposing
-- allergies, dislikes or premium status.
create or replace function public.get_public_profiles(p_ids uuid[])
 returns table(id uuid, display_name text)
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select p.id, p.display_name
  from public.profiles p
  where p.id = any (p_ids)
    and auth.uid() is not null;
$function$;

-------------------------------------------------------------------------------
-- plannedrecipes: own rows only
-------------------------------------------------------------------------------
drop policy if exists "readplannedrecipes" on public.plannedrecipes;
drop policy if exists "Enable insert for authenticated users only" on public.plannedrecipes;
drop policy if exists "Enable update for authenticated users only" on public.plannedrecipes;

create policy "Users can view own planned recipes"
  on public.plannedrecipes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can plan recipes for themselves"
  on public.plannedrecipes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own planned recipes"
  on public.plannedrecipes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-------------------------------------------------------------------------------
-- lists: owner or member only
-------------------------------------------------------------------------------
drop policy if exists "Enable read access for all users" on public.lists;

create policy "Users can view lists they own or belong to"
  on public.lists for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.list_members lm
      where lm.list_id = lists.id
        and lm.user_id = (select auth.uid())
    )
  );

-------------------------------------------------------------------------------
-- item_categories: reference data, readable by signed-in users
-- (needed now that add_list_item runs as the caller)
-------------------------------------------------------------------------------
create policy "Signed-in users can read item categories"
  on public.item_categories for select
  to authenticated
  using (true);

-------------------------------------------------------------------------------
-- share_invites: can only send as yourself; only the receiver can respond
-------------------------------------------------------------------------------
drop policy if exists "Enable insert for authenticated users only" on public.share_invites;
drop policy if exists "Enable update for users based on user id" on public.share_invites;

create policy "Users can send invites as themselves"
  on public.share_invites for insert
  to authenticated
  with check (sender = (select auth.uid()) and receiver <> (select auth.uid()));

create policy "Receivers can respond to invites"
  on public.share_invites for update
  to authenticated
  using (receiver = (select auth.uid()))
  with check (receiver = (select auth.uid()));

-------------------------------------------------------------------------------
-- RPCs: reject impersonation, pin search_path
-------------------------------------------------------------------------------
create or replace function public.add_list_item(p_list_id uuid, p_item text, p_quantity smallint, p_user_id uuid)
 returns list_items
 language plpgsql
 security invoker
 set search_path = public, pg_temp
as $function$
declare
  matched_category text;
  inserted_row list_items;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select ic.category
  into matched_category
  from item_categories ic
  where p_item ~* ('\y' || ic.pattern || '\y')
  order by length(ic.pattern) desc
  limit 1;

  -- list_items INSERT policy enforces that the caller owns or can edit p_list_id
  insert into list_items (list_id, item, quantity, user_id, category)
  values (p_list_id, p_item, p_quantity, auth.uid(), matched_category)
  returning * into inserted_row;

  return inserted_row;
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
  values (p_mealtype, p_date, p_recipe_id, p_user_id)
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

create or replace function public.explore_recipes(p_user_id uuid, already_on_page jsonb)
 returns table(recipe_id bigint, name text, ease bigint, cuisine bigint, diet bigint, description text, steps jsonb, ingredients jsonb, meals jsonb, image_uri text, user_id uuid, display_name text)
 language plpgsql
 set search_path = public, pg_temp
as $function$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id, p.display_name
  from recipes r
  left join lateral public.get_public_profiles(array[r.user_id]) p on true
  where r.user_id <> p_user_id
    and r.image_uri is not null
    and r.description is not null
    and not (r.id = any (select jsonb_array_elements_text(already_on_page)::int))
    and r.id not in (select lr.recipe_id from likedrecipes lr where lr.user_id = p_user_id)
  order by random()
  limit 10;
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
        and not exists (
            select 1 from plannedrecipes pr
            where pr.user_id = p_user_id and pr.date = d and pr.meal_type = m and pr.active = true
        )
      order by random()
      limit 1;
    end loop;
  end loop;
end;
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
      where pr.user_id = p_user_id
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
  where r.user_id = p_user_id
     or r.id in (select lr.recipe_id from likedrecipes lr where lr.user_id = p_user_id)
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
      with user_recipes as (
        select r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id
        from recipes r
        where r.user_id = p_user_id
           or r.id in (select lr.recipe_id from likedrecipes lr where lr.user_id = p_user_id)
      ),
      ranked as (
        select ur.*
        from user_recipes ur
        where ur.name % p_search_term
        order by similarity(ur.name, p_search_term) desc
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
  order by random()
  limit 1
  returning id into inserted_id;

  -- null when the user has no recipe for this meal type; the app must handle it
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

-- Remaining functions keep their bodies; just pin search_path.
alter function public.get_invites() set search_path = public, pg_temp;
alter function public.invite_user_by_email(text) set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.create_default_lists() set search_path = public, pg_temp;
alter function public.create_default_list() set search_path = public, pg_temp;
alter function public.handle_new_recipe() set search_path = public, pg_temp;
alter function public.auto_categorise_list_item() set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;

-------------------------------------------------------------------------------
-- Execute privileges: nothing for anon; trigger functions not callable via the API
-------------------------------------------------------------------------------
revoke execute on function
  public.add_list_item(uuid, text, smallint, uuid),
  public.add_single_planned_recipe(uuid, integer, date, integer),
  public.explore_recipes(uuid, jsonb),
  public.generate_mealplans_between_dates(uuid, date, date),
  public.get_invites(),
  public.get_planned_recipes(uuid, date, date),
  public.get_public_profiles(uuid[]),
  public.get_user_recipes(uuid),
  public.invite_user_by_email(text),
  public.search_recipes_by_name(text, uuid),
  public.suggest_recipe(uuid, integer, date)
from public, anon;

grant execute on function
  public.add_list_item(uuid, text, smallint, uuid),
  public.add_single_planned_recipe(uuid, integer, date, integer),
  public.explore_recipes(uuid, jsonb),
  public.generate_mealplans_between_dates(uuid, date, date),
  public.get_invites(),
  public.get_planned_recipes(uuid, date, date),
  public.get_public_profiles(uuid[]),
  public.get_user_recipes(uuid),
  public.invite_user_by_email(text),
  public.search_recipes_by_name(text, uuid),
  public.suggest_recipe(uuid, integer, date)
to authenticated;

revoke execute on function
  public.handle_new_user(),
  public.create_default_lists(),
  public.create_default_list(),
  public.handle_new_recipe(),
  public.auto_categorise_list_item(),
  public.update_updated_at()
from public, anon, authenticated;

commit;
