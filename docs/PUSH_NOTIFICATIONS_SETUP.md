# ETICO — Push Notifications (Firebase / FCM + Expo)

**Audience:** ETICO mobile engineering.
**Status (2026-09-18):** Android remote push is **fully configured**. Only a fresh
build + on-device verification remain. iOS (APNs) is not set up yet.

---

## How push works in this app

- The app uses **`expo-notifications`** and mints an **Expo push token**
  (`getExpoPushTokenAsync`, see [`src/lib/pushNotifications.ts`](../src/lib/pushNotifications.ts)).
  That token is saved to Supabase `profiles.push_token` for the backend to use.
- Delivery goes through **Expo's Push service** (`https://exp.host/--/api/v2/push/send`),
  which forwards to **FCM** (Android) and **APNs** (iOS). The app holds **no** FCM/APNs
  secret — credentials live once in EAS, and Expo signs the pushes.
- **Local** notifications (trade confirmations) already work with no setup.
  **Remote** push (fills / settlement / account events while the app is closed)
  needs the FCM (Android) / APNs (iOS) credentials below.

---

## Firebase project (Android) — DONE

| Item | Value |
|---|---|
| Firebase project name | **ETICO** |
| Project ID | **`etico-492e7`** |
| Plan | Spark (free — FCM works on Spark) |
| Android package | **`ng.moneta.capital`** |
| FCM Sender ID | **`927559305259`** |
| FCM V1 API | **Enabled** |
| Owner Google account | `xrenegade1813@gmail.com` |

### Files & where they live
- **`google-services.json`** → committed location: **repo root** (`./google-services.json`),
  referenced by `app.json` → `android.googleServicesFile`. It is **gitignored**
  (see `.gitignore`) — hand it to each builder or store it as an EAS file secret.
  Package inside it: `ng.moneta.capital`, project `etico-492e7`.
- **FCM V1 service-account key** (the "Generate new private key" JSON from
  Firebase → Project settings → Service accounts). This is a **SECRET** — it is
  **NOT** in the repo. It was downloaded to
  `C:\Users\ALEX\Downloads\etico-492e7-firebase-adminsdk-fbsvc-00c2b5f8b6.json`
  and **uploaded to EAS** (below). Store the original somewhere safe (password
  manager / secret store); if lost, regenerate a new one in Firebase.

### FCM V1 service-account identifiers (not secrets — for reference)
- Service account email: `firebase-adminsdk-fbsvc@etico-492e7.iam.gserviceaccount.com`
- Client ID: `108932155210489273049`
- Private Key ID: `00c2b5f8b6a98c7b5ffa6da41e3de5d16b9f89dc`
- (The private key **material** is only in the JSON file + on EAS — never written here.)

### EAS — DONE
Uploaded via `eas credentials -p android` → **Google Service Account → Manage
your Google Service Account Key for Push Notifications (FCM V1)**. EAS now reports
the key assigned to `ng.moneta.capital` for FCM V1. EAS account: **`emmanuel-entonu`**
(Owner); EAS `projectId` `08384831-fdc8-4bd3-a4e9-67eeb5495735` (in `app.json`).

---

## What's left for Android
A fresh native build (the config only applies at build time — current store/dev
builds predate `google-services.json`):
```bash
eas build -p android --profile production     # or: npx expo run:android
```
Verify on a **real device** (tokens don't mint on emulators):
1. Sign in → confirm `profiles.push_token` gets an `ExponentPushToken[...]` row.
2. Test send:
   ```bash
   curl -X POST https://exp.host/--/api/v2/push/send \
     -H "Content-Type: application/json" \
     -d '{"to":"ExponentPushToken[xxxx]","title":"ETICO","body":"Test","channelId":"trades"}'
   ```
   (`channelId:"trades"` matches the Android channel the app creates.)

---

## iOS (APNs) — NOT done yet
iOS pushes go through **APNs**, given directly to Expo — **Firebase is not used
for iOS** in this Expo setup (Expo's push service already fronts APNs). Options:
```bash
eas credentials -p ios      # → Push Notifications → let EAS create the APNs key
```
or provide an **APNs Auth Key**: `.p8` + Key ID + Apple Team ID (`UJV5N29U6F`,
per `eas.json`). Requires a paid Apple Developer account and a real iPhone.

---

## Sending real pushes from the backend
Server-side (the `moneta-app` proxy), on an event (order filled while closed,
T+3 settlement):
1. Read the user's `profiles.push_token`.
2. `POST https://exp.host/--/api/v2/push/send` with
   `{ to, title, body, data: { route: "/receipt/<id>" }, channelId: "trades" }`.
   The app routes on tap via `data.route`.
3. Batch tokens (Expo accepts arrays) and read the receipts endpoint to prune
   invalid tokens.
No FCM/APNs key is needed to *send* — only the ExpoPushToken. The FCM/APNs
credentials configured in EAS are what let Expo deliver.
