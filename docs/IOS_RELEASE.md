# ETICO iOS — build & release handoff

How the iOS app gets from `main` to TestFlight and the App Store, what was set up to make
that work, and the traps that have already cost time. Companion to [`../HANDOFF.md`](../HANDOFF.md).

> **No secrets in this file** — it's a public repo. It says *where* secrets live, never their values.

---

## 1. Current state (2026-10-01)

| | |
|---|---|
| **App Store** | **1.0.0 is live** ("Ready for Distribution"), built from build **15**. Availability: **Nigeria only**. Free. |
| **Next update** | **1.0.1 = build 18** (latest `main`, incl. Events/Dangote IPO, NIN removal). Uploaded to App Store Connect 2026-10-01. **To do:** App Store Connect → `+` next to *iOS App* → version `1.0.1` → *What's New* → Build `18` → Add for Review → Submit. |
| **TestFlight** | Public link: <https://testflight.apple.com/join/7rJcpHb9> (beta group **"ETICO Testers"**). Every new build must pass Apple's *beta* review before external testers get it (usually a few hours). |
| **Pending** | Run the NIN-drop SQL (`supabase/remove-nin-2026-09-30.sql`) only **after** 1.0.1 has rolled out (older builds still write those columns). Build 18 has the Events lot picker (min 10, steps of 10) — it needs `supabase/events-ipo-lots-2026-09-30.sql` run (builds ≤17 step by 1; the server still enforces the rule). Open incidents (Moneta VA latency, PAC trading-account linking): see [`SESSION_2026-10-01_HANDOFF.md`](SESSION_2026-10-01_HANDOFF.md). iOS remote push (APNs key in EAS) not yet verified on a device. Sign in with Apple must keep working (required because Google/Facebook/LinkedIn sign-in exist). |

---

## 2. Identifiers (not secrets)

| What | Value |
|---|---|
| Bundle id | `ng.moneta.capital` |
| Apple team | **Moneta Technology Ltd** — `UJV5N29U6F` (paid org account) |
| App Store Connect app id | `6812737516` |
| Expo account / project | `emmanuel-entonu` / `moneta-native` — builds: <https://expo.dev/accounts/emmanuel-entonu/projects/moneta-native/builds> |
| ASC API key | Key ID + Issuer ID are in `eas.json` → `submit.production.ios` |
| Distribution cert / App Store profile | expire **2027-09-16** — renew before then (see §6) |

## 3. Where the secrets live (Mac only, all gitignored)

| Secret | Location |
|---|---|
| App Store Connect API key (`AuthKey_<KeyID>.p8`) | `~/Downloads/` and `~/private_keys/` on the release Mac. Path referenced by `eas.json`. |
| iOS signing (distribution `.p12` + App Store `.mobileprovision`) | `credentials/ios/` + `credentials.json` (repo root, **gitignored**). `.p12` password is in `credentials.json`. |
| Expo access token | Not stored in the repo. Create one at <https://expo.dev/settings/access-tokens> and `export EXPO_TOKEN=...` |

---

## 4. Why builds run on EAS (not Xcode on the Mac)

- Apple requires uploads built with the **iOS 26 SDK (Xcode 26)**. The release Mac runs **macOS 13 + Xcode 15.2**, which cannot install Xcode 26 and **cannot compile RN 0.86**.
- So every iOS build is compiled in the cloud on EAS with `"image": "latest"` (Xcode 26) — set in `eas.json` → `build.production.ios`.
- Local Xcode on that Mac is only useful for `xcrun altool` (validate/upload) and the simulator runtime.

## 5. Release recipe (what's been run for builds 11–18)

```bash
git pull origin main
npm install
# 1. Pre-flight: catches JS/import errors in ~1 min instead of a failed 20-min cloud build
CI=1 npx expo export --platform ios --output-dir /tmp/etico-export

# 2. Cloud build (build number auto-increments; EAS manages it: appVersionSource=remote)
npx eas-cli@latest build --platform ios --profile production --non-interactive --no-wait

# 3. Upload to App Store Connect (uses the ASC API key from eas.json)
npx eas-cli@latest submit --platform ios --profile production --id <EAS_BUILD_ID> --non-interactive
```

4. **TestFlight**: once Apple finishes processing (~5–15 min), add the build to the *ETICO Testers* group and submit it for **beta review** (App Store Connect → TestFlight, or the ASC API: `betaGroups/{id}/relationships/builds` + `betaAppReviewSubmissions`). Demo account, contact and "PIN 120506" notes are already saved in *Test Information*.
5. **App Store**: a live version's build can't be swapped — bump the version (§7) and create a new App Store version, select the build, submit.

---

## 6. Gotchas that already bit us

1. **Slow upload ≠ stuck.** EAS prints `Uploading to EAS Build (0 / 74 MB)` and never updates that line in logs. On the office connection the EAS upload takes **6–20 min**. A build only appears on the Expo dashboard *after* the upload finishes. **Don't kill it** — every restart starts from 0.
2. **`.easignore` excludes the whole `ios/` folder.** EAS therefore regenerates iOS in the cloud from `app.json` + `plugins/withEticoNative.js`. Hand-edits that exist only in `ios/` (e.g. `AppDelegate.swift`) **do not ship** unless the config plugin also applies them on iOS. Anything that must reach the build belongs in `app.json` / a config plugin. (`ios/` is still committed and kept in sync for local use.)
3. **Apple agreements block everything.** `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` from the API (or EAS submit failing) = the **Account Holder** must accept updated terms at <https://developer.apple.com/account> and/or <https://appstoreconnect.apple.com/business>. Takes a few minutes to propagate. Also check the yearly membership hasn't lapsed — a lapsed membership pulls apps from sale.
4. **`eas submit` sometimes fails with no reason** ("Something went wrong…", no logs). Bypass it — validate and upload the IPA straight to Apple (this is how build 18 shipped, and it was ~50× faster than the EAS upload):
   ```bash
   # IPA URL: npx eas-cli build:view <EAS_BUILD_ID> --json → artifacts.applicationArchiveUrl
   curl -L -o ETICO.ipa "<ipa url>"
   cp AuthKey_<KeyID>.p8 ~/private_keys/
   xcrun altool --validate-app -f ETICO.ipa -t ios --apiKey <KeyID> --apiIssuer <IssuerID>
   xcrun altool --upload-app   -f ETICO.ipa -t ios --apiKey <KeyID> --apiIssuer <IssuerID>
   ```
   `--validate-app` also returns Apple's real rejection reasons (that's how the "built with iOS 17 SDK" rejection was diagnosed).
5. **iOS-only Reanimated crashes.** Never call a plain JS function or read the `colors` theme Proxy inside a worklet (`useDerivedValue`, `useAnimatedStyle`, `useFrameCallback`). Hoist to the component body. This is what made the wealth-card beams fall back to a gradient on iOS.
6. **Never run `npx expo prebuild` unscoped** — it rewrites `android/`. Use `-p ios` / `-p android`.
7. **Expo Go can't run this app** (Skia, Reanimated 4, native modules). Live debugging needs the `development` profile (dev client) + Metro.

## 7. Version bumps

- Marketing version: `app.json` → `expo.version` (this is what EAS uses, because `ios/` is excluded). Keep `ios/ETICO/Info.plist` `CFBundleShortVersionString` and `MARKETING_VERSION` in `ios/ETICO.xcodeproj/project.pbxproj` in sync.
- Build number: managed remotely by EAS (`autoIncrement`), don't edit by hand.
- App Store versions must match the build's marketing version exactly (`1.0.1`, not `1.0`).

## 8. App Store listing decisions (already made)

- **Encryption:** `ITSAppUsesNonExemptEncryption = false` (only HTTPS + iOS keychain). No export-compliance docs needed.
- **Push:** `aps-environment = production` (`app.json` expo-notifications `mode: production`; the App Store profile includes push).
- **In-app purchase:** not used — wallet funding is a real-money bank transfer (exempt from IAP). App Store Server Notifications not needed.
- **EU Digital Services Act:** marked *non-trader*; harmless because the app isn't offered in the EU. If EU availability is ever wanted, declare **trader** (a financial-services company is one).
- **App Privacy:** contact info, financial info, user ID, photos (KYC selfie), and BVN/ID/DOB/next-of-kin under *Other Data* — all *App Functionality*, linked to user, no tracking.
- **Review risk to keep in mind:** Apple wants trading apps published by the licensed entity. Developer account = Moneta Technology Ltd; broker = Moneta Capital Investment Limited. Keep the SEC licence + an authorisation letter ready.
