# ETICO — Project Handoff

> For the next engineer/AI picking this up. High-level map of every part of the
> ETICO system, where each project lives, how they fit together, and the things
> you must know before changing anything. **No secrets in this file** (it's in a
> public repo) — it only says *where* secrets live.

ETICO is a mobile + web brokerage for **ethically screened stocks on the Nigerian
Exchange (NGX)**, by **Moneta Capital Investment Limited** (a subsidiary of Moneta
Technology). Users verify identity (BVN + KYC), get a PAC brokerage account, fund
a wallet, and buy/sell from a curated ethical universe.

---

## 1. Where everything lives (all on this Desktop)

| Project | Folder | What it is |
|---|---|---|
| **Mobile app** (this repo) | `C:\Users\ALEX\Desktop\Moneta Stock  Trading App` | Expo/React Native app. GitHub: `Emmanuel-Entonu/ETICO-STOCK-TRADING-MOBILE-APP` (branch `main`). |
| **Web app** | `C:\Users\ALEX\Desktop\Niqra-web` | Next.js app serving **www.etico.ng**: marketing/legal pages, the user web trading app, and the **PAC partner dashboard** (`/partner`). |
| **Waitlist site** | `C:\Users\ALEX\Desktop\ETICO-Waitlist` | Separate Next.js + Prisma project (has `email-templates/`). Marketing waitlist; reuses the shared Supabase. |
| **Serverless proxy** | `C:\Users\ALEX\Desktop\Moneta-stock trading Demo` | The Vercel proxy (`api/` = `pac-proxy`, `mds-proxy`, `nibss-bvn`, `moneta-va`, `moneta`, `reconcile-funding`, `logo`, `getip`). Deployed to **moneta-app-ten.vercel.app**. Holds ALL broker/Moneta secrets + the whitelisted static egress IP. The apps never hold these secrets. |
| **Secrets** | `C:\Users\ALEX\Desktop\etico passwords` | Local credentials folder (keystore passwords, keys, etc.). Do not commit. |
| Other | `MPA Moneta App`, `MonetaCardProcessor`, `MONETA PNG's` | Related/older assets & experiments; not part of the shipping app path. |

**Shared backend:** one Supabase project, ref **`cmrxwuqfagqskrjdmjte`** (`https://cmrxwuqfagqskrjdmjte.supabase.co`), used by mobile, web, and waitlist.

---

## 2. Architecture (how it fits together)

```
 Mobile app (Expo)                Web app (Niqra-web, etico.ng)
        │                                   │
        ├──HTTPS──▶ Vercel proxy (moneta-app-ten.vercel.app) ──▶ PAC (MyWealthCare) : trading, cash, KYC review
        │             (secrets + static IP)                   ──▶ MDS               : market data
        │                                                      ──▶ NIBSS             : BVN verification
        │                                                      ──▶ Moneta / Providus : virtual-account wallets
        │
        └──────────────▶ Supabase (auth, profiles, wallet ledger, watchlist, RLS + RPCs)
```

- The client only holds public config: Supabase URL + anon key (RLS-protected), the proxy base URL, and the site base. **Never** PAC/Moneta/service-role secrets — those live on the Vercel proxy and in EAS/Vercel env.
- Config: mobile `src/lib/config.ts` (`proxyBase`, `siteBase`, `supabaseUrl`, `easProjectId`).

---

## 3. Core features / how they work

- **Auth + PIN:** email/password (Supabase). A 6-digit transaction **PIN** (server-side bcrypt via `set_pin`/`verify_pin` RPCs; `profiles.has_pin`). Onboarding order: create PIN → enter PIN → KYC → app (gate logic in `app/_layout.tsx` `AuthGate`).
- **KYC:** BVN + OTP via NIBSS (`src/lib/nibssApi.ts`), ID type/number, and a **settlement bank account** (name / 10-digit number / bank). Creates a PAC brokerage account (`createBrokerAccount`). Sets `kyc_status='verified'`, `cacs_status='pending'`. `app/(auth)/kyc.tsx`.
- **CSCS review + partner dashboard:** a PAC reviewer approves/rejects on the **web** partner dashboard (`Niqra-web/src/app/partner`). `cacs_status`: `not_submitted → pending → approved | rejected`. Trading is gated on `cacs_status === 'approved'`. Rejections show reasons + "Redo KYC" (`src/components/CscsNotice.tsx`).
- **Wallet & funding (the float model):** each user gets a Moneta **virtual account** (Providus). Deposits are detected by the server **reconciler** (`reconcile-funding`), which credits the app **wallet ledger** (`profiles.wallet_balance`) AND funds the user's PAC account from the company **master float**. Users trade against the wallet ledger (buy debits, sell credits, ₦0 blocks buying); PAC is settled EOD. See `MONETA_WALLET_SYSTEM.md` (in `Niqra-web/`) for the full write-up. Client: `src/lib/monetaApi.ts`, `src/store/authStore.ts`.
- **Trading:** `app/trade/[symbol].tsx` — buy/sell via PAC (`src/lib/pacApi.ts`), per-trade SEC legal disclosure, PIN confirm. Buying power = wallet ledger.
- **Market / Assets / Watchlist / Portfolio:** ethical universe in `src/lib/ethicalTickers.ts`; watchlist is DB-backed (`user_watchlists`, shared with web); Assets page uses image cards (`app/(app)/invest.tsx`).
- **Legal (in-app):** Privacy/Terms render natively (`src/lib/legalContent.ts`, `app/privacy.tsx`, `app/terms.tsx`, `app/legal.tsx`); mirrored at etico.ng and in `docs/`. Risk Disclosure links out.
- **Account deletion:** in-app `app/delete-account.tsx` → `request_account_deletion()` RPC (Play requirement) + `etico.ng/delete-account`.
- **Notifications:** local (trade/market-open) work now; remote push is prepped (Expo push token, `supabase/notifications-setup.sql` has the server sender) but needs FCM linked (`google-services.json` + FCM key in EAS). See earlier `PLAY_STORE_RELEASE.md`.

---

## 4. Security model (don't regress these)

- **Money columns are RPC-only.** `profiles` has `UPDATE` **revoked** from clients on `wallet_balance` + all `va_*` (float-theft guard). All money moves go through SECURITY DEFINER RPCs: `decrement_wallet`, `increment_wallet`, `reconcile_deposit`, `set_virtual_account`. ⚠️ Any client `upsert`/`update` whose payload includes those columns fails — that's why new-profile creation uses insert-only (`ignoreDuplicates`) in `authStore.ts`.
- **RLS** on `profiles`, `orders`, `wallet_transactions`, `user_pins`, `payment_intents`, `notifications`. PIN table has no client policies (RPC-only).
- **App privacy:** `FLAG_SECURE` (Android `MainActivity`) blocks screenshots/recents; a native onPause overlay + JS `<PrivacyOverlay/>` cover content when the app isn't active. PIN re-prompt on resume after a 60s grace (`src/store/pinStore.ts`).
- SQL lives in `supabase/*.sql` (mobile) and `Niqra-web/supabase/*.sql`. After schema changes run `notify pgrst, 'reload schema';`.
- **Known items to close before real scale:** `increment_wallet` (sell credit) is client-callable (move server-side, verified vs PAC fill); re-encrypt BVN at rest; process `deletion_requested_at` rows (hard-delete job).

---

## 5. Build & release (current state)

- **Now on Expo SDK 57 / RN 0.86 / React 19** (merged from PR #2, `main` @ the SDK-57 merge). New Architecture on by default. Skia-based wealth-card beams. **EAS** build/submit configured (`eas.json`) — iOS submit wired to App Store Connect (ASC app `6812737516`, team `UJV5N29U6F`; key path is on the Mac). EAS `appVersionSource: remote` (EAS manages build numbers).
- **iOS project is committed** (`ios/`, generated by `expo prebuild` on the Mac). **`android/` is still the RN-0.74 shape** and must be regenerated with `expo prebuild -p android --clean` before an SDK-57 Android build.
- ⚠️ **Prebuild regenerates native folders → manual native changes are lost** unless expressed as Expo **config plugins** in `app.json`. Still-TODO to re-express: **FLAG_SECURE** (e.g. `expo-screen-capture`), **dark-mode edge-to-edge system bars** (was fixed via `values-night` styles), permission trims, and release signing (EAS credentials).
- The two `patch-package` patches (expo-modules-core, react-native-screens) were **removed** during the SDK-57 merge — they were SDK-51-version-specific and obsolete.
- **Google Play:** app **"ETICO: Ethical Stocks"**, package `ng.moneta.capital`. An **SDK-51 AAB (version code 3, target API 36)** was submitted and is/was **in review** — that submission is independent of the SDK-57 work. Release keystore + `keystore.properties` are gitignored; copy them from the secrets folder to build a release AAB (or use EAS credentials).
- Bundle id: `ng.moneta.capital` (iOS + Android). EAS projectId is in `app.json` (`extra.eas.projectId`).

---

## 6. Recent fixes (this + prior sessions)

- **Minimize behavior (just done):** app no longer refreshes / loses the current screen when minimized (removed the background→PIN `router.replace`); `<PrivacyOverlay/>` blanks the app when not active; Trade back button no longer exits the app (`router.back()` + `BackHandler` + real-route fallback).
- **New-account onboarding:** profile row now creates via insert-only (was blocked by the `wallet_balance` UPDATE revoke → PIN loop).
- **Redo KYC:** AuthGate lets a verified user re-enter KYC; resubmit overwrites details, clears `cacs_rejection_reason`, returns to `pending`.
- **BVN address:** no longer maps state-of-origin into the residential address (`nibssApi.ts`); user types their own. A settlement-only redo no longer nulls verified identity fields.
- Dark-mode nav bar, trade edge-to-edge insets, wallet leather card, Assets image cards, in-app legal, account deletion, Play-compliance (permissions, FLAG_SECURE), API-36 target + release signing.

---

## 7. Gotchas / conventions

- **Commits: do NOT add a Co-Authored-By / AI attribution trailer** (owner's standing instruction).
- Keep secrets out of the app bundle and out of git (keystore, `keystore.properties`, `google-services.json`, service-role key, FCM key all gitignored).
- Cross-app doc for the web team: `Niqra-web/KYC_FIXES_FROM_MOBILE.md` (KYC fixes to mirror) and `Niqra-web/MONETA_WALLET_SYSTEM.md` (wallet/float model).
- Legal placeholders still to fill before launch: `{{RC-NUMBER}}`, `{{REGISTERED-ADDRESS}}`, `{{SEC-LICENCE}}` (in `docs/`, `src/lib/legalContent.ts`, and etico.ng pages).
- Reviewer test login for Play/App Store must stay KYC-verified + CSCS-approved (e.g. `xrenegade1815@gmail.com`).
