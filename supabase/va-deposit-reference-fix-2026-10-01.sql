-- Fix: va_reconcile_deposit ledger reference could collide (2026-10-01).
--
-- The deposit row's reference was 'dep-<uid>-<new VA balance>'. va_ledger has a
-- UNIQUE index on reference, so if a user's VA balance ever returned to a value
-- it had before (e.g. 100 -> 0 after an IPO transfer -> 100 again), the insert
-- failed, the whole function rolled back and that user's deposits stopped being
-- credited.
--
-- Double-credit protection never depended on the reference: the profile row is
-- locked (FOR UPDATE) and the delta is recomputed from va_last_balance under the
-- lock, so a repeated call sees delta 0 and returns NULL. The new reference adds
-- the previous balance and the transaction id, so it is always unique.
--
-- Same signature and grants as before. Safe to run more than once.

create or replace function public.va_reconcile_deposit(p_uid uuid, p_new_va numeric)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_old numeric; v_delta numeric; v_new numeric;
begin
  select coalesce(va_last_balance, 0) into v_old
    from public.profiles where id = p_uid for update;

  v_delta := p_new_va - v_old;
  if v_delta is null or v_delta <= 0 then
    return null;                      -- no new deposit
  end if;

  update public.profiles
     set va_available    = coalesce(va_available, 0) + v_delta,
         va_last_balance = p_new_va,
         updated_at      = now()
   where id = p_uid
  returning va_available into v_new;

  insert into public.va_ledger (user_id, type, amount, balance_after, reference)
  values (p_uid, 'deposit', v_delta, v_new,
          'dep-' || p_uid || '-' || v_old || '-' || p_new_va || '-' || txid_current());

  return v_new;
end $$;

revoke all on function public.va_reconcile_deposit(uuid, numeric) from public, authenticated;
grant execute on function public.va_reconcile_deposit(uuid, numeric) to service_role;

notify pgrst, 'reload schema';
