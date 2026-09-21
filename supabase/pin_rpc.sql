-- Transaction PIN — server-side lock, bcrypt hash, escalating lockout.
-- Client never sees the hash or bypasses rate limits: table has RLS with no
-- policies (client cannot select/insert), and all access goes through
-- SECURITY DEFINER RPCs that scope to auth.uid().
--
-- Supabase installs pgcrypto into the `extensions` schema by default, which
-- is not on the default search_path for SECURITY DEFINER functions. We fully
-- qualify crypt() / gen_salt() as extensions.* so the RPCs work regardless.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_pins (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.user_pins enable row level security;
-- Intentionally no policies. Only SECURITY DEFINER functions below can touch this table.

alter table public.profiles
  add column if not exists has_pin    boolean     not null default false;

-- Some prior migrations install a `profiles_set_updated_at` trigger that
-- writes NEW.updated_at on every update. Ensure the column exists so any
-- `update profiles ...` from these RPCs doesn't blow up on the trigger.
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- ─────────────────────────────────────────────────────────────
-- set_pin(new_pin)
-- ─────────────────────────────────────────────────────────────
-- First-time creation OR post-reset rotation. Resets the lockout counter
-- so a user who reset via password can log in immediately.
create or replace function public.set_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if new_pin !~ '^\d{6}$' then
    raise exception 'PIN must be exactly 6 digits' using errcode = '22023';
  end if;

  insert into public.user_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (uid, extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (user_id) do update
    set pin_hash        = excluded.pin_hash,
        failed_attempts = 0,
        locked_until    = null,
        updated_at      = now();

  update public.profiles set has_pin = true where id = uid;
end;
$$;

revoke all on function public.set_pin(text) from public;
grant execute on function public.set_pin(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- verify_pin(pin) — bcrypt compare + rate limit + escalating lockout
-- ─────────────────────────────────────────────────────────────
-- Returns jsonb:
--   { ok: true }                                                    on success
--   { ok: false, reason: 'no_pin' }                                 no PIN set
--   { ok: false, reason: 'locked', locked_until: ts }               lockout active
--   { ok: false, reason: 'wrong',  locked_until: ts|null, attempts: n } wrong PIN
--
-- Rate limit: the user gets 3 tries before any lockout. A lockout is applied
-- only on every 3rd consecutive wrong attempt (attempts 3, 6, 9, …); attempts
-- 1, 2, 4, 5, … return 'wrong' with locked_until = null (no lock, just wrong).
-- Escalation: the Nth lockout lasts N * 3 minutes — 1st = 3min, 2nd = 6min,
-- 3rd = 9min, … Counter resets only on a successful verify or on set_pin.
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
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into rec from public.user_pins where user_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
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

  -- Lock only on every 3rd wrong attempt; escalate 3 minutes per lockout.
  if new_attempts % 3 = 0 then
    new_lock := now() + ((new_attempts / 3) * 3 || ' minutes')::interval;
  else
    new_lock := null;   -- still within the current window of 3 tries
  end if;

  update public.user_pins
    set failed_attempts = new_attempts,
        locked_until    = new_lock,
        updated_at      = now()
    where user_id = uid;

  return jsonb_build_object(
    'ok', false,
    'reason', 'wrong',
    'locked_until', new_lock,          -- null unless this attempt triggered a lock
    'attempts', new_attempts
  );
end;
$$;

revoke all on function public.verify_pin(text) from public;
grant execute on function public.verify_pin(text) to authenticated;
