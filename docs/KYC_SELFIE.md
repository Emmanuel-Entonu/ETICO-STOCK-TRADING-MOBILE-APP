# KYC verification selfie — spec (mobile + web parity)

Added 2026-09-21. A 4th KYC step captures a selfie, stores it privately in
Supabase Storage, and surfaces it on the PAC partner dashboard alongside the
user's other KYC data. Use this doc to mirror the feature on the web app
(`Niqra-web`).

## Data model

- **Storage bucket:** `kyc-selfies` (private). Object path per user:
  **`<user_id>/selfie.jpg`** (a redo of KYC `upsert`s the same path).
- **Column:** `profiles.selfie_path text` — the stored object path.
- **RLS (storage.objects):** a user may read/write only their own folder
  (`(storage.foldername(name))[1] = auth.uid()`). The partner dashboard reads
  with the service role (bypasses RLS). SQL: [`supabase/kyc-selfie.sql`](../supabase/kyc-selfie.sql) — run it in the Supabase SQL editor.

## Mobile implementation (this repo)

- **Deps:** `expo-camera` (in-app camera), `expo-file-system` + `base64-arraybuffer` (read the JPEG and upload binary from RN).
- **Permission:** `app.json` → `expo-camera` plugin (`cameraPermission`). Also
  declared directly in the committed native projects so an EAS build (which does
  NOT re-run prebuild when `android/`+`ios/` exist) has it:
  - `android/app/src/main/AndroidManifest.xml`: `android.permission.CAMERA` + `uses-feature camera (required=false)`.
  - `ios/ETICO/Info.plist`: `NSCameraUsageDescription`.
  - A future `expo prebuild` regenerates both from the `expo-camera` plugin.
- **Upload helper:** [`src/lib/kycUpload.ts`](../src/lib/kycUpload.ts) —
  `uploadKycSelfie(uri, userId)`: reads the captured JPEG as base64
  (`expo-file-system/legacy`), `decode()`s to an ArrayBuffer, and
  `supabase.storage.from('kyc-selfies').upload('<uid>/selfie.jpg', bytes, { contentType: 'image/jpeg', upsert: true })`. Returns the path.
- **UI:** [`app/(auth)/kyc.tsx`](../app/(auth)/kyc.tsx) — `Step` is now `1|2|3|4`.
  Step 4 renders a front-facing `<CameraView>`; a shutter button calls
  `takePictureAsync({ quality: 0.55 })` → preview + "Retake". "Submit KYC" is
  disabled until a photo exists. On submit, `uploadKycSelfie` runs first, then
  `selfie_path` is written in the `profiles` upsert (submission is blocked if the
  upload fails — no broker account without the photo).

## Web implementation (Niqra-web — to build)

1. Run the same `supabase/kyc-selfie.sql` (shared Supabase project — already
   applied once it's run from either app).
2. Capture: use `getUserMedia({ video: { facingMode: 'user' } })` → `<video>` →
   draw a frame to a `<canvas>` → `canvas.toBlob('image/jpeg')`.
3. Upload the Blob directly: `supabase.storage.from('kyc-selfies').upload(`${user.id}/selfie.jpg`, blob, { contentType: 'image/jpeg', upsert: true })`, then write `selfie_path` to `profiles`.
4. Add the step to the web KYC flow before final submission, mirroring the
   "can't submit without a photo" gate.

## Partner dashboard (Niqra-web `/partner`)

Render the selfie next to the user's KYC details. With the service role:

```ts
const { data } = await supabaseAdmin
  .storage.from('kyc-selfies')
  .createSignedUrl(profile.selfie_path, 3600)   // 1-hour signed URL
// <img src={data.signedUrl} />
```

Show a placeholder when `profile.selfie_path` is null (older users pre-feature).
