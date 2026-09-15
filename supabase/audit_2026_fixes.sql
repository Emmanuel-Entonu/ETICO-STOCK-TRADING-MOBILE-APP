-- =====================================================================
-- Moneta — audit_2026_fixes.sql
-- Consolidated P0 / P1 remediations from the 2026-07-19 database audit.
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. profiles — RLS hardening + column locking + PII encryption
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Users may read only their own row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Users may insert only their own row.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Users may update only their own row AND cannot touch money / KYC-verdict
-- / broker linkage columns. Those must move through SECURITY DEFINER RPCs
-- or the service role.
drop policy if exists "profiles_update_own_safe" on public.profiles;
create policy "profiles_update_own_safe" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Column-level revoke so a compromised anon/authenticated key cannot
-- rewrite money or verdict columns even if the row-level check passes.
revoke update (wallet_balance, kyc_status, cacs_status, pac_account_id)
  on public.profiles from authenticated, anon;

-- BVN at rest: switch to pgcrypto symmetric encryption keyed by a Vault
-- secret. Requires `select vault.create_secret('...', 'moneta_bvn_key')`
-- once. bvn_enc is bytea; bvn (plaintext) is dropped after backfill.
alter table public.profiles
  add column if not exists bvn_enc bytea;

-- One-shot backfill (guarded — no-op if column already gone).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='bvn'
  ) then
    update public.profiles
       set bvn_enc = extensions.pgp_sym_encrypt(
         bvn,
         (select decrypted_secret from vault.decrypted_secrets where name='moneta_bvn_key')
       )
     where bvn is not null and bvn_enc is null;
    alter table public.profiles drop column bvn;
  end if;
end $$;

revoke select (bvn_enc) on public.profiles from authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. orders — RLS + indexes + FK + status CHECK
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

-- Cancel-only update. Prevents client from rewriting price/qty after fill.
drop policy if exists "orders_update_own_cancel_only" on public.orders;
create policy "orders_update_own_cancel_only" on public.orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.orders from authenticated, anon;
grant  update (status) on public.orders to authenticated;

-- No client deletes ever.
revoke delete on public.orders from authenticated, anon;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='orders_user_id_fkey') then
    alter table public.orders
      add constraint orders_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ADD CONSTRAINT IF NOT EXISTS is not valid Postgres syntax; guard by name.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='orders_status_chk') then
    alter table public.orders
      add constraint orders_status_chk
      check (status in ('placed','failed','cancelled','filled','partial'));
  end if;
  if not exists (select 1 from pg_constraint where conname='orders_qty_positive') then
    alter table public.orders
      add constraint orders_qty_positive check (quantity > 0);
  end if;
end $$;

-- Hot path: portfolioStore lists orders per-user, newest first.
create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

create index if not exists orders_pac_order_id_idx
  on public.orders (pac_order_id) where pac_order_id is not null;

-- ---------------------------------------------------------------------
-- 3. order_fills — RLS + FK index
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('public.order_fills') is not null then
    execute 'alter table public.order_fills enable row level security';
    execute $p$
      drop policy if exists "order_fills_select_own" on public.order_fills;
      create policy "order_fills_select_own" on public.order_fills
        for select using (
          exists (select 1 from public.orders o
                   where o.id = order_fills.order_id
                     and o.user_id = auth.uid())
        );
    $p$;
    execute 'revoke insert,update,delete on public.order_fills from authenticated, anon';
    execute 'create index if not exists order_fills_order_id_idx on public.order_fills (order_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. wallet_transactions — RLS + FK indexes + immutability
-- ---------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  delta        numeric(14,2) not null,
  new_balance  numeric(14,2) not null,
  kind         text not null check (kind in ('credit','debit','trade_debit','trade_credit','fee','refund')),
  reference    text,
  created_at   timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wtx_select_own" on public.wallet_transactions;
create policy "wtx_select_own" on public.wallet_transactions
  for select using (auth.uid() = user_id);

-- Ledger is append-only via SECURITY DEFINER RPCs; clients get zero write perms.
revoke insert, update, delete on public.wallet_transactions from authenticated, anon;

create unique index if not exists wtx_reference_uidx
  on public.wallet_transactions (reference) where reference is not null;
create index if not exists wtx_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. payment_intents — idempotency-hardening
-- ---------------------------------------------------------------------
alter table public.payment_intents enable row level security;

-- Kill writes from client tokens (they should already be gone, but
-- payment_intents has no explicit write revoke in security_hardening.sql).
revoke insert, update, delete on public.payment_intents from authenticated, anon;

create index if not exists payment_intents_user_created_idx
  on public.payment_intents (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. claim_payment — pin search_path to pg_temp + belt-and-braces idempotency
-- ---------------------------------------------------------------------
-- The row lock is correct; extra safety = wallet_transactions.reference is
-- UNIQUE (see index above), so a second insert for the same reference will
-- raise 23505 even if two txns raced past the SELECT ... FOR UPDATE.
--
-- Also: pin search_path with public first, extensions second, pg_temp last —
-- current definition includes pg_temp but not extensions, so any future
-- extensions.* call inside will fail. Rewrite once here.

create or replace function public.claim_payment(reference text)
returns numeric
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid       uuid := auth.uid();
  rec       public.payment_intents;
  new_bal   numeric;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if reference is null or length(reference) < 4 or length(reference) > 128 then
    raise exception 'invalid reference' using errcode = '22023';
  end if;

  select * into rec
    from public.payment_intents
    where payment_intents.reference = claim_payment.reference
    for update;

  if not found                 then raise exception 'unknown payment reference'; end if;
  if rec.user_id  <> uid       then raise exception 'payment does not belong to caller'; end if;
  if rec.status   = 'consumed' then
    select wallet_balance into new_bal from public.profiles where id = uid;
    return coalesce(new_bal, 0);
  end if;
  if rec.status  <> 'verified' then raise exception 'payment not verified'; end if;

  update public.profiles
     set wallet_balance = wallet_balance + rec.amount_naira,
         updated_at     = now()
   where id = uid
  returning wallet_balance into new_bal;

  update public.payment_intents
     set status = 'consumed', consumed_at = now()
   where payment_intents.reference = claim_payment.reference
     and status = 'verified';  -- guard: refuse to consume anything else

  insert into public.wallet_transactions (user_id, delta, new_balance, kind, reference)
  values (uid, rec.amount_naira, new_bal, 'credit', claim_payment.reference);

  return new_bal;
end $$;

revoke all on function public.claim_payment(text) from public;
grant execute on function public.claim_payment(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. decrement_wallet — atomic, race-proof, ledger-writing
-- ---------------------------------------------------------------------
-- Client calls debitWallet → rpc('decrement_wallet', {delta}). Must be
-- atomic (no read-then-write) and must write a ledger row.
create or replace function public.decrement_wallet(delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  new_bal numeric;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if delta is null or delta <= 0 or delta > 10000000 then
    raise exception 'invalid delta' using errcode = '22023';
  end if;

  -- Atomic conditional UPDATE — no gap between read and write.
  update public.profiles
     set wallet_balance = wallet_balance - delta,
         updated_at     = now()
   where id = uid
     and wallet_balance >= delta
  returning wallet_balance into new_bal;

  if new_bal is null then
    return null;  -- caller sees this as "insufficient funds"
  end if;

  insert into public.wallet_transactions (user_id, delta, new_balance, kind)
  values (uid, -delta, new_bal, 'debit');

  return new_bal;
end $$;

revoke all on function public.decrement_wallet(numeric) from public;
grant execute on function public.decrement_wallet(numeric) to authenticated;

-- Explicitly REVOKE the old two-arg increment_wallet if it still exists —
-- security_hardening.sql already does this, replicated for a fresh env.
do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='increment_wallet'
  ) then
    execute 'revoke execute on function public.increment_wallet(numeric, text) from authenticated, public';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. user_pins — FK index + attempt-cap safety
-- ---------------------------------------------------------------------
-- PK covers user_id lookups already; add a cap so failed_attempts can't
-- overflow-drive a 292-year lockout after enough failures.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='user_pins_attempts_cap') then
    alter table public.user_pins
      add constraint user_pins_attempts_cap
      check (failed_attempts >= 0 and failed_attempts <= 100);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. profiles indexes for scale
-- ---------------------------------------------------------------------
create index if not exists profiles_kyc_status_idx
  on public.profiles (kyc_status) where kyc_status <> 'verified';
create index if not exists profiles_cacs_status_idx
  on public.profiles (cacs_status) where cacs_status <> 'verified';
create index if not exists profiles_pac_account_id_idx
  on public.profiles (pac_account_id) where pac_account_id is not null;

-- =====================================================================
-- End audit_2026_fixes.sql
-- =====================================================================
