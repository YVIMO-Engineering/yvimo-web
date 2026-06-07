insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'station-images',
  'station-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Station images are public" on storage.objects;
create policy "Station images are public"
on storage.objects
for select
using (bucket_id = 'station-images');

drop policy if exists "Authenticated users can upload station images" on storage.objects;
create policy "Authenticated users can upload station images"
on storage.objects
for insert
with check (
  bucket_id = 'station-images'
  and auth.role() = 'authenticated'
);

drop policy if exists "Authenticated users can update station images" on storage.objects;
create policy "Authenticated users can update station images"
on storage.objects
for update
using (
  bucket_id = 'station-images'
  and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'station-images'
  and auth.role() = 'authenticated'
);

drop policy if exists "Authenticated users can delete station images" on storage.objects;
create policy "Authenticated users can delete station images"
on storage.objects
for delete
using (
  bucket_id = 'station-images'
  and auth.role() = 'authenticated'
);
