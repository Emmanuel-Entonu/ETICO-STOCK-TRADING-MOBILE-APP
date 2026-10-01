# Web parity handoff — Wallet, KYC selfie, settlement flow

> **Written for: the Niqra-web team.** This describes what the mobile app now
> does so you can mirror it on `www.etico.ng` + the PAC partner dashboard. Shared
> Supabase project `cmrxwuqfagqskrjdmjte`; shared Vercel proxy
> `moneta-app-ten.vercel.app`. Nothing here is web-specific unless called out.
> **Do not move this file into the web repo yet** — it lives in the mobile repo's
> `docs/` for now.
>
> **Update 2026-10-01:** web is at parity for everything below plus Events/IPO and the NIN removal
> (KYC step 2 is now the settlement account only — no NIN/ID field anywhere). Latest state:
> [`SESSION_2026-10-01_HANDOFF.md`](SESSION_2026-10-01_HANDOFF.md).

---

## 1. Wallet system (two balances)

There are **two distinct balances**, never conflate them:

| Balance | Source of truth | Meaning |
|---|---|---|
| **Trading wallet** | the user's **live PAC account cash** (read from PAC) | buying power on the exchange. NOT stored in our DB. |
| **Virtual Account (`va_available`)** | `profiles.va_available` (our ledger) | money the user has deposited that is **available to move** into the trading wallet. |

Do **not** display the raw Moneta VA balance — Providus sweeps it, so it reads ~0. Show `va_available`.

### Flow
1. User transfers into their Moneta virtual account (Providus). It's a **collection account** — funds settle to the Moneta settlement account (`11011120221`), the VA balance returns to ~0, and Moneta records a transaction.
2. **Reconciler** (`/api/reconcile-funding`) reads **each user's** VA balance (via `/api/moneta-va` `balance`, per-user — NOT the paginated `list`) and credits the positive delta to `va_available` (RPC `va_reconcile_deposit`), writing a `va_ledger` `deposit` row.
3. User **funds their wallet**: `/api/fund-wallet` reserves the amount from `va_available` (atomic RPC `va_debit`), fires a PAC `DEPOSIT` cash-transaction (create→post, sourced from the settlement account), and on PAC failure reverses (`va_credit`). Every move writes `va_ledger`.
4. The trading wallet = the live PAC balance, re-read after any move. **PAC's `cashBalance` field lags** a few seconds after posting — expected, not a bug.

### Database (already applied — shared project)
- `profiles` columns: `wallet_balance` (deprecated), **`va_available` numeric**, **`va_last_balance` numeric**, `va_reference`, `va_number`, `va_bank`, `va_account_name`, plus settlement + KYC columns (below). **Money columns have `UPDATE` revoked from clients** — all writes go through SECURITY DEFINER RPCs.
- **`va_ledger`** (append-only): `id, user_id, type ('deposit'|'funding'|'reversal'|'payout'), amount (signed), balance_after, reference (unique), pac_txn_id, created_at`. RLS: select own; no client writes.
- RPCs (service-role only, called by the proxy): `va_reconcile_deposit(uid, new_va)`, `va_debit(uid, amount, ref, type)`, `va_credit(uid, amount, ref, type)`, `set_virtual_account(...)`. SQL: `supabase/va-wallet-separation.sql`.

### Proxy endpoints (all on `moneta-app-ten.vercel.app`)
- `POST /api/fund-wallet` — JWT only; body `{ amount }`. VA→PAC.
- `POST /api/reconcile-funding` — JWT (self) or cron secret (all users). Credits `va_available`.
- `POST /api/moneta-va` — `{ action: 'create'|'balance'|'transactions'|'list' }`. `balance`/`transactions` resolve the VA ref from the caller's JWT (no client-supplied ref → no IDOR); cron may pass an explicit ref. Routes through the Fly static-IP proxy.
- `POST /api/pac-proxy?path=…` — PAC (MyWealthCare). **Uses `node-fetch`** (never `undici`/global fetch — it flaked/crashed; see the mobile HANDOFF).

---

## 2. UI changes (mobile) to mirror

- **Wallet screen** (`app/wallet.tsx`): two cards — **Trading Wallet** = live PAC balance ("buying power"); **Virtual Account** = `va_available` ("available to move"). **Activity** is two tabs: *Deposits* (real Moneta VA history via `/api/moneta-va` `transactions`) and *Wallet moves* (`va_ledger`). Deposit details (bank / account number / name) for adding money.
- **Fund wallet is its own page** (`app/fund-wallet.tsx`, a modal): pick amount (MAX) → **transaction PIN** → the app **awaits the PAC response** → success state → auto-returns with a *"balance updates shortly"* prompt. On failure the raw PAC/proxy error is **masked** behind a generic retry message.
- **PIN lockout UX**: **3 tries** before any lock; lock on every 3rd wrong attempt; first lock **3 min**, escalating **+3 min** per lock; "Wrong PIN. N tries left" in between; the locked message + red state **clear the instant the countdown ends**. Server logic in `supabase/pin_rpc.sql` (`verify_pin`); mirror the "clear on expiry" behavior in the web PIN component.
- **Funding is PIN-gated** exactly like trades.

---

## 3. KYC — now 4 steps (Step 4 = photo)

Steps: (1) BVN + personal details, (2) **settlement bank account** (the ID/NIN field was removed 2026-10-01), (3) review, (4) **verification photo**.

### Storage + column (already applied — `supabase/kyc-selfie.sql`)
- Private bucket **`kyc-selfies`**, object path **`<user_id>/selfie.jpg`**.
- Column **`profiles.selfie_path text`**.
- RLS: a user may read/write only their own `<user_id>/…` folder; the partner dashboard reads with the service role.

### Mobile (reference)
Front-camera `CameraView` (expo-camera) → capture → preview/retake → on submit, upload to `kyc-selfies/<uid>/selfie.jpg` (`src/lib/kycUpload.ts`) and write `profiles.selfie_path`. Submission is blocked until a photo exists and if the upload fails.

### Web — do this instead of a live selfie
**On web, let the user UPLOAD a passport photograph / photo file** (not a live camera capture):
1. `<input type="file" accept="image/*">` (optionally `capture="user"` on mobile browsers). Validate it's an image and reasonable size (≤ ~5 MB).
2. Upload the file directly:
   ```ts
   await supabase.storage.from('kyc-selfies')
     .upload(`${user.id}/selfie.jpg`, file, { contentType: file.type || 'image/jpeg', upsert: true })
   ```
3. Write `selfie_path = '<user_id>/selfie.jpg'` on `profiles` with the rest of the KYC.
4. Gate final submission on a photo being present, same as mobile.

### Partner dashboard (`Niqra-web/src/app/partner`)
Show the photo next to the user's KYC data via a **service-role signed URL**:
```ts
const { data } = await supabaseAdmin.storage.from('kyc-selfies')
  .createSignedUrl(profile.selfie_path, 3600)   // 1-hour URL
// <img src={data.signedUrl} />  (placeholder when selfie_path is null)
```
Full spec: `docs/KYC_SELFIE.md`.

---

## 4. Settlement bank account flow (KYC step 2) — not set up on web yet

The settlement account is where **sale proceeds / withdrawals** are paid out (PAC's "BANK ACCOUNT DETAILS"), reviewed on the partner dashboard. Mobile does:

1. **Bank dropdown** — static list `src/lib/banks.ts` (`NG_BANKS`): 26 major banks, each with `name`, `bankCode` (3-digit CBN) and `institutionCode` (6-digit NIBSS). This matches Tap-and-Pay's `lib/nibss-banks.ts` — keep them in sync.
2. **Account number** — 10 digits.
3. **Name enquiry** — once bank + 10-digit NUBAN are entered AND the user has an OTP-verified BVN, call `POST /api/account-name-enquiry` with `{ accountNumber, institutionCode, bvn }`. It runs Moneta's NIBSS **debit-instruction name-enquiry** (`/api/v2/debit-instruction/account/name-enquiry`, `institution_code`), which resolves the holder's name AND confirms the account is tied to that BVN. On success the name field locks read-only; on any failure (unverifiable MFB, mismatch, no BVN) it **falls back to manual entry** — never blocks KYC.
4. Persisted to `profiles.settlement_account_name / settlement_account_number / settlement_bank_name`.

**Web to build:** the same bank dropdown (reuse `NG_BANKS`), 10-digit account input, and call `/api/account-name-enquiry` with the same payload; fall back to manual entry on failure. The partner dashboard already reads the settlement columns.

---

## 5. Email (centralized) — in progress

All transactional email (CSCS request to PAC, activation, etc.) goes through **one proxy endpoint** `POST /api/send-email` — both mobile and web call it. It mints a Moneta notification token (`base64(emailClientId:emailClientSecret:notificationServiceKey)` → `/api/v2/generate-access-token`) and POSTs `api.moneta.ng/api/notification` through the whitelisted Fixie static IP. Pipeline verified end-to-end; **blocked only on Moneta whitelisting our egress IP `54.195.3.54`** for the notification service. Once whitelisted, `POST /api/send-email { to, subject, content|html }` sends. Env: `MONETA_EMAIL_CLIENT_ID`, `MONETA_EMAIL_CLIENT_SECRET`, `MONETA_EMAIL_SERVICE_KEY` (set in Vercel).

---

## 6. iOS review note (mobile)

Reviewed the new features against the iOS build: the fund-wallet auto-return timer is now cleared on unmount; PIN-modal reanimated worklet reads only a shared value (no `colors` proxy — the prior iOS-crash class); modals are single-presentation. **One thing to eyeball on the iOS build:** the live `CameraView` sits inside the KYC `ScrollView` (works, but camera-in-scrollview can flicker on iOS). Not applicable to web (web uploads a file).
