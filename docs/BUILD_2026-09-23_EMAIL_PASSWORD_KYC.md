# Build handoff — Email system, password reset, KYC step 5, PAC auto-send

> **Written for: the mobile team (and future devs).** Records what shipped on
> the web + shared proxy on 23 Sep 2026 so mobile can plug into the same
> infrastructure instead of building its own. Shared Supabase project
> `cmrxwuqfagqskrjdmjte`; shared Vercel proxy `moneta-app-ten.vercel.app`.
>
> **Secrets are referenced by env-var NAME only — never hard-code values here.**

---

## 0. What you must set up (ops)

**Vercel env vars**
- `moneta-app` (proxy): `EMAIL_SEND_SECRET`, `MONETA_EMAIL_CLIENT_ID`,
  `MONETA_EMAIL_CLIENT_SECRET`, `MONETA_EMAIL_SERVICE_KEY` (the **funded**
  notification merchant), `FIXIE_URL`, `CRON_SECRET`. *(All already set.)*
- `NIQRA-WEB` (web): add `EMAIL_SEND_SECRET` (same value as the proxy's) —
  required for password-reset OTP, welcome email, and the KYC-PDF-to-PAC send.
- `ETICO-Waitlist`: add `EMAIL_SEND_SECRET` (same value).

**Supabase SQL (run in the SQL editor, both are idempotent)**
- `Niqra-web/supabase/kyc-next-of-kin.sql` — next-of-kin + mother's-maiden columns.
- `Niqra-web/supabase/password-reset-otps.sql` — OTP table.

**Supabase Auth setting**
- Auth → Providers → Email → turn **OFF "Confirm email"** so signup signs the
  user in immediately (our own welcome email replaces the Supabase confirmation).

---

## 1. Centralized branded email system

All apps (web, web-app, mobile, waitlist) send email through ONE endpoint. The
branding lives only in the proxy, so nothing ships Moneta's default template.

### Endpoint
`POST https://moneta-app-ten.vercel.app/api/send-email`

**Auth (either):**
- `x-cron-secret: <EMAIL_SEND_SECRET>` — server-to-server (no user needed).
- `Authorization: Bearer <supabase user JWT>` — when a user is signed in.

**Branded template body (preferred):**
```json
{ "to": "user@example.com", "type": "welcome", "data": { "name": "George Deshi" } }
```

**Template types + their `data`:**
| type           | data                                  | used for                    |
|----------------|---------------------------------------|-----------------------------|
| `welcome`      | `{ name }`                            | after signup                |
| `password-otp` | `{ name, otp, expiresMinutes }`       | password reset code         |
| `waitlist`     | `{ name }`                            | waitlist confirmation       |

**Raw fallback (no branding wrapper):** `{ to, subject, html }` or
`{ to, subject, content }`.

**Success response:** `{ "message": "Successfully queued 1 notifications", "data": {...} }`

### How the branding works
- Built in `moneta-app/api/send-email.ts` → `renderTemplate(type, data)` +
  `wrapEmail(inner)`. Edit there to change copy/branding.
- Uses Moneta's `template: "raw"` with our `html_content` (that's what removes
  the Moneta logo / "The Moneta Team" default footer).
- Logo is loaded from `https://www.etico.ng/brand/etico-logo-light.png`.
- Egresses through **Fixie** (whitelisted IP `54.195.3.54`) with an automatic
  IP-retry (Fixie load-balances IPs; only the one is whitelisted). Bills the
  `MONETA_EMAIL_*` merchant — **it must have balance** or you get
  `"low balance … not billable"`.

### Attachments (e.g. KYC PDF)
`POST /api/send-email-attachment` (same auth):
```json
{ "to": "x@y.com", "subject": "...", "html": "<p>...</p>",
  "filename": "doc.pdf", "contentBase64": "<base64>", "contentType": "application/pdf" }
```
Multipart to Moneta. NOTE: do **not** send a `sensitive` field — Moneta rejects
it in multipart.

### How mobile should use it
- **No new dev.** Call `POST /api/send-email` with `{ to, type, data }` and the
  same `x-cron-secret` (from a mobile *backend*, never bake the secret into the
  app) OR the signed-in user's JWT.
- On mobile signup, fire `type: "welcome"`, `data: { name }`.

---

## 2. Password reset — OTP flow (replaces the email-link redirect)

The old flow just bounced to the website. The new flow is self-contained: a
6-digit code by email, entered in-app with the new password.

### Data model
`public.password_reset_otps` (`supabase/password-reset-otps.sql`): `email`,
`code_hash` (sha256 of `email:code`), `expires_at`, `consumed`, `attempts`,
`created_at`. **Service-role only** (RLS on, no policies).

### Rules
- Code = 6 digits, **10-minute** expiry.
- **Throttle:** max 3 codes per email / 15 min.
- **Attempts:** 5 wrong tries per code, then it's dead.
- **No email enumeration:** requesting a code always "succeeds" whether or not
  the account exists.
- Only the **latest un-consumed** code is checked — tell users to use the newest.

### Web implementation (reference)
- Server actions: `Niqra-web/src/lib/actions/password-reset.ts`
  - `requestPasswordOtp(email)` → generates + stores hashed code, emails it
    (`password-otp` template). Always returns `{ ok: true }`.
  - `resetPasswordWithOtp({ email, code, password })` → verifies, then sets the
    password via `admin.auth.admin.updateUserById(...)`, marks the code consumed.
- UI: `Niqra-web/src/app/(auth)/reset/page.tsx` (2 steps: email → code+password).
- Password rule = the same `validatePassword` used at signup.

### How mobile should use it
The web logic is in **server actions**, which RN can't call directly. Two options:
1. **Easiest now:** open the website `/reset` in a browser/WebView.
2. **Native (recommended, small follow-up):** expose two JSON API routes on web —
   `POST /api/password/request-otp { email }` and
   `POST /api/password/reset { email, code, password }` — thin wrappers over the
   existing server actions. Mobile then does the OTP UI natively.
   *(These routes are NOT built yet — ping web to add them.)*

---

## 3. KYC — step 5 (next of kin + mother's maiden name)

### New columns (`supabase/kyc-next-of-kin.sql`)
```
profiles.next_of_kin_name   text
profiles.next_of_kin_phone  text
profiles.mother_maiden_name text
```
PAC requires these on the account-opening form. **Address** is already collected
(`profiles.address`) and now also prints on the PDF.

### Web collection + validation
- KYC is now **5 steps**: (1) BVN + personal, (2) ID + settlement, **(3) next of
  kin + mother's maiden**, (4) review, (5) photo + submit.
- Validation: name ≥ 2 chars; phone matches `^\+?\d[\d\s-]{7,}$`; maiden ≥ 2.

### How they're saved
- Written by the **server action** `submitKycAction`
  (`Niqra-web/src/lib/actions/kyc.ts`), which upserts `profiles` using the
  **service-role** client. Fields: `next_of_kin_name`, `next_of_kin_phone`,
  `mother_maiden_name` (plus the existing identity/settlement fields).
- Why service role: some `profiles` columns (`cacs_*`) have `UPDATE` revoked from
  the `authenticated` role, so a user's own JWT gets **"permission denied for
  table profiles"** if the upsert touches them. The server action is trusted and
  writes only the caller's own row (`id = user.id`).

### Where they show
- PAC partner dashboard → new **"Next of kin & family"** section.
- The exported/auto-emailed **KYC PDF** → Address, Next of kin, Next of kin
  phone, Mother's maiden name.

### How mobile should mirror it
- Add the same 3 inputs to the mobile KYC.
- These columns are **NOT** revoked, so mobile can write them with the user's own
  session (unlike `cacs_*`). Keep writing `cacs_status` / `cacs_rejection_reason`
  the way you already do (if that ever starts failing with "permission denied",
  move that write to a trusted server/proxy path, same as web did).

---

## 4. Welcome email + straight-in signup

- `signUpAction` (web) sends the branded `welcome` email and returns
  `{ ok, session }`. With "Confirm email" **off**, `signUp` returns a session →
  the register page goes straight to `/app`. With it on, it shows "check email".
- Mobile: after your signup call, send `type: "welcome"` via the email endpoint.

---

## 5. Waitlist email

`ETICO-Waitlist/src/app/api/waitlist/route.ts` sends the branded `waitlist`
email (best-effort) after a successful insert. Needs `EMAIL_SEND_SECRET`
(and optional `PROXY_BASE`) in the waitlist project's env.

---

## 6. KYC PDF → PAC (auto-send) — now server-side & reliable

On KYC completion the branded PDF (identity, ID, settlement account, next of kin,
mother's maiden name, and the verification photo) is emailed to
**`Info@pacsecurities.com`** as an attachment.

> **This moved off the browser (23 Sep 2026 update).** It used to be built in the
> browser and POSTed to `/api/kyc-pdf-to-pac` as a *best-effort* `fetch` right as
> the page navigated to `/app`. That call was silently dropped whenever the tab
> closed or the connection blipped — so some completed KYCs never reached PAC.
> It now runs **on the server**, so it fires reliably every time.

### How it works now (web)
- `finalizeKycAction` (`Niqra-web/src/lib/actions/kyc.ts`) fires the send inside
  **`after()`** (from `next/server`) — runs after the response is sent, so it
  never blocks completion, but Vercel keeps the function alive to finish it.
- `Niqra-web/src/lib/kyc-pac-email.ts` → `sendKycPdfToPac(userId)`: reads the
  profile row with the **service role**, pulls the verification photo back out of
  the **`kyc-selfies`** storage bucket, builds the PDF, and POSTs it to the proxy
  `/api/send-email-attachment` with `EMAIL_SEND_SECRET`. No browser involvement,
  so nothing depends on what the tab does after submit.
- `Niqra-web/src/lib/partner-pdf-server.ts` → `submissionPdfBase64Server(sub, selfieBuffer)`:
  the Node twin of the client `partner-pdf.ts` (same layout / branding). jsPDF
  runs headless; image dimensions are parsed straight from the PNG/JPEG header.
- The old browser POST in `app/kyc/page.tsx` was **removed**. The authenticated
  `POST /api/kyc-pdf-to-pac` route is kept only for manual/one-off re-sends.

### Two gotchas we hit (mind these if you build a server PDF path)
1. **Vercel doesn't ship `public/` into the serverless function filesystem.** A
   `readFile("public/brand/...")` fails at runtime there and the logos vanish.
   Fix: fetch the brand assets **over HTTP** from the deployed site
   (`${siteUrl}/brand/...`), with a disk read only as a dev fallback.
2. **jsPDF's node build stores PNGs uncompressed** → the PDF ballooned to ~7.6 MB,
   which base64-encodes to ~10 MB and **blows past Vercel's ~4.5 MB request-body
   limit** (the send would 413 before reaching the mailer). Fix: pass the `"FAST"`
   (FlateDecode) compression arg to every `addImage(...)` → PDF drops to ~525 KB.
   Applied to both the server and client PDF builders.

### How mobile should mirror it
- Simplest: after your KYC completion call, hit a small **server/proxy** endpoint
  that runs the same `sendKycPdfToPac`-style flow (read profile + selfie, build
  PDF, POST to `/api/send-email-attachment`). Keep the send server-side so it
  doesn't depend on the app staying foregrounded.
- If you generate the PDF on-device (e.g. `expo-print`), POST its base64 to
  `/api/send-email-attachment` from a backend (never bake `EMAIL_SEND_SECRET`
  into the app), and **keep the attachment well under ~4.5 MB** (compress images).
- Or ask web to expose a tiny authenticated `POST /api/kyc/resend-pac` that takes
  a user id and reuses `sendKycPdfToPac` — then mobile just calls that.

---

## 7. Verified live in this build
- Branded `welcome` email → queued ✅
- Plain send + Fixie IP routing + funded merchant → queued ✅
- Attachment (`/api/send-email-attachment`) with a PDF → queued ✅
- **Server-side KYC PDF → PAC**: real submission (photo + all fields) built
  headless via `submissionPdfBase64Server`, ~525 KB after compression, queued to
  PAC (200) ✅
- Web typecheck green.

## 8. Known follow-ups
- Native mobile OTP reset needs the two JSON API routes (§2) — not built yet.
- Mobile KYC needs the 3 new fields added to its form.
- Keep the `MONETA_EMAIL_*` merchant funded or all sends return "low balance".
