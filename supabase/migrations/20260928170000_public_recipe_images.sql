-- The app stores and displays recipe images via getPublicUrl()
-- (/storage/v1/object/public/recipe-images/...), but the bucket was private,
-- so every recipe image returned 400. Recipe photos are not sensitive, file
-- names are random UUIDs, and recipes are already readable by all signed-in
-- users. Uploads remain restricted to signed-in users by existing policies.
-- Rollback: update storage.buckets set public = false where id = 'recipe-images';

update storage.buckets set public = true where id = 'recipe-images';
