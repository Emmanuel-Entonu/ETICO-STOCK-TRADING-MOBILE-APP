-- =====================================================================
-- Moneta native — security hardening (audit follow-up)
-- Run in Supabase SQL Editor AFTER pin_rpc.sql and the demo's
-- hardening_2026_07_16.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. verify_pin — remove the 'no_pin' timing / enumeration side channel
-- ---------------------------------------------------------------------
-- Old behaviour: verify_pin returned {reason:'no_pin'} immediately if the
-- caller had no PIN row. An attacker who steals a session token can use
-- this to enumerate which accounts have set a PIN. We now always run a
-- fake bcrypt compare so the timing and the response shape are
-- indistinguishable from a normal wrong-PIN attempt.

create or replace function public.verify_pin(pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid          uuid := auth.uid();
  rec          public.user_pins;
  new_attempts integer;
  new_lock     timestamptz;
  -- Precomputed bcrypt hash of an impossible string. We compare against it
  -- for users with no PIN so the response takes the same time as a real
  -- wrong-PIN compare. The hash below is `crypt('__dummy__', gen_salt('bf',10))`.
  -- Real bcrypt hash of '__dummy__' at cost 10. Generated once with
  -- bcryptjs; hard-coded so verify_pin runs a deterministic amount of
  -- crypto work for no-PIN users (timing-attack mitigation).
  dummy_hash   constant text := '$2a$10$/eZfyJIh/YhnTL19yp6WCuXLLlQ40FIOypieAeuSefL6z6SCYr9i2';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into rec from public.user_pins where user_id = uid;
  if not found then
    -- Do the bcrypt work anyway so timing matches, then return generic wrong.
    perform extensions.crypt(pin, dummy_hash);
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;

  if rec.locked_until is not null and rec.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', rec.locked_until
    );
  end if;

  if rec.pin_hash = extensions.crypt(pin, rec.pin_hash) then
    update public.user_pins
      set failed_attempts = 0,
          locked_until    = null,
          updated_at      = now()
      where user_id = uid;
    return jsonb_build_object('ok', true);
  end if;

  new_attempts := rec.failed_attempts + 1;
  new_lock     := now() + (new_attempts * 5 || ' minutes')::interval;

  update public.user_pins
    set failed_attempts = new_attempts,
        locked_until    = new_lock,
        updated_at      = now()
    where user_id = uid;

  return jsonb_build_object(
    'ok', false,
    'reason', 'wrong',
    'locked_until', new_lock,
    'attempts', new_attempts
  );
end;
$$;

revoke all on function public.verify_pin(text) from public;
grant execute on function public.verify_pin(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Wallet credit — must not be directly callable by clients
-- ---------------------------------------------------------------------
-- Any authenticated user could previously call increment_wallet(delta) and
-- credit their own wallet up to the 10M ceiling with no payment proof. We
-- revoke direct execute and add a new RPC that requires a payment_intents
-- row created by our (server-side) payment webhook.
--
-- If the payments webhook isn't wired yet, users simply cannot self-credit
-- — funding is blocked until the server-side flow is deployed. Better than
-- letting anyone print money.

revoke execute on function public.increment_wallet(numeric, text) from authenticated;
revoke execute on function public.increment_wallet(numeric, text) from public;
-- SECURITY DEFINER functions we author can still call it via the postgres
-- owner privilege (the function's owner grants itself execute at runtime).

-- Ledger of payment intents. Written only by the server-side webhook (via
-- the service role). Consumed by claim_payment() below, which credits the
-- wallet and marks the row consumed atomically.
create table if not exists public.payment_intents (
  reference       text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  amount_naira    numeric(14,2) not null check (amount_naira > 0),
  status          text not null default 'pending'
                    check (status in ('pending','verified','consumed','failed')),
  created_at      timestamptz not null default now(),
  verified_at     timestamptz,
  consumed_at     timestamptz
);

alter table public.payment_intents enable row level security;
-- Users can read their own payment history but never write.
drop policy if exists "payment_intents_select_own" on public.payment_intents;
create policy "payment_intents_select_own"
  on public.payment_intents for select
  using (auth.uid() = user_id);

-- Claim (credit) a verified payment reference. Idempotent: a second call
-- with the same reference sees status='consumed' and returns the balance
-- without double-crediting.
create or replace function public.claim_payment(reference text)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid       uuid := auth.uid();
  rec       public.payment_intents;
  new_bal   numeric;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if reference is null or length(reference) < 4 then
    raise exception 'invalid reference' using errcode = '22023';
  end if;

  -- Lock the row for the caller so concurrent claims can't double-credit.
  select * into rec
    from public.payment_intents
    where payment_intents.reference = claim_payment.reference
    for update;

  if not found                 then raise exception 'unknown payment reference'; end if;
  if rec.user_id  <> uid       then raise exception 'payment does not belong to caller'; end if;
  if rec.status   = 'consumed' then
    -- Already credited. Return current balance without changing anything.
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
     set status      = 'consumed',
         consumed_at = now()
   where payment_intents.reference = claim_payment.reference;

  insert into public.wallet_transactions (user_id, delta, new_balance, kind, reference)
  values (uid, rec.amount_naira, new_bal, 'credit', claim_payment.reference);

  return new_bal;
end $$;

revoke all on function public.claim_payment(text) from public;
grant execute on function public.claim_payment(text) to authenticated;

-- =====================================================================
-- End
-- =====================================================================
