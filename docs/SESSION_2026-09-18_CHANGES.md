# ETICO — Change log, 2026-09-18

**Audience:** ETICO mobile engineering.
**Scope:** work done in one session across three repos — the mobile app
(`ETICO-STOCK-TRADING-MOBILE-APP`), the Vercel proxy (`moneta-app`), and setup in
Firebase/EAS/Supabase. Commits are noted per change.

---

## 1. App-lock / minimize behaviour + privacy covers
**Repo:** mobile · **Commit:** `b2a533d` (main)

Problem: minimizing the app wiped the navigation stack (back to Home, lost the
trade sheet), and back on the trade modal could close the whole app.

- [`src/store/pinStore.ts`](../src/store/pinStore.ts) — background no longer locks
  the session; it only records the time. The PIN is re-required on resume **only**
  if the 60s grace window elapsed. Within grace the user returns to the exact
  screen they left.
- [`app/_layout.tsx`](../app/_layout.tsx) — removed the eager
  `router.replace('/(auth)/pin')` on background (that was tearing down the stack);
  added a cross-platform `PrivacyOverlay` that blocks the screen the instant the
  app is not active.
- [`app/trade/[symbol].tsx`](../app/trade/%5Bsymbol%5D.tsx) — Android hardware/gesture
  back now closes the topmost sheet first, then dismisses the trade screen via
  `goBack()` — never exits the app. Added `onRequestClose` to the ReceiptSheet.
- [`ios/ETICO/AppDelegate.swift`](../ios/ETICO/AppDelegate.swift) — native iOS
  privacy cover on `applicationWillResignActive` (parity with Android
  `FLAG_SECURE` + native overlay).

> Native change note: `AppDelegate.swift` + `android/.../MainActivity.kt` are
> hand-edited. A `expo prebuild --clean` would clobber them — always scope
> prebuild to `-p ios`.

---

## 2. Registration / login / KYC / orders / notifications + iOS crash fixes
**Repo:** mobile · **Commit:** `5363c35` (main) · all typechecked

### Registration ([`app/(auth)/register.tsx`](../app/%28auth%29/register.tsx), [`authStore.ts`](../src/store/authStore.ts), new [`SocialAuthRow.tsx`](../src/components/SocialAuthRow.tsx))
- Added **phone number** field (validated, stored in `user_metadata` for KYC prefill).
- Added **confirm-password** field.
- **Per-field error display** (previously every error showed under the password box).
- **Clickable Terms / Privacy** links.
- **Social sign-up buttons** (Google / Apple / Facebook) via a shared
  `SocialAuthRow` reused by login + register.

### Login ([`app/(auth)/login.tsx`](../app/%28auth%29/login.tsx))
- Friendly **"email not confirmed"** message + **Resend activation link** button.
- Success **banner** when arriving with `?confirmed=1`.
- Social row now shared (`SocialAuthRow`).

### KYC ([`app/(auth)/kyc.tsx`](../app/%28auth%29/kyc.tsx))
- Prominent **"Continue without verification"** before entering BVN.
- **Prefill** name + phone from registration.
- **DOB auto-formats** to `YYYY-MM-DD`.
- **Per-field validation errors** when BVN is skipped (was a silently-disabled button).
- Removed **ID number** row from the step-3 review.
- **Settlement bank = dropdown** (see §3).

### Orders / Notifications
- [`OrderRow.tsx`](../src/components/OrderRow.tsx) — shows the **date** on every order row.
- [`notificationStore.ts`](../src/store/notificationStore.ts) + [`notifications.tsx`](../app/notifications.tsx)
  — **delete a notification** (persisted "dismissed" set so it won't reappear on sync).
- [`pushNotifications.ts`](../src/lib/pushNotifications.ts) — market-open reminder now
  clears **stale duplicates** from older builds (fixes the "sent ~5 times" pile-up).

### iOS-only crash fixes (Reanimated worklets)
Reanimated 4.5.1 is strict on iOS/JSI; Android tolerated these.
- [`Beams.tsx`](../src/components/Beams.tsx) — was calling the plain function
  `hexToRgb()` **inside** the `useDerivedValue` worklet → threw on iOS → the wealth
  card fell back to the gradient. Now precomputes RGB on the JS thread.
- [`app/(auth)/pin.tsx`](../app/%28auth%29/pin.tsx) — the `Dot` read the `colors`
  **Proxy** inside `useAnimatedStyle`; cloning a Proxy to the UI runtime crashes on
  iOS, and a new worklet is created each time a dot fills → the pad crashed
  mid-PIN-entry. Now resolves colours on the JS thread.

> **Rule going forward:** never read the `colors` theme Proxy or call a plain JS
> function inside a Reanimated worklet — hoist it to the component body.

---

## 3. Settlement-account name enquiry (KYC #18)
**Repos:** mobile (`5363c35`) + proxy `moneta-app` (`2ce4822`) · **tested live**

Goal: on KYC step 2, resolve the account holder's name from the bank + account
number, confirm it against the BVN, and save it.

- **Bank list with codes** — [`src/lib/banks.ts`](../src/lib/banks.ts): 26 NG banks
  with 3-digit CBN + 6-digit NIBSS `institutionCode` (pulled from Moneta's list).
- **Client** — [`src/lib/bankApi.ts`](../src/lib/bankApi.ts): `resolveAccountName`
  POSTs `{ accountNumber, institutionCode, bvn }` to the proxy's
  `/api/account-name-enquiry`, expects `{ name, verified }`.
- **KYC wiring** — resolves + locks the name once a bank is picked, the NUBAN is
  10 digits, **and the step-1 BVN was OTP-verified** (`bvnDone`); otherwise falls
  back to manual entry. Resolved name saves to `settlement_account_name`.
- **Proxy route** — [`moneta-app/api/account-name-enquiry.ts`], mirrors the working
  `nibss-bvn.ts`: `generate-access-token`
  (`X-Auth-Token = base64(VITE_MONETA_CLIENT_ID : VITE_MONETA_CLIENT_SECRET : VITE_MONETA_NIBSS_TOKEN)`)
  → `X-Service-Token` → `POST /api/v2/debit-instruction/account/name-enquiry
  { bvn, account_number, institution_code }` via the Fixie whitelisted IP. Returns
  `{ name, verified }`.

### Credential findings (from `MPA Moneta App/moneta`)
- Moneta **partner** endpoints (banks / payout / VA) authenticate with the
  **ONBOARD** client pair (`MONETA_ONBOARD_CLIENT_ID/SECRET`), Basic → Bearer. The
  regular client pair is rejected ("Invalid client credentials").
- The partner `virtual-accounts/account/resolve` returns "Invalid bank" for us, so
  KYC name-enquiry uses the **NIBSS debit-instruction** service instead — the same
  service the BVN uses (`VITE_MONETA_NIBSS_TOKEN`, falls back to
  `VITE_MONETA_SERVICE_KEY`). It also confirms the account ↔ BVN.
- `institution_code` = 6-digit NIBSS code = `Number(bankId).padStart(6)`.

### Live test result
Deployed to `moneta-app` prod and verified:
`account 4235549385 + Zenith (000015) + real BVN → {"name":"EMMANUEL OCHEPO ENTONU","verified":true}`.
Wrong-bank guesses returned `verified:false` (correct).

---

## 4. Push notifications (Firebase / FCM)
See **[PUSH_NOTIFICATIONS_SETUP.md](PUSH_NOTIFICATIONS_SETUP.md)** for the full
credential inventory. Summary of what was done today:
- Created Firebase project **ETICO** (`etico-492e7`), added the Android app
  `ng.moneta.capital`, FCM V1 API enabled (Sender ID `927559305259`).
- Placed `google-services.json` at the repo root (gitignored).
- Uploaded the FCM V1 service-account key to **EAS** (assigned to
  `ng.moneta.capital`). `eas-cli` was updated to 24.7.0 to satisfy `eas.json`.
- **Remaining:** a fresh Android build + on-device token/send test; iOS APNs.

---

## 5. Deploy / commit reference
| Repo | Commit | What |
|---|---|---|
| mobile `ETICO-STOCK-TRADING-MOBILE-APP` | `b2a533d` | minimize/privacy + iOS AppDelegate cover |
| mobile | `5363c35` | reg/login/KYC/orders/notifications + iOS worklet fixes + #18 client |
| proxy `moneta-app` | `2ce4822` | `/api/account-name-enquiry` route (deployed to prod) |

`moneta-app` also has **unrelated uncommitted local changes** (`src/pages/KYC.tsx`,
`src/store/authStore.ts`, `package*.json`, a `supabase/*.sql`) — left untouched.

---

## 6. Still open (from the issue log)
- **Firebase:** run the Android build + device test; set up **iOS APNs**
  (`eas credentials -p ios`).
- **Social login:** enable Google / Apple / Facebook providers in the **Supabase
  dashboard** and add `niqra://login-callback` to Redirect URLs (code is ready).
- **Email:** sender (`noreply@moneta.ng`), existing-email/reactivation behaviour —
  Supabase Auth email/SMTP settings.
- **Accounts page #1/#2:** "KYC verified / brokerage linked" show right after KYC
  submit (even when BVN skipped / before CSCS approval). Decision needed: gate the
  "verified/linked" labels on CSCS-approved, or label the skipped-BVN case as
  "submitted".
- **PIN lockout (#19):** loosen to ~5 tries / shorter lock — lives in the
  `verify_pin` Supabase RPC (needs a DB migration).
- **Wallet history**, **notification/security preferences** — need storage + UI.
