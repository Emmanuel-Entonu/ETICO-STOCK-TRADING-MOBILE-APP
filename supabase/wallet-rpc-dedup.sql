-- Fix: "function public.decrement_wallet(...) is not unique"
-- Multiple overloaded copies of the wallet RPCs existed (from different
-- migrations), so PostgREST couldn't resolve the call and every debit/credit
-- failed. Drop ALL overloads, then recreate a single canonical version of each.
-- Run in the Supabase SQL editor. Idempotent.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('decrement_wallet', 'increment_wallet')
  loop
    execute 'drop function ' || r.sig::text;
  end loop;
end $$;

-- Canonical DEBIT (buys). Atomic, race-proof, writes a ledger row.
create function public.decrement_wallet(delta numeric)
returns numeric language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); new_bal numeric;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if delta is null or delta <= 0 or delta > 10000000 then
    raise exception 'invalid delta' using errcode = '22023';
  end if;
  update public.profiles
     set wallet_balance = wallet_balance - delta, updated_at = now()
   where id = uid and wallet_balance >= delta
  returning wallet_balance into new_bal;
  if new_bal is null then return null; end if;   -- insufficient funds
  insert into public.wallet_transactions (user_id, delta, new_balance, kind)
  values (uid, -delta, new_bal, 'debit');
  return new_bal;
end $$;
revoke all on function public.decrement_wallet(numeric) from public;
grant execute on function public.decrement_wallet(numeric) to authenticated;

-- Canonical CREDIT (sell proceeds). NOTE: a client-callable credit is a known
-- risk; before production, move sell-credit server-side (verified vs the PAC
-- fill). Kept here so the app's ledger model works end-to-end for now.
create function public.increment_wallet(delta numeric)
returns numeric language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); new_bal numeric;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if delta is null or delta <= 0 or delta > 10000000 then
    raise exception 'invalid delta' using errcode = '22023';
  end if;
  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + delta, updated_at = now()
   where id = uid
  returning wallet_balance into new_bal;
  insert into public.wallet_transactions (user_id, delta, new_balance, kind)
  values (uid, delta, new_bal, 'credit');
  return new_bal;
end $$;
revoke all on function public.increment_wallet(numeric) from public;
grant execute on function public.increment_wallet(numeric) to authenticated;
