-- ── Extra identity columns captured from the BVN lookup ─────────────────────
-- The NIBSS BVN details response returns more than the app used to store.
-- These columns persist the full record so the wallet VA can be created with
-- the exact surname / first name / NIN, and so KYC records are complete.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table public.profiles
  add column if not exists first_name      text,
  add column if not exists middle_name     text,
  add column if not exists surname         text,
  add column if not exists nin             text,
  add column if not exists gender          text,
  add column if not exists marital_status  text,
  add column if not exists nationality     text,
  add column if not exists state_of_origin text,
  add column if not exists lga_of_origin   text,
  add column if not exists title           text;

-- RLS unchanged: profiles already restricts rows to auth.uid() = id.
