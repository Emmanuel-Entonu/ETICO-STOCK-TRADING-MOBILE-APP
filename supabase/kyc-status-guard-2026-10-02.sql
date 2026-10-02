-- KYC status guard (2026-10-02).
--
-- Signed-in users can UPDATE most of their own profile columns (needed for the
-- KYC form). That also let a client mark itself kyc_status='verified' /
-- cacs_status='pending' without a verified BVN (how BVN-skipped testers ended up
-- "under review" yet invisible to the partner dashboard), or even set its own
-- CSCS decision. This trigger enforces, for CLIENT writes only:
--   * kyc_status -> 'verified'  requires a server-verified BVN (bvn_verified_at)
--   * cacs_status -> 'pending'  requires a server-verified BVN
--   * cacs_status -> 'approved' / 'rejected'  never (reviewer / server only)
-- Server writes (service role: web finalize route, partner dashboard, proxy) and
-- the SQL editor are not affected. Normal client writes ('skipped',
-- 'submitted', 'pending' stub, profile edits) are unaffected.
--
-- Safe to run more than once. To switch it off:
--   drop trigger if exists profiles_kyc_guard on public.profiles;

create or replace function public.profiles_kyc_guard()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_old_kyc  text := case when tg_op = 'UPDATE' then old.kyc_status  end;
  v_old_cacs text := case when tg_op = 'UPDATE' then old.cacs_status end;
begin
  -- Only signed-in / anonymous API clients are restricted.
  if v_role is null or v_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.kyc_status = 'verified'
     and new.kyc_status is distinct from v_old_kyc
     and new.bvn_verified_at is null then
    raise exception 'Verify your BVN before submitting KYC.' using errcode = '42501';
  end if;

  if new.cacs_status is distinct from v_old_cacs then
    if new.cacs_status in ('approved', 'rejected') then
      raise exception 'Only the reviewer can change the CSCS status.' using errcode = '42501';
    end if;
    if new.cacs_status = 'pending' and new.bvn_verified_at is null then
      raise exception 'Verify your BVN before submitting KYC.' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_kyc_guard on public.profiles;
create trigger profiles_kyc_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_kyc_guard();
