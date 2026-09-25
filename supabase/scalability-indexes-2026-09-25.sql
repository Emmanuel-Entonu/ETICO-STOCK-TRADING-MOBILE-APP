-- ─────────────────────────────────────────────────────────────────────────────
-- Scalability: indexes for the hot query paths (2026-09-25)
-- ─────────────────────────────────────────────────────────────────────────────
-- Every lookup below runs on each app open / request. Without an index Postgres
-- scans the whole table — invisible at 9 users, a slowdown at tens of thousands.
-- All `if not exists` → idempotent, safe to re-run. Tables are small today, so
-- plain (non-CONCURRENTLY) creation is instant and fine in the SQL editor.

-- profiles
create index if not exists profiles_pac_account_id_idx on public.profiles (pac_account_id);   -- pac-proxy ownership, KYC finalize "already linked" check
create index if not exists profiles_email_idx          on public.profiles (email);            -- password reset lookup (email = …)
create index if not exists profiles_cacs_status_idx    on public.profiles (cacs_status);      -- partner dashboard pending queue
create index if not exists profiles_va_reference_idx   on public.profiles (va_reference);     -- reconciler / VA webhooks

-- money + activity history, always read newest-first per user
create index if not exists va_ledger_user_created_idx           on public.va_ledger (user_id, created_at desc);
create index if not exists va_ledger_reference_idx              on public.va_ledger (reference);          -- idempotency / settle / reverse by ref
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions (user_id, created_at desc);
create index if not exists orders_user_created_idx              on public.orders (user_id, created_at desc);
create index if not exists trades_user_created_idx              on public.trades (user_id, created_at desc);
create index if not exists payment_intents_user_idx             on public.payment_intents (user_id);

-- password reset throttle + latest-code lookup
create index if not exists password_reset_otps_email_created_idx on public.password_reset_otps (email, created_at desc);

-- Refresh planner statistics so the new indexes are used immediately.
analyze public.profiles, public.va_ledger, public.wallet_transactions, public.orders,
        public.trades, public.payment_intents, public.password_reset_otps;

-- VERIFY:
--   select indexname from pg_indexes where schemaname='public' and indexname like '%_idx' order by 1;
