-- ── KYC settlement account + VA-persistence RPC (shared Supabase project) ────
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
-- Supports the mobile KYC changes: settlement bank account fields, the
-- (critical) bvn column re-add, and the set_virtual_account RPC used by
-- ensureWallet so VA persistence survives the va_* column revoke.

-- 1) Settlement (bank) account — PAC account-opening form's "BANK ACCOUNT
--    DETAILS": where sale proceeds / withdrawals are paid out. Reviewed on the
--    PAC partner dashboard. (Same columns the web app writes.)
alter table public.profiles
  add column if not exists settlement_account_name   text,
  add column if not exists settlement_account_number text,
  add column if not exists settlement_bank_name      text;

-- 2) CRITICAL — re-add the plaintext bvn column. A half-finished "encrypt at
--    rest" migration dropped it, so BOTH apps' KYC (which write profiles.bvn)
--    currently fail. This restores it. Old BVNs were never encrypted and can't
--    be recovered; new submissions save fine after this.
alter table public.profiles
  add column if not exists bvn text;

-- 3) VA persistence RPC. The va_* columns are UPDATE-revoked from clients
--    (funding-security-patch.sql), so the app can't write them directly. This
--    SECURITY DEFINER function does the one-time write, but ONLY for the
--    caller's own row and ONLY when va_reference is still null — so it can
--    neither overwrite an existing VA nor point at someone else's.
--
--    ⚠️ RESIDUAL RISK (defence-in-depth only): the values still originate from
--    the client. A caller with no VA yet could set va_reference to an arbitrary
--    string. The reconciler credits a user's wallet from the balance of the VA
--    named by their va_reference, so pointing it at ANOTHER user's VA reference
--    would mis-credit deposits. That reference is opaque and RLS-protected (never
--    exposed to other clients), so it isn't practically obtainable — but the
--    authoritative fix is to persist va_* SERVER-SIDE in the moneta-va proxy
--    (using the reference the proxy itself just created for this authenticated
--    user) and drop the client-supplied path entirely. The shape checks below
--    reduce, but do not eliminate, the trust placed in the client.
create or replace function public.set_virtual_account(
  p_ref text, p_num text, p_bank text, p_name text
) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  -- Basic shape validation (defence-in-depth).
  if coalesce(length(p_ref), 0)  not between 1 and 128
  or coalesce(length(p_num), 0)  not between 6 and 20
  or coalesce(length(p_bank), 0) not between 1 and 80
  or coalesce(length(p_name), 0) not between 1 and 120
  or p_num !~ '^[0-9]+$' then
    raise exception 'invalid virtual account payload' using errcode = '22023';
  end if;
  update public.profiles
     set va_reference=p_ref, va_number=p_num, va_bank=p_bank, va_account_name=p_name
   where id = uid and va_reference is null;   -- one-time; never overwrite → no hijack
end $$;
revoke all on function public.set_virtual_account(text,text,text,text) from public;
grant execute on function public.set_virtual_account(text,text,text,text) to authenticated;

-- 4) Account deletion request (Google Play requires an in-app way to request
--    account + data deletion). The app calls request_account_deletion(), which
--    stamps the profile and disables further use; an operator/cron with the
--    service role then performs the hard delete (auth user + data purge) after
--    honouring any legally-mandated retention (SEC / AML records).
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  update public.profiles
     set deletion_requested_at = now(), updated_at = now()
   where id = uid;
end $$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- 5) SECURITY HARDENING (idempotent) — clients must NEVER directly write the
--    money / VA columns. Every legitimate change goes through a SECURITY DEFINER
--    RPC (decrement_wallet, increment_wallet, reconcile_deposit,
--    set_virtual_account). Without this, a signed-in user could
--    `update profiles set wallet_balance = 9999999 where id = auth.uid()` and
--    then trade against the company float — direct theft. Safe to enforce: the
--    app only READS wallet_balance and sets it via RPC; va_* go through
--    set_virtual_account. (New rows are still INSERTable — this only blocks UPDATE.)
alter table public.profiles enable row level security;

-- A blanket table-level UPDATE grant OVERRIDES column-level REVOKEs, so we must
-- revoke UPDATE on the whole table and grant it back on every column EXCEPT the
-- money/VA ones. The DO block enumerates the columns AS THEY EXIST WHEN IT RUNS.
-- anon gets no UPDATE at all.
--
--   ⚠️  `alter table ... add column` does NOT auto-grant. After adding ANY new
--       profiles column that the client must write, RE-RUN this block (or
--       supabase/fix-profiles-column-grants-*.sql), or the client UPDATE/upsert
--       that touches it fails with `42501 permission denied for table profiles`.
--       (This is exactly what broke KYC when selfie_path + next_of_kin_* were added.)
revoke update on public.profiles from authenticated, anon;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in (
      'wallet_balance','va_reference','va_number','va_bank',
      'va_account_name','va_last_balance',
      -- added 2026-09-23: later money/identity columns (see URGENT-revoke-va-available-*.sql)
      'va_available','has_pin','partner_ref','partner_email'
    );
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;

--    NOTE (not enforced here): kyc_status, cacs_status and pac_account_id are
--    ALSO sensitive (forging cacs_status='approved' bypasses the in-app trade
--    gate). They are NOT revoked here because the mobile KYC finalize still
--    client-writes them; lock them down together with a finalize_kyc()
--    SECURITY DEFINER RPC (mirror set_virtual_account) as the next step.

--    VERIFY the revoke took — this SELECT should return ZERO rows:
--      select grantee, column_name
--        from information_schema.column_privileges
--       where table_schema='public' and table_name='profiles'
--         and privilege_type='UPDATE' and grantee in ('authenticated','anon')
--         and column_name in ('wallet_balance','va_reference','va_number',
--                             'va_bank','va_account_name','va_last_balance');

-- 6) Reload PostgREST so the new columns + functions are visible to the API.
notify pgrst, 'reload schema';
