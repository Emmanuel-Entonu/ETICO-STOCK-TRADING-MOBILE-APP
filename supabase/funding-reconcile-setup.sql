-- ── Auto-funding reconciliation baseline ────────────────────────────────────
-- The reconciler compares each user's live Moneta VA balance to the last one it
-- processed (va_last_balance). A positive delta = a new deposit → it funds the
-- user's PAC account for that delta and advances the baseline. wallet_balance is
-- the app-tracked spendable figure (deposits − buys + sells); PAC buying power
-- mirrors it, and the company float with PAC is settled EOD.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.profiles
  add column if not exists va_last_balance numeric not null default 0;

-- The reconciler runs server-side (Vercel /api/reconcile-funding) driven by a
-- schedule. Option A — Supabase pg_cron + pg_net (every 5 min):
--
--   select cron.schedule(
--     'etico-funding-reconcile', '*/5 * * * *',
--     $$ select net.http_post(
--          url    := 'https://moneta-app-ten.vercel.app/api/reconcile-funding',
--          headers:= jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
--        ); $$);
--
-- Option B — a Vercel Cron hitting the same URL with the x-cron-secret header.
