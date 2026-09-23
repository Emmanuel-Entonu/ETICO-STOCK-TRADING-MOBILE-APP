-- ─────────────────────────────────────────────────────────────────────────────
-- URGENT (2026-09-23): re-lock client-writable money/identity columns on profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- fix-profiles-column-grants-2026-09-23.sql re-ran the canonical dynamic grant
-- (UPDATE on every column except wallet_balance + va_reference/number/bank/
-- account_name/last_balance). Its exclusion list predates later columns, so it
-- handed UPDATE back to `authenticated` on:
--
--   va_available  ← MONEY. A signed-in user could set their own VA balance and then
--                   Fund Wallet would move real settlement-account money into their
--                   PAC account. Originally revoked by va-wallet-separation.sql.
--   has_pin       ← only set_pin() (SECURITY DEFINER) should flip this.
--   partner_ref   ← stable per-user identifier (web partner-identifier-email.sql).
--
-- Audited 2026-09-23 before this fix: every user's va_available equals the
-- balance_after of their latest va_ledger row → no tampering occurred.
--
-- Safe for mobile + web: no client code writes these columns (mobile only reads
-- has_pin/va_available; VA money moves via va_debit/va_credit/va_reconcile_deposit
-- RPCs; web writes profiles with the service role, which ignores grants).
-- Idempotent. Run in the Supabase SQL editor.

begin;

revoke update (va_available, has_pin, partner_ref)
  on public.profiles from authenticated, anon;

commit;

notify pgrst, 'reload schema';

-- VERIFY — must return ZERO rows:
--   select column_name
--     from information_schema.column_privileges
--    where table_schema='public' and table_name='profiles'
--      and privilege_type='UPDATE' and grantee in ('authenticated','anon')
--      and column_name in ('va_available','has_pin','partner_ref','wallet_balance',
--                          'va_reference','va_number','va_bank','va_account_name','va_last_balance');
