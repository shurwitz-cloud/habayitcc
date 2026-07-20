-- ============================================================
-- Enable Row Level Security on all public tables
-- ============================================================
-- The HaBayit Next.js app writes via SUPABASE_SERVICE_ROLE_KEY in
-- server actions only. The anon/publishable key must not access CRM data.
-- Service role bypasses RLS automatically.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'families',
    'parents',
    'children',
    'programs',
    'program_registrations',
    'events',
    'event_registrations',
    'donations',
    'chai_partners',
    'payments',
    'contacts',
    'email_subscribers',
    'staff_notes',
    'attendance',
    'waivers',
    'sponsors',
    'tuition_installments',
    'important_dates',
    'form_submissions',
    'site_image_slots'
  ]
  loop
    if exists (
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- site_image_slots keeps public read via policy from 0006_site_images.sql.
-- Re-grant SELECT so the existing policy can allow hero image reads.
do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'site_image_slots'
  ) then
    grant select on table public.site_image_slots to anon, authenticated;
  end if;
end $$;

-- Tighten storage: public read only; writes require service role.
drop policy if exists "site_photos_service_write" on storage.objects;
drop policy if exists "site_photos_service_update" on storage.objects;
drop policy if exists "site_photos_service_delete" on storage.objects;

create policy "site_photos_service_write"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'site-photos');

create policy "site_photos_service_update"
  on storage.objects for update
  to service_role
  using (bucket_id = 'site-photos');

create policy "site_photos_service_delete"
  on storage.objects for delete
  to service_role
  using (bucket_id = 'site-photos');
