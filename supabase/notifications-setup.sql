-- ETICO — server-side notifications, DB-native (Supabase).
-- Run in the Supabase SQL Editor. Delivery to devices only works once the
-- Expo project is linked to FCM credentials (Firebase). Until then these
-- functions run and log, but Android won't receive the push.
--
-- Architecture: pg_net posts to the Expo Push API; pg_cron schedules the
-- market-open job; a trigger fires the CSCS-assigned push. Order-fill and
-- funding pushes are added once we can query PAC / receive funding webhooks
-- server-side (see notes at the bottom).

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pg_net;    -- HTTP from Postgres
create extension if not exists pg_cron;    -- scheduled jobs

-- ── Device push tokens live on the profile ───────────────────────────────────
alter table public.profiles add column if not exists push_token text;

-- ── Server-side notification log (so the app can also render server pushes) ───
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null default 'system',   -- trade | account | system
  title      text not null,
  body       text not null,
  route      text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
-- Each user can read + mark their own notifications; inserts happen via the
-- SECURITY DEFINER functions below (service role), not directly by clients.
create policy "own notifications - select" on public.notifications
  for select using (auth.uid() = user_id);
create policy "own notifications - update" on public.notifications
  for update using (auth.uid() = user_id);

-- ── Low-level: send one Expo push ────────────────────────────────────────────
create or replace function public.send_expo_push(p_token text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) = 0 then return; end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', p_token,
      'title', p_title,
      'body', p_body,
      'data', p_data,
      'channelId', 'trades',
      'priority', 'high'
    )
  );
end $$;

-- ── Notify a user: log it + push to their device ─────────────────────────────
create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_route text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  insert into public.notifications (user_id, type, title, body, route)
    values (p_user, p_type, p_title, p_body, p_route);
  select push_token into v_token from public.profiles where id = p_user;
  perform public.send_expo_push(
    v_token, p_title, p_body,
    case when p_route is null then '{}'::jsonb else jsonb_build_object('route', p_route) end
  );
end $$;

-- ── CSCS assigned → notify once, when cacs_status flips to 'approved' ─────────
create or replace function public.on_cacs_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cacs_status = 'approved' and coalesce(old.cacs_status, '') <> 'approved' then
    perform public.notify_user(new.id, 'account',
      'Your CSCS account is ready',
      'Your CSCS/CACS setup is complete. You can now trade on the NGX.',
      '/(app)');
  end if;
  return new;
end $$;

drop trigger if exists trg_cacs_approved on public.profiles;
create trigger trg_cacs_approved
  after update of cacs_status on public.profiles
  for each row execute function public.on_cacs_approved();

-- ── Market open → push everyone with a token, weekdays 09:00 WAT (08:00 UTC) ──
select cron.unschedule('etico-market-open') where exists (select 1 from cron.job where jobname = 'etico-market-open');
select cron.schedule('etico-market-open', '0 8 * * 1-5', $$
  select public.send_expo_push(push_token,
    'The NGX is open',
    'The Nigerian Exchange is now open for trading. Review your picks and place your orders.',
    jsonb_build_object('route', '/(app)/market'))
  from public.profiles where push_token is not null;
$$);

-- ── NOTES / still to wire ────────────────────────────────────────────────────
-- 1) ORDER FILLS: needs the server to know a fill happened. Either PAC sends a
--    webhook (preferred) -> an Edge Function calls notify_user, OR a pg_cron
--    job polls PAC per account with pending orders. Polling needs a way for the
--    server to authenticate to PAC without a user session (a service credential
--    on the proxy). Confirm PAC webhooks with Melvin before building this.
-- 2) FUNDING (credit/debit + amount): fire notify_user from the funding webhook
--    once the Moneta/PAC funding flow is wired.
-- 3) DELIVERY requires the Expo project to be linked to FCM (Firebase). Until
--    then send_expo_push runs but Android receives nothing.
