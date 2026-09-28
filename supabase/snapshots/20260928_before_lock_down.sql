-- Rollback for 20260928160000_lock_down_user_data + 20260928160100_lock_down_profile_images.
-- Restores the policies, grants and function definitions captured from production on 2026-09-28.
-- WARNING: restoring this re-opens the data leaks described in those migrations.

begin;

-- drop policies/functions added by the migrations
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can view own planned recipes" on public.plannedrecipes;
drop policy if exists "Users can plan recipes for themselves" on public.plannedrecipes;
drop policy if exists "Users can update own planned recipes" on public.plannedrecipes;
drop policy if exists "Users can view lists they own or belong to" on public.lists;
drop policy if exists "Signed-in users can read item categories" on public.item_categories;
drop policy if exists "Users can send invites as themselves" on public.share_invites;
drop policy if exists "Receivers can respond to invites" on public.share_invites;

-- original policies
drop policy if exists "Enable read access for all users" on public.lists;
create policy "Enable read access for all users" on public.lists for select to public
  using (true);
drop policy if exists "Enable insert for authenticated users only" on public.plannedrecipes;
create policy "Enable insert for authenticated users only" on public.plannedrecipes for insert to authenticated
  with check (true);
drop policy if exists "Enable update for authenticated users only" on public.plannedrecipes;
create policy "Enable update for authenticated users only" on public.plannedrecipes for update to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check (true);
drop policy if exists "readplannedrecipes" on public.plannedrecipes;
create policy "readplannedrecipes" on public.plannedrecipes for select to public
  using (true);
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone." on public.profiles for select to public
  using (true);
drop policy if exists "Enable insert for authenticated users only" on public.share_invites;
create policy "Enable insert for authenticated users only" on public.share_invites for insert to authenticated
  with check (true);
drop policy if exists "Enable update for users based on user id" on public.share_invites;
create policy "Enable update for users based on user id" on public.share_invites for update to public
  using ((( SELECT auth.uid() AS uid) = ANY (ARRAY[sender, receiver])))
  with check (true);

-- storage (profile-images)
drop policy if exists "Users can update own profile images" on storage.objects;
drop policy if exists "Users can delete own profile images" on storage.objects;
create policy "authenticated users can do all actions vejz8c_2" on storage.objects for update to authenticated
  using ((bucket_id = 'profile-images'::text));
create policy "authenticated users can do all actions vejz8c_3" on storage.objects for delete to authenticated
  using ((bucket_id = 'profile-images'::text));

-- grants
grant insert, update on public.profiles to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
drop function if exists public.get_public_profiles(uuid[]);

-- original function definitions (search_path unset)
-- add_list_item secdef=True
CREATE OR REPLACE FUNCTION public.add_list_item(p_list_id uuid, p_item text, p_quantity smallint, p_user_id uuid)
 RETURNS list_items
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  matched_category text;
  inserted_row list_items;
BEGIN
  SELECT ic.category
  INTO matched_category
  FROM item_categories ic
  WHERE p_item ~* ('\y' || ic.pattern || '\y')
  ORDER BY length(ic.pattern) DESC
  LIMIT 1;

  INSERT INTO list_items (list_id, item, quantity, user_id, category)
  VALUES (p_list_id, p_item, p_quantity, p_user_id, matched_category)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$function$
;

-- add_single_planned_recipe secdef=False
CREATE OR REPLACE FUNCTION public.add_single_planned_recipe(p_user_id uuid, p_mealtype integer, p_date date, p_recipe_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE inserted_id INT;
BEGIN



    INSERT INTO plannedrecipes (meal_type, date, recipe_id, user_id)
    VALUES (p_mealtype, p_date, p_recipe_id, p_user_id)
    RETURNING id INTO inserted_id;

RETURN (
        SELECT jsonb_build_object(
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
    FROM plannedrecipes pr
    JOIN recipes r ON r.id = pr.recipe_id
    WHERE pr.id = inserted_id
);
END;
$function$
;

-- auto_categorise_list_item secdef=False
CREATE OR REPLACE FUNCTION public.auto_categorise_list_item()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  matched_category text := NULL;
BEGIN
  IF NEW.item IS NULL THEN
    NEW.category := NULL;
    RETURN NEW;
  END IF;

  SELECT ic.category
  INTO matched_category
  FROM public.item_categories AS ic
  WHERE NEW.item ILIKE '%' || ic.pattern || '%'
  ORDER BY length(ic.pattern) DESC
  LIMIT 1;

  NEW.category := matched_category;
  RETURN NEW;
END;
$function$
;

-- create_default_list secdef=True
CREATE OR REPLACE FUNCTION public.create_default_list()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into lists (owner_id, name)
  values (new.id, 'Personal');
  return new;
end;
$function$
;

-- create_default_lists secdef=True
CREATE OR REPLACE FUNCTION public.create_default_lists()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  INSERT INTO public.lists (owner_id, name)
  VALUES 
    (NEW.id, 'Personal'),
    (NEW.id, 'Shared');

  RETURN NEW;
END;$function$
;

-- explore_recipes secdef=False
CREATE OR REPLACE FUNCTION public.explore_recipes(p_user_id uuid, already_on_page jsonb)
 RETURNS TABLE(recipe_id bigint, name text, ease bigint, cuisine bigint, diet bigint, description text, steps jsonb, ingredients jsonb, meals jsonb, image_uri text, user_id uuid, display_name text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id, p.display_name
    FROM recipes r
    LEFT JOIN profiles p
    ON r.user_id = p.id
    WHERE r.user_id <> p_user_id
    AND r.image_uri IS NOT NULL
    AND r.description IS NOT NULL
    AND NOT (r.id = ANY (SELECT jsonb_array_elements_text(already_on_page)::INT))
    AND r.id NOT IN (SELECT lr.recipe_id FROM likedrecipes lr WHERE lr.user_id = p_user_id)
    ORDER BY RANDOM()
    LIMIT 10;
END;
$function$
;

-- generate_mealplans_between_dates secdef=False
CREATE OR REPLACE FUNCTION public.generate_mealplans_between_dates(p_user_id uuid, p_start_date date, p_end_date date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$DECLARE 
    d DATE;
    m INT;
BEGIN
    FOR d IN SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date
    LOOP
        FOR m IN SELECT unnest(ARRAY[1,2,3])
        LOOP
            INSERT INTO plannedrecipes (meal_type, date, recipe_id, user_id)
            SELECT m, d, r.id, p_user_id
            FROM recipes r
            WHERE r.meals @> ('[' || m || ']')::jsonb
              AND (r.user_id = p_user_id OR r.id IN (
                     SELECT lr.recipe_id FROM likedrecipes lr WHERE lr.user_id = p_user_id
                  ))
              AND NOT EXISTS (
                  SELECT 1 FROM plannedrecipes pr 
                  WHERE pr.user_id = p_user_id AND pr.date = d AND pr.meal_type = m AND pr.active = true
              )
            ORDER BY RANDOM()
            LIMIT 1;
        END LOOP;
    END LOOP;
END;$function$
;

-- get_invites secdef=True
CREATE OR REPLACE FUNCTION public.get_invites()
 RETURNS TABLE(invite_id bigint, sender_name text, status smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
  select
    si.id,
    p.display_name,
    si.status
  from public.share_invites si
  join public.profiles p on p.id = si.sender
  where si.receiver = auth.uid()
    and si.status in (0, 1);
end;
$function$
;

-- get_planned_recipes secdef=False
CREATE OR REPLACE FUNCTION public.get_planned_recipes(p_user_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$

BEGIN
    RETURN COALESCE(
        (
        SELECT jsonb_agg(
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
        FROM plannedrecipes pr
        JOIN recipes r ON r.id = pr.recipe_id
        WHERE pr.user_id = p_user_id
          AND pr.active = true
          AND pr.date >= p_start_date
          AND pr.date <= p_end_date
    ), 
    '[]'::jsonb
    );
END;
$function$
;

-- get_user_recipes secdef=False
CREATE OR REPLACE FUNCTION public.get_user_recipes(p_user_id uuid)
 RETURNS TABLE(recipe_id bigint, name text, ease bigint, cuisine bigint, diet bigint, description text, steps jsonb, ingredients jsonb, meals jsonb, image_uri text, user_id uuid)
 LANGUAGE plpgsql
AS $function$BEGIN 
    RETURN QUERY
    SELECT r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id
    FROM recipes r
    WHERE r.user_id = p_user_id
    OR r.id in (
        SELECT lr.recipe_id FROM likedrecipes lr WHERE lr.user_id = p_user_id
    )
    ORDER BY r.name;
END;$function$
;

-- handle_new_recipe secdef=False
CREATE OR REPLACE FUNCTION public.handle_new_recipe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$begin
  insert into public.recipeinfo (id, description, steps)
  values (new.id, new.description, new.raw_user_meta_data->>'steps');
  return new;
end;$function$
;

-- handle_new_user secdef=True
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$function$
;

-- invite_user_by_email secdef=True
CREATE OR REPLACE FUNCTION public.invite_user_by_email(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_receiver uuid;
begin
  select id into v_receiver
  from auth.users
  where email = p_email;

  if v_receiver is null then
    raise exception 'No user found with email %', p_email;
  end if;

  if v_receiver = auth.uid() then
    raise exception 'Cannot invite yourself';
  end if;

  if exists (
    select 1 from public.share_invites
    where sender = auth.uid()
      and receiver = v_receiver
      and status = ANY(ARRAY[0, 1]) -- 0 = pending, 1 = accepted
  ) then
    raise exception 'Invite already exists for this user';
  end if;

  insert into public.share_invites (receiver, status)
  values (v_receiver, 0);
end;
$function$
;

-- search_recipes_by_name secdef=False
CREATE OR REPLACE FUNCTION public.search_recipes_by_name(p_search_term text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$

BEGIN

PERFORM set_limit(0.1);

 RETURN COALESCE(
    (
        WITH user_recipes AS (
            SELECT r.id, r.name, r.ease, r.cuisine, r.diet, r.description, r.steps, r.ingredients, r.meals, r.image_uri, r.user_id
            FROM recipes r
            WHERE r.user_id = p_user_id
            OR r.id in (
                SELECT lr.recipe_id FROM likedrecipes lr WHERE lr.user_id = p_user_id
            )
        ),
        ranked AS (
            SELECT ur.*
            FROM user_recipes ur
            WHERE ur.name % p_search_term
            ORDER BY similarity(ur.name, p_search_term) DESC
            LIMIT 10
        )
        SELECT jsonb_agg(
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
    FROM
        ranked ra
    ), 
    '[]'::jsonb
    );
END;
$function$
;

-- suggest_recipe secdef=False
CREATE OR REPLACE FUNCTION public.suggest_recipe(p_user_id uuid, p_mealtype integer, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$

DECLARE inserted_id INT8;

BEGIN
    INSERT INTO plannedrecipes (meal_type, date, recipe_id, user_id)
    SELECT p_mealtype, p_date, r.id, p_user_id
    FROM recipes r
    WHERE r.meals @> ('[' || p_mealtype || ']')::jsonb
    AND ( r.user_id = p_user_id
    OR r.id IN (
        SELECT lr.recipe_id FROM likedrecipes lr WHERE lr.user_id = p_user_id
    ))
    ORDER BY RANDOM()
    LIMIT 1
    RETURNING id INTO inserted_id;
RETURN (
        SELECT jsonb_build_object(
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
    FROM plannedrecipes pr
    JOIN recipes r ON r.id = pr.recipe_id
    WHERE pr.id = inserted_id
);
END;
$function$
;

-- update_updated_at secdef=False
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


alter function public.get_invites() reset search_path;
alter function public.invite_user_by_email(text) reset search_path;
alter function public.handle_new_user() reset search_path;
alter function public.create_default_lists() reset search_path;
alter function public.create_default_list() reset search_path;
alter function public.handle_new_recipe() reset search_path;
alter function public.auto_categorise_list_item() reset search_path;
alter function public.update_updated_at() reset search_path;

commit;
