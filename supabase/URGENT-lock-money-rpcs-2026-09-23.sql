-- ─────────────────────────────────────────────────────────────────────────────
-- URGENT (2026-09-23): money RPCs are executable WITHOUT LOGIN
-- ─────────────────────────────────────────────────────────────────────────────
-- Live audit (calling each RPC with shaped args against a non-existent user id,
-- so nothing real changed):
--
--   function              anon (no login)   signed-in user
--   va_credit             EXECUTES          denied
--   va_debit              EXECUTES          denied
--   va_reconcile_deposit  EXECUTES          denied
--   reconcile_deposit     EXECUTES          denied
--   va_settle_funding     EXECUTES          denied
--   va_reverse_funding    EXECUTES          denied
--   increment_wallet      denied            EXECUTES
--
-- Earlier SQL revoked these from public/authenticated but NOT from anon, which
-- Supabase grants on new functions by default. With only the public anon key
-- (shipped in the APK / web bundle) anyone could va_credit any user any amount,
-- and Fund Wallet would then move real settlement-account money into PAC.
-- Audited before this fix: every va_available equals its latest va_ledger
-- balance_after, and all 7 ledger rows are legitimate → no exploitation.
--
-- Who legitimately calls them: ONLY the Vercel proxy (fund-wallet.ts,
-- reconcile-funding.ts) with the SERVICE ROLE key. No app calls them. The legacy
-- wallet RPCs (increment/decrement_wallet, claim_payment, reconcile_deposit) have
-- no callers at all. So: service_role only.
--
-- Client RPCs the apps DO call are untouched: set_pin, verify_pin,
-- set_virtual_account, request_account_deletion (+ is_partner / partner_*).
--
-- Idempotent. Run in the Supabase SQL editor.

begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'va_credit', 'va_debit', 'va_reconcile_deposit', 'va_settle_funding',
         'va_reverse_funding', 'reconcile_deposit',
         'increment_wallet', 'decrement_wallet', 'claim_payment'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- Stop this recurring: new functions in public are no longer executable by
-- anon / PUBLIC by default. Client RPCs must be granted explicitly
-- (`grant execute on function ... to authenticated`), as our SQL files already do.
alter default privileges in schema public revoke execute on functions from public, anon;

commit;

notify pgrst, 'reload schema';

-- VERIFY — must return ZERO rows:
--   select p.proname, r.rolname
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     cross join (values ('anon'),('authenticated')) as r(rolname)
--    where n.nspname = 'public'
--      and p.proname in ('va_credit','va_debit','va_reconcile_deposit','va_settle_funding',
--                        'va_reverse_funding','reconcile_deposit','increment_wallet',
--                        'decrement_wallet','claim_payment')
--      and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
