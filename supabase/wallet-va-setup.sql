-- ── Moneta virtual account (wallet) columns ─────────────────────────────────
-- Each user gets a dedicated Moneta virtual account (Providus Bank) they can
-- fund by bank transfer. The app tracks the balance from Moneta's
-- get-account-balance endpoint (routed through the whitelisted static-IP proxy).
-- The PAC buying-power side is intentionally left untouched for now.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.

alter table public.profiles
  add column if not exists va_reference    text,
  add column if not exists va_number       text,
  add column if not exists va_bank         text,
  add column if not exists va_account_name text;

-- Look-ups by VA reference (e.g. when a funding webhook credits a wallet later).
create index if not exists profiles_va_reference_idx
  on public.profiles (va_reference);

-- RLS: profiles already restricts rows to auth.uid() = id for select/update, so
-- these columns inherit that policy. No extra grants are required. The service
-- token that creates the VA lives only on the Vercel proxy, never in the client.
