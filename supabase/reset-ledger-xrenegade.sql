-- ── Reset the wallet/VA ledger for xrenegade1815@gmail.com ──────────────────
-- Run in the Supabase SQL editor (service role). Clears OUR ledger + VA state.
-- NOTE: this does NOT touch the user's PAC account cash balance (that lives on
-- PAC's side — ask Melvin to zero it there if needed). It only resets the VA
-- side and our ledgers so funding starts from a clean slate.
--
-- PREREQUISITE: run supabase/va-wallet-separation.sql first — it creates
-- va_ledger + profiles.va_available. Without it you get
-- `relation "public.va_ledger" does not exist`.
--
-- This block is defensive: each table/column it touches is guarded so a
-- partially-migrated database resets what exists and skips (with a notice)
-- what doesn't, instead of aborting the whole transaction on the first miss.

do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower('xrenegade1815@gmail.com');
  if uid is null then
    raise notice 'user not found';
    return;
  end if;

  -- va_ledger — created by va-wallet-separation.sql
  if to_regclass('public.va_ledger') is not null then
    delete from public.va_ledger where user_id = uid;
  else
    raise notice 'skip: public.va_ledger missing (run va-wallet-separation.sql)';
  end if;

  -- wallet_transactions — created by audit_2026_fixes.sql (legacy wallet ledger)
  if to_regclass('public.wallet_transactions') is not null then
    delete from public.wallet_transactions where user_id = uid;
  else
    raise notice 'skip: public.wallet_transactions missing';
  end if;

  -- Zero whichever VA/wallet columns exist on profiles.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'va_available') then
    update public.profiles set va_available = 0 where id = uid;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'va_last_balance') then
    update public.profiles set va_last_balance = 0 where id = uid;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'wallet_balance') then
    update public.profiles set wallet_balance = 0 where id = uid;  -- deprecated column; zero it too
  end if;

  update public.profiles set updated_at = now() where id = uid;

  raise notice 'reset complete for %', uid;
end $$;

-- Verify:
-- select va_available, va_last_balance, wallet_balance from public.profiles
--   where id = (select id from auth.users where lower(email)=lower('xrenegade1815@gmail.com'));
-- select * from public.va_ledger where user_id =
--   (select id from auth.users where lower(email)=lower('xrenegade1815@gmail.com'));
