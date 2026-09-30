-- ─────────────────────────────────────────────────────────────────────────────
-- Remove NIN: we no longer collect a NIN (or any ID document number).
-- Drops profiles.nin, profiles.id_type, profiles.id_number (id_type/id_number
-- only ever held the NIN) and recreates partner_list_submissions without them.
-- ─────────────────────────────────────────────────────────────────────────────
-- RUN ONLY AFTER the new app build (without NIN) is installed. Older builds on
-- phones still read and write these columns: after this runs, their KYC submit
-- and wallet setup would fail. The website is already updated.
--
-- The Moneta wallet (VA) payload still carries `nin`: the apps send the
-- placeholder 0000000000 and never read it from the database.
--
-- Irreversible: the NIN values stored in these columns are deleted.
-- No CASCADE: if anything else depends on a column, the drop stops with an
-- error naming it instead of silently removing that object.

-- 1) The partner list function returns id_type/id_number; replace it first.
drop function if exists public.partner_list_submissions();

create function public.partner_list_submissions()
returns table (
  id                        uuid,
  full_name                 text,
  email                     text,
  phone                     text,
  date_of_birth             text,
  address                   text,
  gender                    text,
  nationality               text,
  state_of_origin           text,
  bvn                       text,
  settlement_bank_name      text,
  settlement_account_number text,
  settlement_account_name   text,
  kyc_status                text,
  cacs_status               text,
  cacs_rejection_reason     text,
  pac_account_id            text,
  updated_at                timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_partner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, p.date_of_birth::text, p.address,
           p.gender, p.nationality, p.state_of_origin, p.bvn,
           p.settlement_bank_name, p.settlement_account_number,
           p.settlement_account_name, p.kyc_status, p.cacs_status,
           p.cacs_rejection_reason, p.pac_account_id, p.updated_at
      from public.profiles p
     where p.kyc_status in ('submitted', 'verified')
        or p.cacs_status in ('pending', 'approved', 'rejected')
     order by (p.cacs_status = 'pending') desc, p.updated_at desc nulls last;
end $$;
revoke all on function public.partner_list_submissions() from public, anon;
grant execute on function public.partner_list_submissions() to authenticated;

-- 2) Drop the columns.
alter table public.profiles drop column if exists nin;
alter table public.profiles drop column if exists id_type;
alter table public.profiles drop column if exists id_number;

notify pgrst, 'reload schema';

-- Check (should return no rows):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name in ('nin', 'id_type', 'id_number');
