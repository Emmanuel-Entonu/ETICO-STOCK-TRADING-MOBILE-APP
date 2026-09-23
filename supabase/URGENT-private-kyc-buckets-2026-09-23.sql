-- ─────────────────────────────────────────────────────────────────────────────
-- URGENT (2026-09-23): KYC ID documents + CSCS forms are publicly readable
-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets `kyc-docs` (33 ID-document photos) and `cacs-docs` (6 CSCS
-- form PDFs) are PUBLIC: any file opens with NO login via
--   https://cmrxwuqfagqskrjdmjte.supabase.co/storage/v1/object/public/<bucket>/<path>
-- They can't be listed anonymously, but paths are `<user-id>/...` and the CSCS
-- form is always `<user-id>/cacs-form.pdf`, and those public URLs are stored in
-- profiles.kyc_doc_url / cacs_doc_url.
--
-- Only the LEGACY Vite web app (Moneta-stock trading Demo/src: KYC.tsx,
-- CacsRequest.tsx, Admin.tsx) uploads to / previews these buckets. The current
-- mobile app and Niqra-web never display them; the partner dashboard uses the
-- private `kyc-selfies` bucket with signed URLs. Making them private only breaks
-- the legacy app's document previews.
--
-- Idempotent. Run in the Supabase SQL editor.

update storage.buckets set public = false where id in ('kyc-docs', 'cacs-docs');

-- VERIFY — both rows must show public = false:
--   select id, public from storage.buckets order by id;
-- and an old public URL must now return 400/404, e.g.
--   https://cmrxwuqfagqskrjdmjte.supabase.co/storage/v1/object/public/cacs-docs/<any path>
