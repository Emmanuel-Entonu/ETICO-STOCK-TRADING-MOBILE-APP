# ETICO — Mobile App

ETICO is a mobile brokerage app for **Shariah-screened ("ethical") stocks on the Nigerian Exchange (NGX)**, operated by Moneta Capital Investment Limited. Users verify their identity (BVN + KYC), get a brokerage account, fund a wallet, and buy/sell from a screened universe of ethical NGX tickers.

- **Bundle identifier:** `ng.moneta.capital` (iOS & Android)
- **App name / slug:** ETICO / `moneta-native`
- **Phone only** (no tablet), portrait.

---

## Tech stack

| Area | Choice |
|---|---|
| Framework | **Expo SDK 51**, React Native 0.74.5, **New Architecture enabled** |
| Workflow | **Bare / prebuilt** — the `android/` native project is committed; `ios/` is generated with `expo prebuild` |
| Navigation | `expo-router` (file-based, typed routes) |
| State | `zustand` stores (`src/store/*`) |
| Backend | **Supabase** (auth, profiles, wallet ledger, watchlist, RLS + RPCs) |
| Market/broker data | **Vercel serverless proxies** (see *Backend* below) — the app never holds broker secrets |
| Charts | `react-native-gifted-charts`, `react-native-svg`; Home wealth-card uses `three` / `@react-three/fiber` |
| Icons | `react-native-iconify` (icons must be pre-registered in `babel.config.js`) |
| Secure storage | `expo-secure-store` (session), `expo-notifications` (local + push) |

### Architecture (how data flows)

```
 ETICO app  ──HTTPS──▶  Vercel proxies (moneta-app-ten.vercel.app)  ──▶  PAC / MDS / Moneta
     │                    • pac-proxy      (trading, cash transactions)
     │                    • mds-proxy      (market data)
     │                    • nibss-bvn      (BVN verification)
     │                    • moneta-va      (wallet virtual accounts)
     │                    • reconcile-funding (deposit → PAC funding, cron)
     └──────────────▶  Supabase (auth, profiles, wallet_balance ledger, watchlist)
```

- The **proxy** lives in a **separate repository** (`moneta-app`, deployed to `moneta-app-ten.vercel.app`). It holds all broker/Moneta secrets and a static (whitelisted) egress IP. **No server secrets exist in this app repo** — only the public Supabase URL + anon key and the public proxy base URL.
- SQL for Supabase (RLS policies, wallet RPCs, funding reconciler) lives in [`supabase/`](supabase/). Run those files in the Supabase SQL editor.

---

## Prerequisites (macOS, for iOS)

- **macOS** with **Xcode** (latest) + Command Line Tools
- **Node.js 18+** and npm
- **Watchman** — `brew install watchman`
- **CocoaPods** — `sudo gem install cocoapods` (or `brew install cocoapods`)
- An **Apple Developer account** (needed to run on a physical device / TestFlight; the simulator works without one)

---

## Setup

```bash
git clone https://github.com/Emmanuel-Entonu/ETICO-STOCK-TRADING-MOBILE-APP.git
cd ETICO-STOCK-TRADING-MOBILE-APP
npm install
```

### Environment variables

Create a `.env` in the project root (it is gitignored). These are the only vars the app reads, and all are **client-safe** (the Supabase anon key is protected by RLS; the proxy base is public):

```
EXPO_PUBLIC_SUPABASE_URL=https://cmrxwuqfagqskrjdmjte.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
EXPO_PUBLIC_PROXY_BASE=https://moneta-app-ten.vercel.app
```

If `.env` is missing, `src/lib/config.ts` falls back to compiled defaults (fine for dev; set real values before shipping a release).

---

## Build & run — iOS

The `ios/` folder is **not committed**; generate it once, then build.

```bash
# 1. Generate the native iOS project (does NOT touch android/)
npx expo prebuild -p ios

# 2. Install CocoaPods
cd ios && pod install && cd ..

# 3a. Run on the iOS Simulator
npx expo run:ios

# 3b. Or run on a connected iPhone / build a release
open ios/ETICO.xcworkspace     # then set your Team under Signing & Capabilities, pick a device, Run
```

**Signing for a physical device / TestFlight:** open `ios/ETICO.xcworkspace` in Xcode → select the `ETICO` target → **Signing & Capabilities** → choose your Apple Developer **Team** (bundle id `ng.moneta.capital`). Then **Product → Archive** for a release build / App Store upload.

> ⚠️ **Never run `npx expo prebuild` without `-p ios`.** The committed `android/` folder contains manual native changes; an unscoped prebuild would regenerate and clobber it. Always scope to `-p ios`.

### Cloud alternative (no Mac needed): EAS Build

```bash
npm i -g eas-cli
eas login
eas build -p ios --profile production
```

---

## Build & run — Android (reference)

The Android native project is committed, so no prebuild is needed.

```bash
# Debug (Metro):
npx expo run:android

# Release APK:
cd android
./gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Requires `JAVA_HOME` set to Android Studio's JBR and `ANDROID_HOME` set to the SDK.

---

## Dependencies

Runtime dependencies (see `package.json` for exact versions):

```
expo, expo-router, expo-font, expo-secure-store, expo-notifications,
expo-linear-gradient, expo-blur, expo-haptics, expo-clipboard, expo-constants,
expo-linking, expo-status-bar, expo-web-browser, expo-gl,
react, react-native, react-native-reanimated, react-native-screens,
react-native-safe-area-context, react-native-svg, react-native-gifted-charts,
react-native-iconify, react-native-url-polyfill,
@react-native-async-storage/async-storage, @supabase/supabase-js,
@expo/vector-icons, zustand, moti, three, @react-three/fiber, @react-three/drei
```

`npm install` installs everything; the iOS-specific native modules link automatically via Expo autolinking during `pod install`.

---

## Project layout

```
app/                 expo-router screens (welcome, auth, (app) tabs, trade, wallet, watchlist, …)
src/
  components/        UI + brand marks, charts, StockLogo, FloatingTabBar
  lib/               pacApi (broker), monetaApi (wallet), nibssApi (BVN), config, format, ethicalTickers
  store/             zustand: authStore, portfolioStore, watchlistStore, pinStore, notificationStore
  theme/             palettes (light + dark), themed styles
  ui/                design-system primitives (Text, Button, Card, …)
assets/logos/        curated stock logos
android/             committed native Android project
supabase/            SQL: RLS, wallet RPCs, funding reconciler, notifications
```

---

## Notes

- **Theme** follows the phone's system setting (light = cream, dark = green-tinted near-black + gold).
- **Ethical universe** is defined in `src/lib/ethicalTickers.ts`; only these tickers are tradeable/shown.
- **Wallet model:** users fund a Moneta virtual account; a server-side reconciler funds their PAC account; the app tracks a spendable wallet ledger (buys debit, sells credit). Backend/treasury (float pre-funding, EOD settlement) is operational, outside this app.
- New iconify icons must be added to `babel.config.js` or they render blank.
