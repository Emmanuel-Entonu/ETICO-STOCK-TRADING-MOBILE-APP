-- ── Funding system security + correctness patch ─────────────────────────────
-- Run in the Supabase SQL editor. Safe to re-run.

-- 1) Lock down the wallet/VA columns so a signed-in user can NEVER edit them
--    from the client (they'd otherwise reset va_last_balance to re-trigger
--    funding = free money, or point va_reference at someone else's VA).
--    Only SECURITY DEFINER RPCs and the service role may touch these.
revoke update (
  va_reference, va_number, va_bank, va_account_name, va_last_balance, wallet_balance
) on public.profiles from authenticated;

-- 2) Atomic, idempotent, race-proof deposit reconciliation.
--    Credits the wallet by (new_va - va_last_balance) and advances the baseline
--    in ONE statement. The `new_va > va_last_balance` guard makes a repeat call
--    with the same balance a no-op (returns NULL), so overlapping reconciler
--    runs can never double-credit. Called only by the service role (reconciler).
create or replace function public.reconcile_deposit(p_uid uuid, p_new_va numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare new_bal numeric;
begin
  update public.profiles
     set wallet_balance  = coalesce(wallet_balance, 0) + (p_new_va - coalesce(va_last_balance, 0)),
         va_last_balance = p_new_va
   where id = p_uid
     and p_new_va > coalesce(va_last_balance, 0)
  returning wallet_balance into new_bal;
  return new_bal;   -- NULL when there was no new deposit (already reconciled)
end;
$$;

revoke all on function public.reconcile_deposit(uuid, numeric) from public, authenticated;
grant execute on function public.reconcile_deposit(uuid, numeric) to service_role;
