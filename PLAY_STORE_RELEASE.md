# ETICO — Google Play: Compliance & Release Guide

> **For:** the ETICO developer submitting the Android app to Google Play (you
> have a Play Console developer account). Covers what's already been fixed in
> code, the one build decision you must make (target API level), and the exact
> steps to create the app, upload it, and request review.

---

## 1. What was already fixed in code (this pass)

| Area | Change | File |
|---|---|---|
| **Sensitive permissions** | Removed `SYSTEM_ALERT_WINDOW`, `READ_/WRITE_EXTERNAL_STORAGE` (a brokerage app needs none; Play flags them). Stripped with `tools:node="remove"` so no dependency can re-merge them. | `android/app/src/main/AndroidManifest.xml` |
| **Account deletion** (required for account-based apps) | Added an in-app **Delete account** screen → calls `request_account_deletion()` → signs out. | `app/delete-account.tsx`, `app/(app)/account.tsx` |
| **Privacy policy reachable in-app** (required) | Added a **Legal & policies** screen linking Privacy Policy / Terms / Risk Disclosure. | `app/legal.tsx` |
| **Version** | Bumped to `1.0.0` (versionCode `1`). | `android/app/build.gradle`, `app.json` |
| **Backups** | `allowBackup=false` already set — good for a financial app. | manifest (unchanged) |

The only retained runtime permissions are now `INTERNET`, `VIBRATE`,
`POST_NOTIFICATIONS` — all justifiable and low-friction.

**Before building, run the SQL** `supabase/kyc-settlement-and-va.sql` on the
shared Supabase project (adds `request_account_deletion`, settlement columns,
the `bvn` re-add, and `set_virtual_account`). Without it, delete-account and KYC
calls will error.

---

## 2. ⚠️ The one decision you must make: target API level

Google Play requires **new apps and updates to target API 35 (Android 15)**
(enforced since Aug 31 2025). The project is currently **`targetSdk`/`compileSdk`
34** (Expo SDK 51's default). If you upload targeting 34, Play will **reject**
it.

Two ways to fix, pick one:

- **Recommended — upgrade Expo SDK to 52+** (which targets API 35 cleanly):
  ```bash
  npx expo install expo@^52   # then follow the interactive upgrade
  npx expo install --fix
  npx expo prebuild -p android --clean   # ⚠️ see note
  ```
  > ⚠️ You have a **committed `android/`** with manual edits (the manifest
  > permission strips, `allowBackup=false`). `--clean` regenerates it — re-apply
  > those manifest changes afterward, or don't use `--clean` and bump the SDK
  > manually (below).

- **Quick — bump the SDK in Gradle without upgrading Expo** (test thoroughly;
  RN 0.74 / Expo 51 on API 35 mostly works but isn't the blessed combo):
  ```
  # android/build.gradle → ext block
  compileSdkVersion = 35
  targetSdkVersion  = 35
  ```
  Then rebuild and smoke-test: launch, KYC, wallet, a trade, notifications,
  edge-to-edge layout (API 35 forces edge-to-edge — check the status/nav bar
  insets on your screens).

Do this **before** building the release AAB.

---

## 3. Build a signed release bundle (AAB)

Play requires an **`.aab`** (App Bundle), not an APK. You also need an **upload
key** (keystore). Two paths:

### Option A — EAS Build (easiest, cloud, no local signing setup)
```bash
npm i -g eas-cli
eas login
eas build:configure          # creates eas.json if missing
eas build -p android --profile production
```
EAS generates & stores the keystore for you and outputs a signed `.aab` to
download. Set your `EXPO_PUBLIC_*` env vars in the EAS project (Supabase URL /
anon key / proxy base / site base) so the release doesn't fall back to defaults.

### Option B — Local Gradle
```bash
# 1. Create an upload keystore (once) — keep it + the passwords SAFE forever.
keytool -genkeypair -v -keystore etico-upload.keystore \
  -alias etico -keyalg RSA -keysize 2048 -validity 10000

# 2. Put credentials in android/gradle.properties (do NOT commit real secrets):
#    ETICO_UPLOAD_STORE_FILE=etico-upload.keystore
#    ETICO_UPLOAD_KEY_ALIAS=etico
#    ETICO_UPLOAD_STORE_PASSWORD=****
#    ETICO_UPLOAD_KEY_PASSWORD=****
#    and wire a signingConfig in android/app/build.gradle (release).

# 3. Build the bundle:
cd android && ./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

> **Play App Signing:** on first upload, opt in (default). Google holds the app
> signing key; your keystore above is just the *upload* key. Losing the upload
> key is recoverable via support; still back it up.

---

## 4. Create the app in Play Console

1. **play.google.com/console → Create app.**
   - App name: **ETICO**, Language, **App** (not game), **Free**.
   - Accept the developer program & US export declarations.
2. Complete the **Dashboard → "Set up your app"** tasks (below).

### 4.1 App access
If reviewers need a login to see past KYC, provide **test credentials** (a demo
account that's already KYC-verified + CSCS-approved, e.g. your
`xrenegade1815@gmail.com` test user) under **App access → All/some functionality
is restricted**. Reviewers *will* get stuck at the KYC/BVN gate otherwise →
rejection. Add clear step notes.

### 4.2 Data safety (required — be accurate, it's cross-checked)
Declare what ETICO collects and why. At minimum:
- **Personal info:** name, email, phone, address, DOB, **government IDs / BVN**
  (→ "Financial info" + "Personal identifiers").
- **Financial info:** payment/wallet info, purchase history (trades).
- Data is **encrypted in transit**; users **can request deletion** (point to the
  in-app Delete account + `etico.ng/delete-account`).
- Say whether data is shared with third parties (PAC/MyWealthCare, Moneta, NIBSS
  for BVN) — declare these as processors.
- Link the **Privacy Policy URL** (must be live): `https://www.etico.ng/privacy`.

### 4.3 Financial features declaration (required for trading apps)
Under **Policy → App content → Financial features**, declare the app offers
**investments / trading / brokerage**. For Nigeria you'll likely be asked to
**prove regulatory authorization** — have the **SEC licence / PAC partnership
evidence** ready to upload. This is the most common cause of finance-app review
delays; prepare it up front.

### 4.4 Content rating
Fill the questionnaire (finance app, no violence/gambling — do **not** describe
stock trading as gambling). You'll get an IARC rating.

### 4.5 Store listing
- Short + full description (avoid "guaranteed returns" or any misleading
  financial claims — Play's Financial Services policy bans them).
- **App icon** 512×512, **feature graphic** 1024×500.
- **Screenshots**: min 2 phone (use real screens — welcome, market, trade,
  wallet). No device frames with misleading claims.
- Category: **Finance**. Contact email + Privacy Policy URL.

### 4.6 Target audience
Set to **18+** (financial product; never target children).

---

## 5. Upload & test before production

1. **Testing → Internal testing → Create release.**
2. Upload the **`.aab`**. Add release notes.
3. Add testers (your email + team) to the internal track, share the opt-in link,
   install from Play, and **smoke-test the signed build end-to-end** (KYC →
   wallet fund → trade → delete account). This catches release-only issues
   (env vars, proxy reachability, signing) before reviewers see them.
4. When happy, **promote to Production** (or run Closed testing first — Google
   now often requires a period of closed testing with real testers for **new
   personal developer accounts** before production access; check your Console for
   that requirement).

---

## 6. Request the production review

1. **Production → Create release** → add the same (or promoted) `.aab`.
2. Fill **release notes**.
3. Ensure every Dashboard task shows green (Data safety, Content rating,
   Financial features, Privacy Policy, App access, Target audience, Store
   listing). Play won't let you submit until they're complete.
4. Click **Save → Review release → Start rollout to Production** (you can set a
   staged rollout %, e.g. 20%).
5. This **submits for review**. Status → **"In review"**. First reviews for a new
   finance app typically take a **few days to ~2 weeks** (financial verification
   is slower). Watch the Console + your email for questions or rejections.

### If rejected
Read the policy citation, fix, bump `versionCode` (must increase every upload),
rebuild the AAB, upload a new release, and resubmit. Common finance-app
rejections: missing SEC/authorization proof, Data safety mismatch, no working
test login, or targetSdk < 35.

---

## 7. Pre-submit checklist

- [ ] Ran `supabase/kyc-settlement-and-va.sql` on the shared project.
- [ ] `targetSdk`/`compileSdk` = **35** (§2) and the app was re-tested.
- [ ] `EXPO_PUBLIC_*` env vars set for the release build (not fallbacks).
- [ ] Privacy Policy, Terms, Risk Disclosure live at `etico.ng/{privacy,terms,risk-disclosure}` and `etico.ng/delete-account` resolves.
- [ ] Signed `.aab` built; upload keystore backed up.
- [ ] Data safety form completed accurately.
- [ ] Financial features declared + SEC/PAC authorization evidence ready.
- [ ] Reviewer test account provided under App access (KYC-verified + CSCS-approved).
- [ ] Content rating done; target audience 18+.
- [ ] Store listing (icon, feature graphic, screenshots, descriptions) complete.
- [ ] Internal-testing smoke test passed on the signed build.
