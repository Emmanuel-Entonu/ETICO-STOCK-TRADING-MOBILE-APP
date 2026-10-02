# Session handoff — 2026-10-01 → 10-02 (launch day)

> **Read this first**, then [`SESSION_2026-10-01_HANDOFF.md`](SESSION_2026-10-01_HANDOFF.md) and
> [`../HANDOFF.md`](../HANDOFF.md). **No secrets in this file** — it only says where they live.

Repos touched: mobile (this, `main`), proxy `moneta-app` (`main`, push = Vercel deploy),
web `NIQRA-WEB` (`master`, push = Vercel deploy), Fly app `moneta-proxy` (deploy is manual).

---

## 1. The incident: every wallet showed the same ₦796 / shared history

**Root cause (ours, not Moneta's).** The Fly static-IP proxy (`moneta-app/proxy/server.js`,
route `/nibss-app/*`) rebuilt the upstream URL from `req.path`, which has **no query string**.
Since `57d60cc` (21 Sep) switched balance reads to
`/partner/virtual-accounts/account-balance?virtual_account_reference=…`, Moneta never received the
reference. Per Moneta's docs the reference is optional on the history endpoints, so without it:

- `account-balance` returned the **total of all ETICO VAs** (₦199, then ₦796 after a real ₦600
  deposit into Blessing's VA on 30 Sep 14:00 WAT, ref `MNTP6ABD080503958`);
- `transaction-histories` returned **every user's** transactions (everyone saw the same Deposits);
- `reconcile-funding` credited each user the **rise in that shared total** as a "deposit"
  (+₦597 / +₦796 on 30 Sep, earlier +₦99.5 / +₦199).

**Fix:** `proxy/server.js` forwards the query string (`queryOf(req)`), deployed to Fly on 1 Oct.
**Guard:** `moneta-va.ts` `upstreamHonoursRef()` asks Moneta for a fake reference; if it gets a
non-zero balance, balance/history/IPO resolution return 503 instead of trusting shared data
(cached 10 min per instance).

**Ledger after the incident:** chains and sums are consistent (verified). Corrections written as
`reversal` rows `correction-2026-10-01-<uid8>` (Muhammad −₦796 → ₦0, Blessing +₦51 → ₦72).
Test accounts on the old "Blessing" merchant (owner, George, A.A.'s old VA) keep their false
credits — owner decided they get fresh starts. A.A. got a new ETICO VA **9649687793**
(ref `VAD80UMRBVTEISLWRKHA1T`, created with the placeholder BVN — he had none on file) and was
sent back to redo KYC (`cacs_status='rejected'`, reason: verify BVN).

## 2. Fly proxy — IMPORTANT

- Moneta whitelists the **Fly egress IP 50.31.197.117**. It is **not reserved**: it is the host of
  machine `48e0327a71d508`. The second machine `32872377ad6098` egresses from `50.31.197.69`
  (not whitelisted) — it is **stopped with autostart disabled**. Don't re-enable it.
- **To do:** `fly ips allocate-egress -a moneta-proxy`, give the new IP to Moneta to whitelist.
- Deploy: `cd proxy && fly deploy -a moneta-proxy --strategy immediate`, then check
  `curl https://moneta-proxy.fly.dev/ip` → must be `50.31.197.117`.
- Fixie (54.195.3.54 works; 54.217.142.99 is **not** whitelisted for app.moneta.ng VA calls)
  is used for BVN/email/name-enquiry only. Plan: Cruiser.

## 3. What changed (all pushed)

**Proxy (`moneta-app`)**
- Shared Moneta partner token across Vercel instances (`public.moneta_token_cache`, row
  `partner`; mint lock). Moneta keeps ONE live token — per-instance mints were invalidating each
  other under load (verified: 1 of 3 parallel calls failed before, 5/5 after).
- Same for the NIBSS service token (row `nibss`, used by `nibss-bvn` + `account-name-enquiry`).
  **Kill switch:** delete the row → per-instance tokens again. Name-enquiry now refreshes a
  rejected token (it used to stay broken until the instance restarted).
- Only genuine token failures trigger a re-mint (a broad "invalid" match would knock out the
  shared token).
- `moneta-va` + `reconcile-funding` maxDuration **90 s** (Moneta ~22 s per call).
- Deposits feed merges VA-to-VA transfers (`transfer-histories`); new read-only `transfers` action.
- IPO stuck-payment resolver reads `transfer-histories` (IPO payments never appear in
  `transaction-histories`, so paid subscriptions would have been refunded after 60 min).
- `fund-wallet`: settles rows via `va_settle_funding`; auto-reverses **only** when PAC clearly
  refused the create (4xx except 408/409); otherwise leaves the row `pending` and returns 202
  "being confirmed" (no double pay-out). Pending rows need manual review.

**Web (`NIQRA-WEB`)**: 35 s BVN OTP lock; ticker/market widgets no longer stuck on sample
prices; KYC locks only BVN-supplied fields; wallet proxy routes 90 s; "being confirmed" funding
message; Deposits says when it failed to load.

**Mobile (`main`, needs a new build)**: 35 s OTP lock; BVN-supplied fields read-only (lock icon);
wallet loads without waiting for the deposit sync; "being confirmed" funding message; Deposits
load-failure state. Android 1.0.1 (versionCode 8) was submitted to Play **before** these.

## 4. SQL

| File | Status |
|---|---|
| `supabase/va-deposit-reference-fix-2026-10-01.sql` | **run** (unique deposit ledger reference) |
| `moneta-app/supabase/moneta-token-cache-2026-10-02.sql` | **run**; `nibss` row added by owner |
| `supabase/kyc-status-guard-2026-10-02.sql` | **to run** — clients can't self-verify KYC without a verified BVN or set their own CSCS decision. Off switch in the file. |

## 5. Builds / store

- Android: build with local credentials needs a root `credentials.json` (gitignored) pointing at
  `android/app/etico-release.keystore`. Windows PowerShell 5 writes UTF-8 **with BOM** → EAS
  rejects it; write it BOM-less. Each failed `eas build` still increments versionCode.
- Play: release is **Nigeria only**; reviewer login lives in **App content → Sign in details**.
  The previous rejection was a wrong reviewer password.

## 6. Open items

1. Run `kyc-status-guard-2026-10-02.sql`.
2. Reserve the Fly egress IP and get it whitelisted.
3. Move `moneta-app` and the web project to **Vercel Pro** (Hobby forbids commercial use).
4. Rotate secrets exposed during the session: Supabase service role key (update Vercel),
   `CRON_SECRET` (rotated 1 Oct, rotate again), delete the Fly deploy token.
5. Post-launch: credit deposits from Moneta transaction references instead of balance deltas
   (a spurious low balance reading could otherwise double-credit on recovery).
6. Ibrahim's profile points at the IPO **collection** VA 9644114164 (₦525 = Blessing's IPO
   payment); his own ₦199 is in VA 9648275047, not linked. Settle before unlinking the event.
