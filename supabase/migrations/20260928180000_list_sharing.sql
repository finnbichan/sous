-- List sharing.
--
-- share_invites.status: 0 = pending, 1 = accepted, 2 = rejected, 3 = ended (removed/cancelled)
-- Accepting an invite makes the receiver an editor of the sender's 'Shared' list.
-- A user can be in at most one active (accepted) share at a time.
--
-- Rollback:
--   drop function public.accept_invite(bigint), public.reject_invite(bigint),
--     public.remove_sharing(bigint), public.get_my_lists();
--   restore get_invites / invite_user_by_email / list_items delete policy from
--   supabase/snapshots/20260928_before_lock_down.sql;
--   alter share_invites status check back to (0, 1, 2) after clearing status 3 rows.

begin;

alter table public.share_invites drop constraint share_invites_status_check;
alter table public.share_invites add constraint share_invites_status_check
  check (status = any (array[0, 1, 2, 3]));

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

-- The accepted share (if any) the given user is part of, in either direction.
create or replace function public.active_share_for(p_user uuid)
 returns public.share_invites
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select si.*
  from public.share_invites si
  where si.status = 1
    and p_user in (si.sender, si.receiver)
  order by si.created_at desc
  limit 1;
$function$;

-- The owner's 'Shared' list, created if it doesn't exist yet.
create or replace function public.shared_list_of(p_owner uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_list uuid;
begin
  select id into v_list
  from public.lists
  where owner_id = p_owner and name = 'Shared'
  order by created_at
  limit 1;

  if v_list is null then
    insert into public.lists (owner_id, name) values (p_owner, 'Shared')
    returning id into v_list;
  end if;

  return v_list;
end;
$function$;

-------------------------------------------------------------------------------
-- Lists the app shows: own Personal list, and either the shared list you've
-- joined or your own Shared list. Creates missing lists (older accounts only
-- got a Personal list, and clients can't insert into lists directly).
-------------------------------------------------------------------------------
create or replace function public.get_my_lists()
 returns table(kind text, id uuid, name text, owner_id uuid, shared_with text)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_me uuid := auth.uid();
  v_personal uuid;
  v_shared uuid;
  v_share public.share_invites;
  v_other uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select l.id into v_personal
  from public.lists l
  where l.owner_id = v_me and l.name = 'Personal'
  order by l.created_at
  limit 1;
  if v_personal is null then
    insert into public.lists (owner_id, name) values (v_me, 'Personal')
    returning lists.id into v_personal;
  end if;

  v_share := public.active_share_for(v_me);
  if v_share.id is not null then
    -- the shared list always belongs to whoever sent the invite
    v_shared := public.shared_list_of(v_share.sender);
    v_other := case when v_share.sender = v_me then v_share.receiver else v_share.sender end;
  else
    v_shared := public.shared_list_of(v_me);
  end if;

  return query
  select 'Personal'::text, l.id, l.name, l.owner_id, null::text
  from public.lists l where l.id = v_personal
  union all
  select 'Shared'::text, l.id, l.name, l.owner_id,
         (select p.display_name from public.profiles p where p.id = v_other)
  from public.lists l where l.id = v_shared;
end;
$function$;

-------------------------------------------------------------------------------
-- Invites
-------------------------------------------------------------------------------

-- Both directions, so the sender can see pending and active shares too.
drop function public.get_invites();
create function public.get_invites()
 returns table(invite_id bigint, other_name text, status smallint, is_sender boolean)
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select
    si.id,
    p.display_name,
    si.status,
    si.sender = auth.uid()
  from public.share_invites si
  join public.profiles p
    on p.id = case when si.sender = auth.uid() then si.receiver else si.sender end
  where auth.uid() in (si.sender, si.receiver)
    and si.status in (0, 1)
  order by si.created_at desc;
$function$;

create or replace function public.invite_user_by_email(p_email text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_me uuid := auth.uid();
  v_receiver uuid;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if (public.active_share_for(v_me)).id is not null then
    raise exception 'You are already sharing a list. Remove that share first.';
  end if;

  select id into v_receiver
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_receiver is null then
    raise exception 'No user found with email %', p_email;
  end if;

  if v_receiver = v_me then
    raise exception 'Cannot invite yourself';
  end if;

  if exists (
    select 1 from public.share_invites
    where status = 0
      and ((sender = v_me and receiver = v_receiver)
        or (sender = v_receiver and receiver = v_me))
  ) then
    raise exception 'There is already a pending invite between you and this user';
  end if;

  insert into public.share_invites (sender, receiver, status)
  values (v_me, v_receiver, 0);
end;
$function$;

create or replace function public.accept_invite(p_invite_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_me uuid := auth.uid();
  v_invite public.share_invites;
begin
  select * into v_invite
  from public.share_invites
  where id = p_invite_id and receiver = v_me and status = 0
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if (public.active_share_for(v_me)).id is not null
     or (public.active_share_for(v_invite.sender)).id is not null then
    raise exception 'You or the sender are already sharing a list';
  end if;

  insert into public.list_members (list_id, user_id, role)
  values (public.shared_list_of(v_invite.sender), v_me, 'editor')
  on conflict (list_id, user_id) do update set role = 'editor';

  update public.share_invites set status = 1 where id = p_invite_id;

  -- close any other pending invite between the same two people
  update public.share_invites
  set status = 3
  where status = 0
    and id <> p_invite_id
    and ((sender = v_invite.sender and receiver = v_me)
      or (sender = v_me and receiver = v_invite.sender));
end;
$function$;

create or replace function public.reject_invite(p_invite_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  update public.share_invites
  set status = 2
  where id = p_invite_id and receiver = auth.uid() and status = 0;

  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
end;
$function$;

-- Ends an active share (either side) or cancels a pending invite you sent.
create or replace function public.remove_sharing(p_invite_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_me uuid := auth.uid();
  v_invite public.share_invites;
begin
  select * into v_invite
  from public.share_invites
  where id = p_invite_id
    and (
      (status = 1 and v_me in (sender, receiver))
      or (status = 0 and sender = v_me)
    )
  for update;

  if v_invite.id is null then
    raise exception 'Share not found' using errcode = 'P0002';
  end if;

  if v_invite.status = 1 then
    delete from public.list_members
    where user_id = v_invite.receiver
      and list_id in (
        select id from public.lists where owner_id = v_invite.sender and name = 'Shared'
      );
  end if;

  update public.share_invites set status = 3 where id = p_invite_id;
end;
$function$;

-------------------------------------------------------------------------------
-- list_items: anyone who can edit a list can delete its items (Clear completed
-- on a shared list), not just whoever added each item.
-------------------------------------------------------------------------------
drop policy if exists "Enable delete for users based on user_id" on public.list_items;

create policy "Users can delete items in lists they own or edit"
  on public.list_items for delete
  to public
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and (
          lists.owner_id = (select auth.uid())
          or exists (
            select 1 from public.list_members
            where list_members.list_id = lists.id
              and list_members.user_id = (select auth.uid())
              and list_members.role = any (array['editor', 'owner'])
          )
        )
    )
  );

-------------------------------------------------------------------------------
-- Privileges
-------------------------------------------------------------------------------
revoke execute on function
  public.active_share_for(uuid),
  public.shared_list_of(uuid)
from public, anon, authenticated;

revoke execute on function
  public.get_my_lists(),
  public.get_invites(),
  public.accept_invite(bigint),
  public.reject_invite(bigint),
  public.remove_sharing(bigint)
from public, anon;

grant execute on function
  public.get_my_lists(),
  public.get_invites(),
  public.accept_invite(bigint),
  public.reject_invite(bigint),
  public.remove_sharing(bigint)
to authenticated;

commit;
