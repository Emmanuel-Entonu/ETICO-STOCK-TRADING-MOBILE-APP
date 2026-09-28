-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.bvn_verified_at — server-set proof that the BVN was OTP-validated
-- ─────────────────────────────────────────────────────────────────────────────
-- Issue log: "Only send request for CSCS as email and show on dashboard as a
-- request when the BVN has been validated." Set ONLY by the server (nibss-bvn
-- proxy, when NIBSS confirms the OTP). Clients can't write it, so it can't be
-- faked. KYC finalize (mobile + web) only raises a CSCS request / emails PAC when
-- it is set, and the partner dashboard only lists requests that have it.
-- Idempotent. Run in the Supabase SQL editor.

alter table public.profiles add column if not exists bvn_verified_at timestamptz;

-- Server-only. (Also added to the dynamic grant block's exclusion list in
-- kyc-settlement-and-va.sql / fix-profiles-column-grants-*.sql.)
revoke update (bvn_verified_at) on public.profiles from authenticated, anon;

-- Backfill: profiles that already carry NIBSS-returned identity fields went
-- through OTP verification (those fields are only written after it).
update public.profiles
   set bvn_verified_at = coalesce(updated_at, now())
 where bvn_verified_at is null
   and bvn is not null
   and (first_name is not null or surname is not null);

notify pgrst, 'reload schema';

-- VERIFY:
--   select full_name, bvn is not null as has_bvn, bvn_verified_at, cacs_status
--     from public.profiles order by bvn_verified_at nulls last;
