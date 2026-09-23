-- ─────────────────────────────────────────────────────────────────────────────
-- URGENT (2026-09-23): two live security holes on public.profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent — safe to run (and re-run) in the Supabase SQL editor.
-- Safe for mobile + web: nothing below is something either app legitimately does.
--
-- 1) MONEY: client-writable va_available (+ has_pin, partner_ref)
--    fix-profiles-column-grants-2026-09-23.sql re-ran the canonical dynamic
--    grant, whose exclusion list predated these columns, so UPDATE on them went
--    back to `authenticated`. A signed-in user could set their own VA balance and
--    Fund Wallet would move real settlement-account money into their PAC account.
--    Audited before this fix: every va_available equals the balance_after of the
--    user's latest va_ledger row → no tampering occurred.
--    No client writes these (VA money moves via va_* RPCs; has_pin via set_pin()).
--
-- 2) PII LEAK: the public anon key can read EVERY profile row
--    With only the anon key (shipped inside the APK and the web bundle, no
--    login), `select * from profiles` returned all users and all 46 columns:
--    BVN, NIN, phone, address, DOB, next of kin, mother's maiden name,
--    settlement account, selfie path. Signed-in users ARE correctly scoped to
--    their own row; some policy created outside the repos lets the anon role
--    read. Nothing legitimately reads profiles as anon (both apps read it
--    signed-in or with the service role), so remove anon's table privileges
--    outright — this closes it regardless of which policy opened it.

begin;

revoke update (va_available, has_pin, partner_ref)
  on public.profiles from authenticated, anon;

revoke select, insert, update, delete on public.profiles from anon;

commit;

notify pgrst, 'reload schema';

-- VERIFY (1) — must return ZERO rows:
--   select column_name
--     from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and privilege_type='UPDATE' and grantee in ('authenticated','anon')
--      and column_name in ('va_available','has_pin','partner_ref','wallet_balance',
--                          'va_reference','va_number','va_bank','va_account_name','va_last_balance');
--
-- VERIFY (2) — must return ZERO rows (anon has no privileges on profiles):
--   select privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='profiles' and grantee='anon';
--
-- FIND the policy that opened (2), then drop it too (anything whose roles
-- include anon/public with a permissive USING, e.g. `true`):
--   select policyname, roles, cmd, qual from pg_policies
--    where schemaname='public' and tablename='profiles';
