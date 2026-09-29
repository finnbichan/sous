-- Recipe embeddings for taste-based suggestions.
--
-- recipes.embedding is a 384-dimension gte-small vector of the recipe's name,
-- description and ingredients, written by the embed-recipe edge function when a
-- recipe is saved (and by a backfill). Editing those fields clears it so it gets
-- regenerated. Recipes without an embedding are still suggested, just not
-- ranked by taste.
--
-- Rollback: drop trigger recipes_embedding_stale on public.recipes;
--   drop function private.clear_stale_embedding();
--   alter table public.recipes drop column embedding, drop column embedded_at;

begin;

create extension if not exists vector with schema extensions;

alter table public.recipes
  add column embedding extensions.vector(384),
  add column embedded_at timestamptz;

create or replace function private.clear_stale_embedding()
 returns trigger
 language plpgsql
 set search_path = public, pg_temp
as $function$
begin
  if new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.ingredients is distinct from old.ingredients then
    new.embedding := null;
    new.embedded_at := null;
  end if;
  return new;
end;
$function$;

create trigger recipes_embedding_stale
  before update on public.recipes
  for each row execute function private.clear_stale_embedding();

commit;
