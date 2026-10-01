# ETICO — Project Handoff

> For the next engineer/AI picking this up. High-level map of every part of the
> ETICO system, where each project lives, how they fit together, and the things
> you must know before changing anything. **No secrets in this file** (it's in a
> public repo) — it only says *where* secrets live.
>
> **Latest session (2026-09-29 → 10-01): read [`docs/SESSION_2026-10-01_HANDOFF.md`](docs/SESSION_2026-10-01_HANDOFF.md) first** —
> open incidents (Moneta `app.moneta.ng` ~21 s latency breaking all VA features, PAC trading-account
> linking blocked on a PAC role), SQL still to run, Events/IPO, NIN removal, and how to test the Moneta VA services.

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
| **Serverless proxy** | `C:\Users\ALEX\Desktop\Moneta-stock trading Demo` | The Vercel proxy (`api/` = `pac-proxy`, `mds-proxy`, `nibss-bvn`, `moneta-va`, `moneta`, `account-name-enquiry`, `reconcile-funding`, **`fund-wallet`**, `logo`, `getip`). Deployed to **moneta-app-ten.vercel.app**. Holds ALL broker/Moneta secrets + the whitelisted static egress IP (Fixie). The apps never hold these secrets. **You must redeploy this project after changing any `api/*.ts`.** |
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
- **KYC:** BVN + OTP via NIBSS (`src/lib/nibssApi.ts`), a **settlement bank account** (name / 10-digit number / bank), next of kin, and a verification selfie. **No NIN / ID number is collected any more (removed 2026-10-01)** — the Moneta VA create payload still carries `nin` = placeholder `0000000000`. Creates a PAC brokerage account (`createBrokerAccount`). Sets `kyc_status='verified'`, `cacs_status='pending'`. `app/(auth)/kyc.tsx`.
- **CSCS review + partner dashboard:** a PAC reviewer approves/rejects on the **web** partner dashboard (`Niqra-web/src/app/partner`). `cacs_status`: `not_submitted → pending → approved | rejected`. Trading is gated on `cacs_status === 'approved'`. Rejections show reasons + "Redo KYC" (`src/components/CscsNotice.tsx`).
- **Wallet & funding (CURRENT model — updated 2026-09).** ⚠️ The old "master float" write-up is **wrong** — see corrected model below and `supabase/va-wallet-separation.sql`. Two distinct balances:
  1. **Trading Wallet** = the user's **live PAC account cash balance** (buying power), read straight from PAC via `getAccountById()` and mirrored into `authStore.walletBalance`. It is **not** a stored ledger. Buys/sells re-read PAC.
  2. **Virtual Account** (`profiles.va_available`) = money deposited into the user's Moneta VA (Providus) that is **available to move into the wallet**. The server reconciler (`reconcile-funding`) credits `va_available` when it detects a new VA deposit (it no longer auto-funds PAC).
  - **Funding is manual:** the user picks an amount in the wallet screen → `POST /api/fund-wallet` → server **reserves** it from `va_available` (`va_debit`, atomic, can't overspend) → fires the **`cash_transactions` DEPOSIT** to the user's own PAC account (create → post; this is the endpoint tested against acct `019e2b0e-…`) → auto-reverses (`va_credit`) if PAC fails. Every movement writes the **`va_ledger`** (types: `deposit | funding | reversal | payout`).
  - **PAC account structure (verified live):** every user is an **investment account under one PAC client = "Moneta Technology Ltd"** (`clientId 019e2ad4-…`). The funding DEPOSIT sources from the **"SUB BROKER (MONETA) – SETTLEMENT BANK ACCOUNT"** (`11011120221`) into the user's individual account. There is **no** per-everyone super-user float. `xrenegade1815@gmail.com`'s PAC account is just one user account.
  - Client: `src/lib/monetaApi.ts` (`fundWalletFromVa`, `syncWalletFunding`, `getVaTransactions`, `getVirtualAccountBalance`), `src/store/authStore.ts` (`walletBalance`, `vaAvailable`, `vaReference`, `refreshWalletBalance`, `refreshVaAvailable`, `fundWalletFromVa`).
  - **Wallet UI (updated 2026-09-21):** `app/wallet.tsx` shows two *distinct* accounts — a **Trading Wallet card = live PAC balance** ("buying power") and a **Virtual Account card = the real Moneta VA balance** (via `getVirtualAccountBalance`, routed through the static-IP proxy) with a separate **"Available to move"** line = `va_available`. Activity is a two-tab section: **Deposits** (real Moneta VA history via `getVaTransactions`) + **Wallet moves** (`va_ledger`). The wallet re-syncs on focus (`useFocusEffect`).
  - **Funding is its own pop-up page** — `app/fund-wallet.tsx`, registered in `app/_layout.tsx` as `presentation:'modal'`. Flow: pick amount → **awaits the MyWealthCare (PAC) response end-to-end** → shows a "Sent" success state → **auto-returns to the wallet** (~1.2s) with a toast *"your wallet balance will update shortly"* (covers the PAC-balance lag). On failure it **masks the raw PAC/proxy error** behind a generic "try again" message (real error → console only). The old inline fund `<Modal>` was removed.
  - **VA + VA history route through the static IP:** all Moneta VA calls (`create`/`balance`/`transactions`) go through `moneta-va.ts` → the Fly static-IP proxy (`moneta-proxy.fly.dev/nibss-app/api/v1` → `app.moneta.ng`). The `transactions` action resolves the caller's VA reference from their **JWT server-side** (never client-supplied), so a user can only read their own history.
  - **Payouts/withdrawals = NEXT step** (not built): pay `wallet`/settlement out to the user's settlement bank account; `va_ledger` already has a `payout` type and `va_debit` accepts `payout` for it.
- **Events / IPOs (2026-09-29+):** Events card on Assets → events list → event page (`app/events/*`, web `/app/events`). Subscribe moves money VA→VA to the event's collection VA (`moneta-va` `ipo-subscribe`, DB-enforced eligibility + lots via `event_subscribe` RPC). Dangote IPO: ₦525/share, min 10, multiples of 10, no cap. Partner view: web `/partner/events/[id]`. Details: `docs/SESSION_2026-10-01_HANDOFF.md` §1.
- **PAC trading account (CSCS/CHN) linking:** PAC leaves investment accounts without a trading account, so orders fail "No trading account number found". `reconcile-funding` `linkTradingAccount` attaches CSCS no. + CHN, but PAC currently returns **403** (our PAC user lacks `investment_account_update`). See session handoff §0.3.
- **Trading:** `app/trade/[symbol].tsx` — buy/sell via PAC (`src/lib/pacApi.ts`), per-trade SEC legal disclosure, PIN confirm. Buying power = the live PAC wallet balance; after a fill it calls `refreshWalletBalance()`.
- **Market / Assets / Watchlist / Portfolio:** ethical universe in `src/lib/ethicalTickers.ts`; watchlist is DB-backed (`user_watchlists`, shared with web); Assets page uses image cards (`app/(app)/invest.tsx`).
- **Legal (in-app):** Privacy/Terms render natively (`src/lib/legalContent.ts`, `app/privacy.tsx`, `app/terms.tsx`, `app/legal.tsx`); mirrored at etico.ng and in `docs/`. Risk Disclosure links out.
- **Account deletion:** in-app `app/delete-account.tsx` → `request_account_deletion()` RPC (Play requirement) + `etico.ng/delete-account`.
- **Notifications:** local (trade/market-open) work now; remote push is prepped (Expo push token, `supabase/notifications-setup.sql` has the server sender) but needs FCM linked (`google-services.json` + FCM key in EAS). See earlier `PLAY_STORE_RELEASE.md`.

---

## 4. Security model (don't regress these)

- **Money columns are RPC-only.** `profiles` has `UPDATE` **revoked** from clients on `wallet_balance`, `va_available`, and all `va_*` (theft guard). All money moves go through SECURITY DEFINER RPCs — VA side: `va_reconcile_deposit`, `va_debit`, `va_credit` (service-role only, called by the proxy); `set_virtual_account`; legacy/deprecated: `decrement_wallet`, `increment_wallet`, `reconcile_deposit` (kept, no longer used by the app now that the wallet mirrors PAC). ⚠️ Any client `upsert`/`update` whose payload includes those columns fails — that's why new-profile creation uses insert-only (`ignoreDuplicates`) in `authStore.ts`.
- **`va_ledger`** (new) is append-only: RLS `select` own rows, all client writes revoked, unique `reference` (idempotency), written only by the VA RPCs / service role.
- **RLS** on `profiles`, `orders`, `wallet_transactions`, `va_ledger`, `user_pins`, `payment_intents`, `notifications`. PIN table has no client policies (RPC-only).
- **App privacy:** `FLAG_SECURE` (Android `MainActivity`) blocks screenshots/recents; a native onPause overlay + JS `<PrivacyOverlay/>` cover content when the app isn't active. PIN re-prompt on resume after a 60s grace (`src/store/pinStore.ts`).
- SQL lives in `supabase/*.sql` (mobile) and `Niqra-web/supabase/*.sql`. After schema changes run `notify pgrst, 'reload schema';`.
- **Known items to close before real scale:** `increment_wallet` (sell credit) is client-callable (move server-side, verified vs PAC fill); re-encrypt BVN at rest; process `deletion_requested_at` rows (hard-delete job).

---

## 5. Build & release (current state — updated 2026-09)

> **iOS build, TestFlight & App Store release:** see [`docs/IOS_RELEASE.md`](docs/IOS_RELEASE.md) — current release state, where signing/API secrets live, the release recipe, and known traps.

- **Expo SDK 57 / RN 0.86 / React 19**, **New Architecture ON** (required by reanimated 4). `android/` **has been regenerated for SDK 57** via `expo prebuild` and committed. `ios/` is committed (prebuilt on the Mac).
- **All native customizations are now Expo config plugins** so `prebuild` never loses them — `plugins/withEticoNative.js` (local plugin) re-applies: **FLAG_SECURE + the native privacy overlay** (MainActivity), **dark-mode transparent system bars** (`light_system_bars` bools + `windowBg` colors + AppTheme items), **release signing** from `android/keystore.properties`, **permission strips** (`tools:node="remove"` for SYSTEM_ALERT_WINDOW + external storage), **lint-off** on release (react-native-screens lint OOMs), and a **Gradle heap bump**. Registered in `app.json` `plugins` alongside `expo-build-properties`.
- **`app.json`** holds the build config that used to be hand-edited native: `android.versionCode`, `android.allowBackup:false`, and `expo-build-properties` → `compileSdkVersion 36`, `targetSdkVersion 36`, **`minSdkVersion 24`** (RN 0.86 native libs require 24 — 23 fails the C++ build).
- **Wealth-card beams = the real React Bits three.js component** (`@react-three/fiber/native` + `expo-gl`), not the old Skia 2D fallback. Verified rendering on Android. ⚠️ **iOS not yet verified** — `expo-gl` was historically flaky on iOS; test it on the Mac (`expo run:ios`) before trusting it, and if it's black, add a `Platform.OS` fallback (Skia version is in git history).
- **Google Play:** app **"ETICO: Ethical Stocks"**, package `ng.moneta.capital`. Release keystore `android/app/etico-release.keystore` + `android/keystore.properties` are **gitignored** (values in `Desktop\etico passwords` / recorded with the owner). EAS also has its own remote keystore (used for the internal/dev-client test builds — a **different** signature, so a sideloaded EAS build must be uninstalled before installing a Play build and vice-versa). Bundle id `ng.moneta.capital` (iOS+Android). EAS projectId in `app.json` `extra.eas.projectId` = `08384831-fdc8-4bd3-a4e9-67eeb5495735`. `eas.json` `appVersionSource: remote`.

### 5A. How to build (EAS + Expo) — the working recipe

⚠️ **Local Android builds do NOT work on the Windows machine.** RN 0.86 New-Arch C++ codegen (gesture-handler etc.) produces object-file paths > Windows' 260-char `MAX_PATH`, and the NDK's `ninja` isn't long-path-aware (registry `LongPathsEnabled=1` is set but doesn't reach it; junction/`subst` tricks fail too). **Build via EAS cloud, or on the Mac.** See memory `project-windows-build-blocker`.

- **EAS profiles** (`eas.json`): `production` (AAB, local credentials), `preview` (internal-distribution **APK**, EAS-managed keystore — this is the "release build to the phone"), `development` (dev-client APK), `simulator` (iOS).
- **Build an installable test APK:** `npx eas-cli build -p android --profile preview --non-interactive --no-wait` → poll `eas-cli build:view <id> --json` (note: `build:view` does **not** accept `--non-interactive`) → download `applicationArchiveUrl` → `adb install -r <apk>`.
- **Live-edit on device (Metro):** build a **dev client** once (`--profile development`), install it, then `adb reverse tcp:8081 tcp:8081` + `npx expo start --dev-client`, and launch it on the phone with `adb shell am start -a android.intent.action.VIEW -d "niqra://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"` (scheme is `niqra`). JS/shader edits then hot-reload in ~1s — this is how the beams were tuned. Needs `expo-dev-client` (installed) + a re-`prebuild` after adding it.
- **`.easignore`** trims the upload (excludes `android.bak/`, build outputs, `ios/`) — without it the tarball was 537 MB and uploads failed. Uploads still flake on a poor connection; just re-run the build command (it resumes the queue).
- **After `expo prebuild -p android --clean`** you must restore the gitignored, machine-local files it wipes: `android/keystore.properties`, `android/app/etico-release.keystore`, `android/local.properties` (`sdk.dir=…/Android/Sdk`). Keep a copy in `android.bak/` (gitignored). JDK used: `C:\Program Files\Android\Android Studio\jbr`.
- **On the Mac:** `git pull` → `npm install` (add `--legacy-peer-deps` if three/fiber peers on React 19 complain) → `npx expo run:ios` (builds + installs iOS dev client + starts Metro) or `npx expo run:android`. No MAX_PATH problem there.

### 5B. Environment variables (names only — values live in Vercel / EAS / gitignored files)

**Vercel proxy** (`Moneta-stock trading Demo`, set in Vercel project env; redeploy to apply):
`CRON_SECRET`, `EMAIL_SEND_SECRET` (web↔proxy internal secret), `MONETA_EMAIL_CLIENT_ID/SECRET/SERVICE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `SELF_BASE`, `FIXIE_URL` / `HTTPS_PROXY` (static egress IP), `VITE_BROKER_BASE_URL`, `VITE_PAC_TENANT_ID`, `VITE_PAC_USERNAME`, `VITE_PAC_PASSWORD`, `MDS_API_KEY`, `MDS_TENANT_ID`, `MONETA_PROXY_URL`, `MONETA_CLIENT_ID`, `MONETA_CLIENT_SECRET`, `MONETA_ONBOARD_CLIENT_ID`, `MONETA_ONBOARD_CLIENT_SECRET`, `VITE_MONETA_CLIENT_ID`, `VITE_MONETA_CLIENT_SECRET`, `VITE_MONETA_SERVICE_KEY`, `VITE_MONETA_NIBSS_TOKEN`, `LOGODEV_TOKEN`. (`CRON_SECRET` was rotated 2026-09-19.)

**Mobile app** (public config; set in EAS build env / `eas.json` env, `.env` for local, compiled fallbacks in `src/lib/config.ts`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_PROXY_BASE`, `EXPO_PUBLIC_SITE_BASE`, `EXPO_PUBLIC_EAS_PROJECT_ID`. **No secrets** — anon key is RLS-safe, proxy URL is public.

**Android signing** (gitignored `android/keystore.properties`): `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.

### 5C. Key dependencies wired in

`expo ^57` · `react-native 0.86.3` · `react 19.2` · `expo-router ~57` · **`expo-build-properties ~57`** (SDK levels) · **`expo-dev-client ~57`** (Metro dev client) · **`expo-gl ~57` + `three ^0.166` + `@react-three/fiber ^9.7` + `@react-three/drei ^10.7`** (real Beams) · `@shopify/react-native-skia 2.6.2` (other visuals; old Beams fallback in git history) · `react-native-reanimated 4.5.1` + `react-native-worklets 0.10.1` (New-Arch only) · `moti ^0.30` · `expo-notifications ~57` · `@supabase/supabase-js ^2.101` · `expo-secure-store ~57` · `zustand ^5` · `react-native-safe-area-context ~5.7`. Note `patch-package` patches were removed in the SDK-57 merge.

---

## 6. Recent fixes (this + prior sessions)

**Session 2026-09-29 → 10-01:** Events/Dangote IPO end-to-end (first real ₦525 subscription settled), lots min 10 × 10, NIN removed everywhere, PAC trading-account linking (blocked on PAC role), Fixie quota incident (upgraded), Moneta `app.moneta.ng` latency incident (open). Full write-up + test method: [`docs/SESSION_2026-10-01_HANDOFF.md`](docs/SESSION_2026-10-01_HANDOFF.md).

**Session 2026-09-21 — funding went live + verified end-to-end:**
- **The VA/wallet-separation server side was never deployed** — `api/fund-wallet.ts` was untracked (404 in prod) and `api/reconcile-funding.ts`'s new-model version was uncommitted (prod still ran the old `wallet_balance` reconciler). Committed + pushed to `moneta-app` `main` so git auto-deploy serves them: **`/api/fund-wallet`** (VA→PAC funding), **new `reconcile-funding`** (credits `va_available` via `va_reconcile_deposit`), and a new **`moneta-va` `transactions`** action (Moneta `transaction-histories`). `fund-wallet` also now emits a valid RFC-4122 **v4** idempotency UUID (the sha256-slice wasn't valid v4).
- **`pac-proxy` ENOTFOUND saga → fixed:** two stacked bugs. (1) A wrong change routed PAC through `undici`/Fixie, but **`undici` isn't a dep** → the function crashed (`FUNCTION_INVOCATION_FAILED`). PAC is **NOT** IP-whitelisted — plain fetch reaches it. (2) After reverting to Node's **global `fetch`**, PAC calls flaked with **intermittent per-instance/region `ENOTFOUND`** on Vercel. Fix: switch `pac-proxy` to **`node-fetch`** (the client every reliable endpoint uses); 12/12 burst all 200 after. **Rule: this proxy project uses `node-fetch`, never global `fetch`/`undici`.** `mds-proxy` still on global fetch — switch it if it flakes. See memory `project-pac-proxy-direct`.
- **Verified live against acct `019e2b0e-…` (xrenegade1815):** direct ₦1000 cash-transaction (create `201` → post `200`, journals `01a0c27b…`/`01a0c280…`, sourced from SUB BROKER (MONETA) settlement `11011120221`); **`/api/fund-wallet` end-to-end** (seed `va_available` → fund → `va_debit` → PAC deposit → `va_ledger` `funding` row, `{ok:true,pacTxnId}`); **VA balance** + **VA transaction history** (returned the real ₦199 deposit) through the static-IP proxy, on both the cron-secret and the app's **user-JWT** path. Note: the PAC `cashBalance` field **lags** (updates a bit after POST) — expected, don't treat it as failure.
- **UI restructure** — see §3: distinct PAC (trading) vs VA (virtual account) balances, funding moved to its own pop-up page with success→auto-return + masked errors, VA transaction history surfaced. (App-bundle changes — need an EAS rebuild to reach devices.)
- **`CRON_SECRET` rotated 2026-09-21.**
- **Known open item:** an iOS-only report that the trade **Confirm buy** button does nothing after accepting terms (unconfirmed / not yet investigated).

**Session 2026-09-19/20:**
- **Wallet model corrected + rebuilt** — wallet now mirrors the **live PAC balance**; VA is separate (`va_available`); manual "fund wallet from VA" via `/api/fund-wallet`; new `va_ledger`. SQL: `supabase/va-wallet-separation.sql` (run it) + `supabase/reset-ledger-xrenegade.sql` (resets the test user's ledger — run in Supabase; a credential guardrail blocks running it programmatically). Verified the `cash_transactions` create→post endpoint works live (₦100 test).
- **SDK-57 prebuild migration DONE** — `android/` regenerated; all native customizations moved into `plugins/withEticoNative.js` + `expo-build-properties` (see §5). minSdk bumped 23→24.
- **Real three.js Beams restored** on the wealth card (was Skia); speed 2.6.
- **Build pipeline** — established the EAS-cloud build path (local Windows builds blocked by MAX_PATH, see §5A) and the dev-client + Metro live-edit loop.

**Prior sessions:**
- **Minimize behavior:** app no longer refreshes / loses the current screen when minimized (removed the background→PIN `router.replace`); `<PrivacyOverlay/>` blanks the app when not active; Trade back button no longer exits the app (`router.back()` + `BackHandler` + real-route fallback).
- **New-account onboarding:** profile row now creates via insert-only (was blocked by the `wallet_balance` UPDATE revoke → PIN loop).
- **Redo KYC:** AuthGate lets a verified user re-enter KYC; resubmit overwrites details, clears `cacs_rejection_reason`, returns to `pending`.
- **BVN address:** no longer maps state-of-origin into the residential address (`nibssApi.ts`); user types their own. A settlement-only redo no longer nulls verified identity fields.
- Dark-mode nav bar, trade edge-to-edge insets, wallet leather card, Assets image cards, in-app legal, account deletion, Play-compliance (permissions, FLAG_SECURE), API-36 target + release signing.

---

## 7. Gotchas / conventions

- **Commits: do NOT add a Co-Authored-By / AI attribution trailer** (owner's standing instruction).
- **Pull before pushing** — several people push to `main`.
- **Make every change on both mobile and web**, and test against the deployed backend (not locally) — owner's standing instructions.
- Keep secrets out of the app bundle and out of git (keystore, `keystore.properties`, `google-services.json`, service-role key, FCM key all gitignored).
- Cross-app doc for the web team: `Niqra-web/KYC_FIXES_FROM_MOBILE.md` (KYC fixes to mirror). ⚠️ `Niqra-web/MONETA_WALLET_SYSTEM.md` describes the **old "master float" model and is OUTDATED** — the current model is §3 above + `supabase/va-wallet-separation.sql`; update that doc before the web team follows it.
- Legal placeholders still to fill before launch: `{{RC-NUMBER}}`, `{{REGISTERED-ADDRESS}}`, `{{SEC-LICENCE}}` (in `docs/`, `src/lib/legalContent.ts`, and etico.ng pages).
- Reviewer test login for Play/App Store must stay KYC-verified + CSCS-approved (e.g. `xrenegade1815@gmail.com`).
