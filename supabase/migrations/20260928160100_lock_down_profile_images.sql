-- profile-images: any signed-in user could update or delete anyone's image.
-- Restrict writes to the uploader. Reads stay open to signed-in users (avatars).

begin;

drop policy if exists "authenticated users can do all actions vejz8c_2" on storage.objects;
drop policy if exists "authenticated users can do all actions vejz8c_3" on storage.objects;

create policy "Users can update own profile images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-images' and owner = (select auth.uid()))
  with check (bucket_id = 'profile-images' and owner = (select auth.uid()));

create policy "Users can delete own profile images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-images' and owner = (select auth.uid()));

commit;
