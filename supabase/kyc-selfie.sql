-- KYC verification selfie — private storage bucket + profiles.selfie_path.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Model: the mobile app (and web) capture a selfie during KYC and upload it to
-- Storage at '<user_id>/selfie.jpg'. The object PATH is stored on
-- profiles.selfie_path. The partner dashboard renders it via a service-role
-- signed URL (the bucket is private).

-- 1) Column on profiles holding the stored object path.
alter table public.profiles
  add column if not exists selfie_path text;

-- 2) Private bucket.
insert into storage.buckets (id, name, public)
values ('kyc-selfies', 'kyc-selfies', false)
on conflict (id) do nothing;

-- 3) RLS on storage.objects for this bucket. A user may read/write ONLY their own
--    folder — the first path segment must equal their auth.uid(). The partner
--    dashboard reads with the service role, which bypasses RLS.
drop policy if exists "kyc_selfie_insert_own" on storage.objects;
create policy "kyc_selfie_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc_selfie_update_own" on storage.objects;
create policy "kyc_selfie_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kyc-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'kyc-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc_selfie_select_own" on storage.objects;
create policy "kyc_selfie_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Partner dashboard (web, service role) reads any selfie via a signed URL:
--   supabase.storage.from('kyc-selfies').createSignedUrl(profile.selfie_path, 3600)
