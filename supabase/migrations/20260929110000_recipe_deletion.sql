-- Recipe deletion and "remove from my recipes".
--   * Deleting a recipe someone had liked failed: likedrecipes referenced
--     recipes without ON DELETE CASCADE. (plannedrecipes already cascades.)
--   * Legacy likes couldn't be removed: likedrecipes had no DELETE policy.
--     (Explore is gone, so nothing new gets liked; this only clears old likes.)
--
-- Rollback: drop policy "Users can remove their own likes" on likedrecipes;
--   recreate likedrecipes_recipe_id_fkey without on delete cascade.

begin;

alter table public.likedrecipes drop constraint likedrecipes_recipe_id_fkey;
alter table public.likedrecipes
  add constraint likedrecipes_recipe_id_fkey
  foreign key (recipe_id) references public.recipes(id) on delete cascade;

create policy "Users can remove their own likes"
  on public.likedrecipes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
