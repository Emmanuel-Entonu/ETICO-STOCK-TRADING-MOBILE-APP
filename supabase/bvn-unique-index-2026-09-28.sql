-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.bvn index — fast duplicate-BVN check + (when clean) one BVN per account
-- ─────────────────────────────────────────────────────────────────────────────
-- The nibss-bvn proxy now refuses a BVN already linked to another account
-- (issue log #2). That check is `profiles where bvn = …`, which needs an index
-- to stay fast as users grow. A UNIQUE index also enforces the rule in the
-- database itself, so no code path can ever create a second account per BVN.
--
-- As of 2026-09-28 ONE duplicate exists (same person, two accounts, both
-- CSCS-rejected): GEORGE GONSUR DESHI — deshigeorge@gmail.com (45a227ed…) and
-- gustcoast12@gmail.com (22b0c57d…). Until one of them has its bvn cleared, this
-- script creates a normal index; re-run it after the cleanup and it upgrades to
-- the unique one. Idempotent — safe to run any number of times.

do $$
declare dups int;
begin
  select count(*) into dups from (
    select bvn from public.profiles
     where bvn is not null and bvn <> ''
     group by bvn having count(*) > 1
  ) d;

  if dups = 0 then
    drop index if exists public.profiles_bvn_idx;
    create unique index if not exists profiles_bvn_uidx
      on public.profiles (bvn) where bvn is not null and bvn <> '';
    raise notice 'profiles_bvn_uidx (UNIQUE) in place';
  else
    create index if not exists profiles_bvn_idx
      on public.profiles (bvn) where bvn is not null and bvn <> '';
    raise notice '% duplicate BVN(s) — created a normal index; clean up and re-run for UNIQUE', dups;
  end if;
end $$;

-- To clean up the duplicate (pick the account to KEEP first), e.g. clear the
-- newer one's BVN so it must re-verify:
--   update public.profiles set bvn = null, bvn_verified_at = null
--    where id = '22b0c57d-acb3-4be2-9710-1baa6b6def4c';
-- …then run this file again.
