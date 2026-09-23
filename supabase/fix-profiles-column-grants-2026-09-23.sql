-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: client KYC submit 403s — new profiles columns missing UPDATE grant
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles has a column-level UPDATE grant for `authenticated`: kyc-settlement-and-va.sql
-- revokes UPDATE on the whole table, then grants it back on every column EXCEPT
-- the money/VA ones, by enumerating the columns AT THE MOMENT THAT BLOCK RUNS.
--
-- `alter table ... add column` does NOT auto-grant. So any column added AFTER that
-- block last ran is NOT writable by the client, and a client UPDATE/upsert that
-- touches it fails with `42501 permission denied for table profiles`.
--
-- Columns added since (all needed by the mobile KYC submit — app/(auth)/kyc.tsx
-- `supabase.from('profiles').upsert(...)`), currently DENIED to authenticated:
--     selfie_path, next_of_kin_name, next_of_kin_phone, mother_maiden_name
-- Effect of the bug: the KYC upsert 403s for EVERY user → KYC can't be submitted,
-- the verification selfie path is never saved, and next-of-kin is never stored.
--
-- Fix: re-run the canonical dynamic grant. It regrants UPDATE on ALL non-money
-- columns (including the four above and anything else added since), so it is both
-- the fix AND self-healing. Idempotent — safe to run repeatedly. INSERT is already
-- granted (rows stay INSERTable), so `.upsert()` works once these are granted.
--
-- WEB IS UNAFFECTED. This only touches the `authenticated` role, and it is purely
-- additive (re-grants the same non-money columns + the 4 new ones — nothing that
-- was writable becomes blocked; money/VA columns stay revoked). The Niqra-web KYC
-- writes profiles via the SERVICE-ROLE admin client (src/lib/actions/kyc.ts),
-- which bypasses column grants entirely — so grant changes are invisible to web.
--
-- Wrapped in a transaction so the brief revoke→grant is atomic: no concurrent
-- mobile write ever sees the intermediate "UPDATE revoked" state.
--
-- Run this in the Supabase SQL editor (or psql) against the shared project.

begin;

revoke update on public.profiles from authenticated, anon;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in (
      'wallet_balance','va_reference','va_number','va_bank',
      'va_account_name','va_last_balance'
    );
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;

commit;

-- VERIFY — the four columns must now appear as UPDATE-granted for `authenticated`
-- (this SELECT should return 4 rows):
--   select column_name
--     from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and privilege_type='UPDATE' and grantee='authenticated'
--      and column_name in ('selfie_path','next_of_kin_name','next_of_kin_phone','mother_maiden_name')
--    order by column_name;
