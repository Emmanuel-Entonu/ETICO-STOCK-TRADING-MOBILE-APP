-- ── VA funding integrity: status lifecycle + atomic settle/reverse ──────────
-- Run in the Supabase SQL editor AFTER va-wallet-separation.sql. Safe to re-run.
--
-- Problem this fixes (the "stuck state"): funding money VA→PAC is a two-system
-- move (debit va_available in our DB, then post a DEPOSIT to PAC). The old flow
-- reserved, fired PAC, and on PAC failure did a best-effort separate reversal.
-- If that reversal itself failed, va_available stayed debited with nothing in
-- PAC (user short), and there was no record to heal it. And if PAC actually
-- posted but the response was lost, a blind reversal double-credited (free
-- money).
--
-- The fix:
--   • Every funding reservation is now a 'pending' ledger row.
--   • On PAC success → va_settle_funding marks it 'completed'.
--   • On PAC failure → va_reverse_funding ATOMICALLY (one transaction) credits
--     va_available back, writes the reversal row, and marks the funding row
--     'reversed'. It only acts on a still-'pending' row, so it is idempotent and
--     can never double-reverse or reverse a completed funding.
--   • Rows stuck in 'pending' (both the PAC call and the reversal failed) are
--     found by /api/repair-funding and resolved deterministically.

-- 1) status column on va_ledger. Existing rows are historical/settled. --------
alter table public.va_ledger
  add column if not exists status text not null default 'completed'
  check (status in ('pending','completed','reversed'));

-- Fast lookup for the repair job.
create index if not exists va_ledger_pending_idx
  on public.va_ledger (created_at)
  where status = 'pending';

-- 2) va_debit now stamps funding/payout reservations as 'pending'. ------------
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

  -- A reservation is PENDING until PAC confirms (settle) or fails (reverse).
  insert into public.va_ledger (user_id, type, amount, balance_after, reference, status)
  values (p_uid, p_type, -p_amount, v_new, p_ref, 'pending');

  return v_new;
end $$;

revoke all on function public.va_debit(uuid, numeric, text, text) from public, authenticated;
grant execute on function public.va_debit(uuid, numeric, text, text) to service_role;

-- 3) va_settle_funding — mark a pending funding row completed. ----------------
-- Idempotent: only touches a still-'pending' row. Returns true if it settled one.
create or replace function public.va_settle_funding(p_ref text, p_pac_txn_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.va_ledger
     set status     = 'completed',
         pac_txn_id = coalesce(p_pac_txn_id, pac_txn_id)
   where reference = p_ref
     and type = 'funding'
     and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.va_settle_funding(text, text) from public, authenticated;
grant execute on function public.va_settle_funding(text, text) to service_role;

-- 4) va_reverse_funding — atomic, idempotent reversal of a pending funding. ---
-- In ONE transaction: credit va_available back, write the reversal row, and
-- mark the funding row 'reversed'. Only acts on a 'pending' row — a completed or
-- already-reversed funding is a no-op (returns current va_available), so a retry
-- (or a race with the repair job) can never double-credit.
create or replace function public.va_reverse_funding(p_ref text)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_row public.va_ledger%rowtype; v_new numeric; v_amt numeric;
begin
  select * into v_row
    from public.va_ledger
   where reference = p_ref and type = 'funding'
   for update;

  if not found then
    return null;                       -- unknown reference
  end if;

  if v_row.status <> 'pending' then
    -- Already settled or reversed → idempotent no-op.
    select va_available into v_new from public.profiles where id = v_row.user_id;
    return v_new;
  end if;

  v_amt := abs(v_row.amount);

  update public.profiles
     set va_available = coalesce(va_available, 0) + v_amt,
         updated_at   = now()
   where id = v_row.user_id
  returning va_available into v_new;

  insert into public.va_ledger (user_id, type, amount, balance_after, reference, status)
  values (v_row.user_id, 'reversal', v_amt, v_new, p_ref || '-rev', 'completed');

  update public.va_ledger set status = 'reversed' where id = v_row.id;

  return v_new;
end $$;

revoke all on function public.va_reverse_funding(text) from public, authenticated;
grant execute on function public.va_reverse_funding(text) to service_role;

-- notify PostgREST to reload the schema so the new RPCs are callable immediately.
notify pgrst, 'reload schema';
