-- Site image slots for admin-managed photos (crop + URL)
create table if not exists public.site_image_slots (
  slot_id text primary key,
  src text,
  images jsonb,
  focal_x numeric not null default 50,
  focal_y numeric not null default 50,
  zoom numeric not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.site_image_slots enable row level security;

-- Public read (site pages load images without auth)
create policy "site_image_slots_public_read"
  on public.site_image_slots for select
  using (true);

-- Writes only via service role (admin server actions)
create policy "site_image_slots_service_write"
  on public.site_image_slots for all
  using (false)
  with check (false);

-- Storage bucket for uploaded site photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-photos',
  'site-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "site_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'site-photos');

create policy "site_photos_service_write"
  on storage.objects for insert
  with check (bucket_id = 'site-photos');

create policy "site_photos_service_update"
  on storage.objects for update
  using (bucket_id = 'site-photos');

create policy "site_photos_service_delete"
  on storage.objects for delete
  using (bucket_id = 'site-photos');
