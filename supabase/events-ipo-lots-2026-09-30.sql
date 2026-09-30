-- ─────────────────────────────────────────────────────────────────────────────
-- IPO lots: a minimum per purchase + buy only in multiples, and no per-user cap.
-- Dangote IPO: minimum 10 shares, multiples of 10 (PAC's public-offer rules).
-- ─────────────────────────────────────────────────────────────────────────────
-- Supersedes events-ipo-require-details-2026-09-30.sql (its eligibility checks
-- are included below, so running only THIS file is enough). Idempotent. Run in
-- the Supabase SQL editor.
--
-- events.min_units          smallest purchase (default 1)
-- events.unit_step          purchases must be a multiple of this (default 1)
-- events.max_units_per_user 1000000 = no cap (the Dangote IPO has none)
--
-- New refusal codes (the proxy maps them to user text):
--   below_minimum:<n>   fewer than min_units in one purchase
--   not_multiple:<n>    not a multiple of unit_step
-- (existing: not_verified, missing_details:<list>, event_closed,
--  event_not_ready, invalid_units, limit_exceeded, insufficient_funds)

alter table public.events add column if not exists min_units integer not null default 1;
alter table public.events add column if not exists unit_step integer not null default 1;
do $$ begin
  alter table public.events add constraint events_min_units_check check (min_units > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_unit_step_check check (unit_step > 0);
exception when duplicate_object then null; end $$;

-- "No cap" is stored as 1,000,000 (not NULL): app builds already on phones read
-- a NULL cap as 0 and would show everyone "subscribed, full limit". Current
-- apps treat >= 1,000,000 as no cap and hide the limit rows.
update public.events
   set min_units = 10, unit_step = 10, max_units_per_user = 1000000
 where id = 'dangote-ipo';

create or replace function public.event_subscribe(p_uid uuid, p_event text, p_units integer, p_ref text)
returns public.event_subscriptions
language plpgsql security definer set search_path = public
as $$
declare
  v_prof    public.profiles%rowtype;
  v_ev      public.events%rowtype;
  v_used    integer;
  v_kobo    bigint;
  v_amount  numeric;
  v_new     numeric;
  v_row     public.event_subscriptions%rowtype;
  v_missing text[] := '{}';
begin
  if p_units is null or p_units < 1 then raise exception 'invalid_units'; end if;

  -- Lock the user's profile: serialises this user's subscriptions + wallet.
  select * into v_prof from public.profiles where id = p_uid for update;
  if not found then raise exception 'not_verified'; end if;

  -- Fully verified: KYC verified AND CSCS approved (issued).
  if coalesce(v_prof.kyc_status, '') <> 'verified' or coalesce(v_prof.cacs_status, '') <> 'approved' then
    raise exception 'not_verified';
  end if;

  -- Every detail PAC's order form needs must be on file.
  if nullif(btrim(coalesce(v_prof.cscs_number, '')), '') is null then v_missing := v_missing || 'cscs_number'; end if;
  if nullif(btrim(coalesce(v_prof.chn, '')), '')         is null then v_missing := v_missing || 'chn'; end if;
  if nullif(btrim(coalesce(v_prof.bvn, '')), '')         is null then v_missing := v_missing || 'bvn'; end if;
  if nullif(btrim(coalesce(v_prof.full_name, '')), '')   is null then v_missing := v_missing || 'full_name'; end if;
  if nullif(btrim(coalesce(v_prof.email, '')), '')       is null then v_missing := v_missing || 'email'; end if;
  if nullif(btrim(coalesce(v_prof.phone, '')), '')       is null then v_missing := v_missing || 'phone'; end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'missing_details:%', array_to_string(v_missing, ',');
  end if;

  select * into v_ev from public.events where id = p_event;
  if not found or v_ev.status <> 'open'
     or (v_ev.opens_at is not null and now() < v_ev.opens_at)
     or (v_ev.closes_at is not null and now() > v_ev.closes_at) then
    raise exception 'event_closed';
  end if;
  if v_ev.collection_va_number is null then raise exception 'event_not_ready'; end if;

  -- Lot rules: each purchase is at least min_units, in multiples of unit_step.
  if p_units < v_ev.min_units then raise exception 'below_minimum:%', v_ev.min_units; end if;
  if p_units % v_ev.unit_step <> 0 then raise exception 'not_multiple:%', v_ev.unit_step; end if;

  -- Per-user cap (1,000,000 = effectively none).
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

revoke all on function public.event_subscribe(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.event_subscribe(uuid, text, integer, text) to service_role;

notify pgrst, 'reload schema';

-- Check:
--   select id, min_units, unit_step, max_units_per_user from public.events;
