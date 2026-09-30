-- "Generate a list" from the meal plan: the app has always called
-- rpc('create_list'), but the function never existed.
--
-- Adds the ingredients of the caller's planned meals in a date range to a list
-- the caller can edit (Personal or Shared). Runs as the caller, so the existing
-- plannedrecipes / list_items policies decide what it can read and write.
-- Identical items are merged: repeated ingredients, and ingredients already
-- unchecked on the list, bump quantity instead of adding a new row.
--
-- Rollback: drop function public.create_list(uuid, date, date);
--           drop function public.recipe_ingredients(jsonb);

begin;

-- recipes.ingredients has been stored both as a jsonb array and as a jsonb
-- string holding JSON-encoded text; return the entries either way.
create or replace function public.recipe_ingredients(p_ingredients jsonb)
 returns setof text
 language plpgsql
 immutable
 set search_path = public, pg_temp
as $function$
declare
  v_list jsonb := p_ingredients;
begin
  if jsonb_typeof(v_list) = 'string' then
    begin
      v_list := (v_list #>> '{}')::jsonb;
    exception when others then
      return next v_list #>> '{}';
      return;
    end;
  end if;

  if jsonb_typeof(v_list) = 'array' then
    return query
    select trim(e)
    from jsonb_array_elements_text(v_list) e
    where e is not null and trim(e) <> '';
  elsif jsonb_typeof(v_list) = 'string' and trim(v_list #>> '{}') <> '' then
    return next trim(v_list #>> '{}');
  end if;
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
    where pr.user_id = v_me
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

      -- list_items INSERT policy enforces that the caller can edit p_list_id
      insert into list_items (list_id, item, quantity, user_id, category)
      values (p_list_id, r.item, r.qty, v_me, v_category);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'merged', v_merged);
end;
$function$;

revoke execute on function public.create_list(uuid, date, date) from public, anon;
grant execute on function public.create_list(uuid, date, date) to authenticated;
revoke execute on function public.recipe_ingredients(jsonb) from public, anon;
grant execute on function public.recipe_ingredients(jsonb) to authenticated;

commit;
