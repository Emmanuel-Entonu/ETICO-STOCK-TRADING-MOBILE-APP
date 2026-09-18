# ETICO — Push Notifications (Firebase / FCM + Expo) Setup

**Audience:** whoever owns the Firebase + Expo/EAS accounts for ETICO.
**Goal:** turn on **remote** push (order fills, settlement, account events while the
app is closed). **Local** notifications (trade confirmations shown immediately)
already work with no setup.

---

## How the app already works (no code changes needed)

- The app uses **`expo-notifications`** and mints an **Expo push token** via
  `getExpoPushTokenAsync` (see [`src/lib/pushNotifications.ts`](../src/lib/pushNotifications.ts)).
  That token is saved to `profiles.push_token` in Supabase for the backend to use.
- Sending is done through **Expo's Push service** (`https://exp.host/--/api/v2/push/send`),
  which forwards to **FCM** (Android) and **APNs** (iOS). You do **not** hardcode
  any FCM key in the app — you configure the credentials **once** in EAS/Expo, and
  Expo signs the pushes.
- `app.json` already points Android at `./google-services.json`
  (`android.googleServicesFile`) and has the EAS `projectId`
  (`08384831-fdc8-4bd3-a4e9-67eeb5495735`). Bundle/package id: **`ng.moneta.capital`**.

**Current blocker:** `google-services.json` is **missing from the repo** (it's
gitignored). Without it the Android build can't register with FCM, so
`getExpoPushTokenAsync` fails and remote push silently no-ops. Everything below
fixes that.

---

## Part A — Firebase (Android)

1. **Create/þopen the Firebase project** at <https://console.firebase.google.com>
   (one project for ETICO is fine — reuse if it exists).
2. **Add an Android app**: package name **exactly** `ng.moneta.capital`.
   (App nickname/SHA-1 are optional for FCM; SHA-1 is only needed for Google
   sign-in / App Check.)
3. **Download `google-services.json`** and place it at the **repo root**:
   `Moneta Stock  Trading App/google-services.json`. (It stays gitignored — hand
   it to each builder, or add it to EAS as a secret file; see Part C.)
4. **Enable the API**: in Google Cloud console for the same project, enable
   **Firebase Cloud Messaging API (V1)**
   (APIs & Services → Library → "Firebase Cloud Messaging API").
   The legacy "Cloud Messaging API (Legacy)" / server key is **not** needed —
   Expo uses FCM **V1**.
5. **Create an FCM V1 service-account key** so Expo can send to FCM:
   Firebase console → **Project settings → Service accounts → Generate new
   private key** → downloads a JSON. Keep it secret (do **not** commit it).

## Part B — Apple (iOS) push

Expo/EAS can manage this for you. Either:
- Let EAS create the APNs key automatically during `eas credentials`, **or**
- Provide an **APNs Auth Key**: a `.p8` file + its **Key ID** + your **Apple Team
  ID** (`eas.json` already shows team `UJV5N29U6F`).

No Firebase is required for iOS — APNs is direct.

## Part C — Wire the credentials into EAS (once)

From the project root, with `eas-cli` installed and logged in as the Expo owner
(`emmanuel-entonu`):

```bash
eas credentials
# Android → (select build profile) → "FCM V1 service account key" → upload the
#           JSON from Part A step 5.
# iOS     → Push Notifications → let EAS create the APNs key, or upload your .p8.
```

Optionally store `google-services.json` as an EAS **file secret** so cloud builds
find it without it living in git:

```bash
eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json
```
(Then set `"googleServicesFile": "$GOOGLE_SERVICES_JSON"` — or just keep the file
locally for `expo run:android`.)

## Part D — Build & verify

```bash
# Local dev build (needs google-services.json at repo root):
npx expo run:android
# or a cloud build:
eas build -p android --profile preview
```

On a **real device** (push tokens don't mint on Android emulators without Play
services / on iOS simulators):
1. Sign in → the app calls `registerPushTokenAsync`; confirm a row appears in
   `profiles.push_token` (starts with `ExponentPushToken[...]`).
2. Send a test from your machine:
   ```bash
   curl -X POST https://exp.host/--/api/v2/push/send \
     -H "Content-Type: application/json" \
     -d '{"to":"ExponentPushToken[xxxx]","title":"ETICO","body":"Test push","channelId":"trades"}'
   ```
   It should arrive in the tray. (`channelId:"trades"` matches the Android channel
   the app creates.)

## Part E — Sending real pushes from the backend

Remote events (order filled while the app is closed, T+3 settlement) are sent by
the **server**, not the app. In the `moneta-app` proxy (Vercel):
1. Read the user's `profiles.push_token`.
2. POST to `https://exp.host/--/api/v2/push/send` with
   `{ to, title, body, data: { route: "/receipt/<id>" }, channelId: "trades" }`.
   The app already routes on tap via the `data.route` field.
3. For volume, batch tokens (Expo accepts arrays) and read the receipts endpoint
   to prune invalid tokens.

---

## What I need from you to finish this

| # | Item | Why |
|---|---|---|
| 1 | `google-services.json` (Firebase Android config for `ng.moneta.capital`) | placed at repo root; unblocks Android token minting |
| 2 | Confirm the **FCM V1 service-account key** is uploaded to EAS (Part C) | lets Expo deliver to FCM |
| 3 | iOS: let EAS manage APNs, **or** the `.p8` + Key ID + Team ID | iOS delivery |
| 4 | Confirm the Expo account/owner (`emmanuel-entonu`) + that I can run `eas credentials` | wiring |

Give me #1 (the `google-services.json`) and I'll drop it in and do a build to
confirm token registration end-to-end. Items 2–4 are account actions on your side.
