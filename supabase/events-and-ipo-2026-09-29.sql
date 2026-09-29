-- ─────────────────────────────────────────────────────────────────────────────
-- Events + IPO subscriptions (Dangote Petroleum Refinery IPO first)
-- ─────────────────────────────────────────────────────────────────────────────
-- Users subscribe inside ETICO; the naira amount (shares × unit price) moves from
-- THEIR wallet VA to the event's collection VA via Moneta's VA-to-VA transfer.
-- ETICO staff then place the orders with PAC from the partner dashboard list.
--
-- Money rules:
--   • amount = units × unit_price, computed HERE in kobo (integers) — never
--     from the client.
--   • The wallet (profiles.va_available) is debited atomically with a profile
--     row lock, so double taps / parallel requests can't overspend or exceed the
--     per-user share limit.
--   • The existing ledger is NOT modified: new ledger types 'ipo' / 'ipo_refund'
--     are ADDED; va_debit / va_credit / funding / reconcile functions untouched.
--   • va_last_balance (the reconciler's baseline for detecting deposits) moves
--     down by the amount only when the transfer is CONFIRMED (ipo_settle), and
--     the reconciler skips a user while an IPO transfer is pending — so a
--     transfer can never be mistaken for a deposit or hide a real one.
--
-- Run AFTER partner-chn-number.sql (web repo) — or rely on the guard below.
-- Idempotent. Run in the Supabase SQL editor.

-- 0) CHN column (also created by partner-chn-number.sql; harmless to repeat) --
alter table public.profiles add column if not exists chn text;

-- 1) Events ---------------------------------------------------------------------
create table if not exists public.events (
  id                      text primary key,                 -- slug, e.g. 'dangote-ipo'
  kind                    text not null default 'ipo' check (kind in ('ipo')),
  title                   text not null,
  issuer                  text,
  summary                 text,
  logo_url                text,
  unit_price_kobo         bigint not null check (unit_price_kobo > 0),
  max_units_per_user      integer not null default 10 check (max_units_per_user > 0),
  opens_at                timestamptz,
  closes_at               timestamptz,
  status                  text not null default 'open' check (status in ('upcoming','open','closed')),
  docs                    jsonb not null default '[]'::jsonb,   -- [{ "title": "...", "url": "..." }]
  -- Where subscribers' money goes (the event's collection VA).
  collection_va_number    text,
  collection_va_reference text,
  collection_va_bank      text,
  collection_va_name      text,
  sort                    integer not null default 0,
  created_at              timestamptz not null default now()
);

alter table public.events enable row level security;
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events for select to authenticated using (true);
revoke insert, update, delete on public.events from authenticated, anon;
grant select on public.events to authenticated;

-- 2) Subscriptions ---------------------------------------------------------------
create table if not exists public.event_subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  event_id                    text not null references public.events(id),
  user_id                     uuid not null references auth.users(id),
  units                       integer not null check (units > 0),
  unit_price_kobo             bigint  not null check (unit_price_kobo > 0),
  amount_kobo                 bigint  not null check (amount_kobo > 0),
  status                      text not null default 'processing'
                              check (status in ('processing','paid','failed')),
  reference                   text not null unique,              -- our ref (= ledger ref)
  provider_ref                text,                              -- Moneta transfer reference
  failure_reason              text,
  -- Snapshot of everything PAC's Buy Shares form needs, taken at debit time.
  pac_account_id              text,
  full_name                   text,
  bvn                         text,
  settlement_bank_name        text,
  settlement_account_number   text,
  settlement_account_name     text,
  phone                       text,
  email                       text,
  cscs_number                 text,
  chn                         text,
  source_va_number            text,
  created_at                  timestamptz not null default now(),
  resolved_at                 timestamptz,
  placed_with_pac_at          timestamptz,
  placed_by                   text
);

create index if not exists event_subs_event_status_idx on public.event_subscriptions (event_id, status);
create index if not exists event_subs_user_event_idx   on public.event_subscriptions (user_id, event_id);
create index if not exists event_subs_processing_idx   on public.event_subscriptions (created_at) where status = 'processing';

alter table public.event_subscriptions enable row level security;
drop policy if exists "event_subs_read_own" on public.event_subscriptions;
create policy "event_subs_read_own" on public.event_subscriptions
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.event_subscriptions from authenticated, anon;
-- Users may read their own rows but not the identity snapshot columns of others
-- (RLS) — the snapshot is their own data anyway.
grant select on public.event_subscriptions to authenticated;

-- 3) Ledger: ADD the IPO types (existing types kept exactly) ----------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.va_ledger'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%type%deposit%'
  loop
    execute format('alter table public.va_ledger drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.va_ledger add constraint va_ledger_type_check
  check (type in ('deposit','funding','reversal','payout','ipo','ipo_refund'));

-- 4) event_subscribe — validate, price, reserve wallet money, snapshot ------------
-- Raises (message is the error code the API maps to user text):
--   not_approved | event_closed | event_not_ready | invalid_units | limit_exceeded
--   | insufficient_funds
create or replace function public.event_subscribe(p_uid uuid, p_event text, p_units integer, p_ref text)
returns public.event_subscriptions
language plpgsql security definer set search_path = public
as $$
declare
  v_prof   public.profiles%rowtype;
  v_ev     public.events%rowtype;
  v_used   integer;
  v_kobo   bigint;
  v_amount numeric;
  v_new    numeric;
  v_row    public.event_subscriptions%rowtype;
begin
  if p_units is null or p_units < 1 then raise exception 'invalid_units'; end if;

  -- Lock the user's profile: serialises this user's subscriptions + wallet.
  select * into v_prof from public.profiles where id = p_uid for update;
  if not found then raise exception 'not_approved'; end if;
  if coalesce(v_prof.cacs_status, '') <> 'approved' then raise exception 'not_approved'; end if;

  select * into v_ev from public.events where id = p_event;
  if not found or v_ev.status <> 'open'
     or (v_ev.opens_at is not null and now() < v_ev.opens_at)
     or (v_ev.closes_at is not null and now() > v_ev.closes_at) then
    raise exception 'event_closed';
  end if;
  if v_ev.collection_va_number is null then raise exception 'event_not_ready'; end if;

  select coalesce(sum(units), 0) into v_used
    from public.event_subscriptions
   where user_id = p_uid and event_id = p_event and status in ('processing', 'paid');
  if v_used + p_units > v_ev.max_units_per_user then raise exception 'limit_exceeded'; end if;

  v_kobo   := p_units::bigint * v_ev.unit_price_kobo;
  v_amount := v_kobo / 100.0;

  if coalesce(v_prof.va_available, 0) < v_amount then raise exception 'insufficient_funds'; end if;

  update public.profiles
     set va_available = va_available - v_amount, updated_at = now()
   where id = p_uid
  returning va_available into v_new;

  -- Pending until Moneta confirms the transfer (ipo_settle) or it fails (ipo_fail).
  insert into public.va_ledger (user_id, type, amount, balance_after, reference, status)
  values (p_uid, 'ipo', -v_amount, v_new, p_ref, 'pending');

  insert into public.event_subscriptions (
    event_id, user_id, units, unit_price_kobo, amount_kobo, status, reference,
    pac_account_id, full_name, bvn, settlement_bank_name, settlement_account_number,
    settlement_account_name, phone, email, cscs_number, chn, source_va_number
  ) values (
    p_event, p_uid, p_units, v_ev.unit_price_kobo, v_kobo, 'processing', p_ref,
    v_prof.pac_account_id, v_prof.full_name, v_prof.bvn, v_prof.settlement_bank_name,
    v_prof.settlement_account_number, v_prof.settlement_account_name, v_prof.phone,
    v_prof.email, v_prof.cscs_number, v_prof.chn, v_prof.va_number
  ) returning * into v_row;

  return v_row;
end $$;

-- 5) ipo_settle — transfer confirmed. Idempotent (only a 'processing' row). -------
create or replace function public.ipo_settle(p_ref text, p_provider_ref text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_sub public.event_subscriptions%rowtype;
begin
  select * into v_sub from public.event_subscriptions where reference = p_ref for update;
  if not found or v_sub.status <> 'processing' then return false; end if;

  update public.event_subscriptions
     set status = 'paid', provider_ref = p_provider_ref, resolved_at = now()
   where id = v_sub.id;

  update public.va_ledger
     set status = 'completed', pac_txn_id = coalesce(p_provider_ref, pac_txn_id)
   where reference = p_ref and type = 'ipo' and status = 'pending';

  -- The money really left the VA: move the reconciler's baseline down by the
  -- same amount so the drop is never read as anything else.
  update public.profiles
     set va_last_balance = coalesce(va_last_balance, 0) - (v_sub.amount_kobo / 100.0),
         updated_at = now()
   where id = v_sub.user_id;

  return true;
end $$;

-- 6) ipo_fail — transfer did NOT happen: refund. Idempotent. ---------------------
create or replace function public.ipo_fail(p_ref text, p_reason text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_sub public.event_subscriptions%rowtype; v_new numeric; v_amount numeric;
begin
  select * into v_sub from public.event_subscriptions where reference = p_ref for update;
  if not found or v_sub.status <> 'processing' then return false; end if;
  v_amount := v_sub.amount_kobo / 100.0;

  update public.profiles
     set va_available = coalesce(va_available, 0) + v_amount, updated_at = now()
   where id = v_sub.user_id
  returning va_available into v_new;

  update public.va_ledger set status = 'reversed'
   where reference = p_ref and type = 'ipo' and status = 'pending';

  insert into public.va_ledger (user_id, type, amount, balance_after, reference, status)
  values (v_sub.user_id, 'ipo_refund', v_amount, v_new, p_ref || '-refund', 'completed');

  update public.event_subscriptions
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'Transfer failed'), 300),
         resolved_at = now()
   where id = v_sub.id;

  return true;
end $$;

revoke all on function public.event_subscribe(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.ipo_settle(text, text)                    from public, anon, authenticated;
revoke all on function public.ipo_fail(text, text)                      from public, anon, authenticated;
grant execute on function public.event_subscribe(uuid, text, integer, text) to service_role;
grant execute on function public.ipo_settle(text, text)                    to service_role;
grant execute on function public.ipo_fail(text, text)                      to service_role;

-- 7) Seed: Dangote Petroleum Refinery IPO (collection VA filled in once created) --
insert into public.events (id, kind, title, issuer, summary, unit_price_kobo, max_units_per_user, closes_at, status, sort)
values (
  'dangote-ipo', 'ipo', 'Dangote Petroleum Refinery IPO',
  'Dangote Petroleum Refinery & Petrochemicals FZE',
  'Initial Public Offering by way of an offer for subscription of 4,100,000,000 ordinary shares of US$0.000013 each.',
  52500, 10, '2026-10-13T23:59:59+01:00', 'open', 0
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- VERIFY:
--   select id, title, unit_price_kobo/100.0 as unit_price, max_units_per_user, status,
--          collection_va_number from public.events;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.va_ledger'::regclass and contype='c';
