-- ── VA / Wallet separation + funding ledger ─────────────────────────────────
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Model:
--   • Trading Wallet balance = the user's live PAC account cash (read from PAC;
--     NOT stored here). This is buying power.
--   • Virtual Account (va_available) = money deposited into the Moneta VA that is
--     available to move into the trading wallet. Credited when a VA deposit is
--     detected; debited when the user funds their wallet.
--   • va_ledger = append-only record of every VA money movement (deposit,
--     funding, reversal, and — later — payout).
--
-- Funding flow (server, /api/fund-wallet): reserve from va_available (atomic) →
-- fire cash_transactions DEPOSIT to the user's PAC account → on PAC failure,
-- reverse the reservation. All steps write va_ledger.

-- 1) va_available — fundable VA balance (deposited minus funded). ------------
alter table public.profiles
  add column if not exists va_available numeric(14,2) not null default 0;

-- Clients can never write it directly (only SECURITY DEFINER RPCs / service role).
revoke update (va_available) on public.profiles from authenticated;

-- 2) va_ledger — append-only VA movement log. --------------------------------
create table if not exists public.va_ledger (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('deposit','funding','reversal','payout')),
  amount        numeric(14,2) not null,           -- signed: +deposit, -funding
  balance_after numeric(14,2) not null,           -- va_available after this row
  reference     text,
  pac_txn_id    text,
  created_at    timestamptz not null default now()
);

alter table public.va_ledger enable row level security;

drop policy if exists "va_ledger_select_own" on public.va_ledger;
create policy "va_ledger_select_own" on public.va_ledger
  for select using (auth.uid() = user_id);

-- Append-only via SECURITY DEFINER RPCs / service role; clients get no writes.
revoke insert, update, delete on public.va_ledger from authenticated, anon;

create unique index if not exists va_ledger_reference_uidx
  on public.va_ledger (reference) where reference is not null;
create index if not exists va_ledger_user_created_idx
  on public.va_ledger (user_id, created_at desc);

-- 3) va_reconcile_deposit — credit va_available on a NEW deposit. ------------
-- Idempotent: only the positive delta above va_last_balance is credited, and the
-- baseline is advanced in the same statement, so repeat/overlapping calls with
-- the same balance are no-ops. Called by the service role (reconciler) only.
create or replace function public.va_reconcile_deposit(p_uid uuid, p_new_va numeric)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_delta numeric; v_new numeric;
begin
  select (p_new_va - coalesce(va_last_balance, 0)) into v_delta
    from public.profiles where id = p_uid for update;

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
  values (p_uid, 'deposit', v_delta, v_new, 'dep-' || p_uid || '-' || p_new_va);

  return v_new;
end $$;

revoke all on function public.va_reconcile_deposit(uuid, numeric) from public, authenticated;
grant execute on function public.va_reconcile_deposit(uuid, numeric) to service_role;

-- 4) va_debit — atomically reserve funds (funding/payout). -------------------
-- Returns the new va_available, or NULL if insufficient (no gap between the
-- check and the debit). Writes a ledger row for the reservation.
create or replace function public.va_debit(p_uid uuid, p_amount numeric, p_ref text, p_type text)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_new numeric;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_type not in ('funding','payout') then
    raise exception 'invalid type' using errcode = '22023';
  end if;

  update public.profiles
     set va_available = va_available - p_amount,
         updated_at   = now()
   where id = p_uid
     and va_available >= p_amount
  returning va_available into v_new;

  if v_new is null then
    return null;                      -- insufficient VA balance
  end if;

  insert into public.va_ledger (user_id, type, amount, balance_after, reference)
  values (p_uid, p_type, -p_amount, v_new, p_ref);

  return v_new;
end $$;

revoke all on function public.va_debit(uuid, numeric, text, text) from public, authenticated;
grant execute on function public.va_debit(uuid, numeric, text, text) to service_role;

-- 5) va_credit — refund/reverse a reservation (e.g. PAC funding failed). -----
create or replace function public.va_credit(p_uid uuid, p_amount numeric, p_ref text, p_type text)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;

  update public.profiles
     set va_available = coalesce(va_available, 0) + p_amount,
         updated_at   = now()
   where id = p_uid
  returning va_available into v_new;

  insert into public.va_ledger (user_id, type, amount, balance_after, reference)
  values (p_uid, coalesce(p_type, 'reversal'), p_amount, v_new, p_ref);

  return v_new;
end $$;

revoke all on function public.va_credit(uuid, numeric, text, text) from public, authenticated;
grant execute on function public.va_credit(uuid, numeric, text, text) to service_role;
