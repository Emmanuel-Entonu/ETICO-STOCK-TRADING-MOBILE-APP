-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications + multi-device push (2026-09-25)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. push_tokens   — one row per DEVICE (Expo push token), so an event reaches
--                    every device the account is signed in on. The app used to
--                    write profiles.push_token, a column that never existed, so
--                    remote push never worked.
-- 2. notifications — server-side source of truth for account/money events
--                    (CSCS approved/rejected, deposit received, wallet funded).
--                    read_at lives here, so "seen" syncs across devices and
--                    survives reinstalls.
-- Rows are written ONLY by the server (service role). Users can read their own,
-- mark their own read, and register/unregister their own device tokens.
-- Idempotent. Run in the Supabase SQL editor.

-- ── push_tokens ─────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- A device token belongs to whoever is signed in on that device NOW: if the
-- phone switches accounts, the token moves to the new user (no cross-account
-- pushes). SECURITY DEFINER so it can take over a row owned by the old user.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(length(p_token), 0) not between 10 and 300 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, uid, left(p_platform, 20), now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

-- Sign-out: this device stops receiving the account's pushes.
create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ── notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null default 'account',   -- account | money | trade | system
  title      text not null,
  body       text not null,
  route      text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_mark_read_own" on public.notifications;
create policy "notifications_mark_read_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clients may read their own rows and set read_at — nothing else.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

notify pgrst, 'reload schema';

-- VERIFY:
--   select count(*) from public.push_tokens;
--   select user_id, type, title, created_at, read_at from public.notifications order by created_at desc limit 20;
