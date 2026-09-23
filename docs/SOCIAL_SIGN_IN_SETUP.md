# Social sign-in setup (Apple / Google / Facebook / LinkedIn)

Mobile sign-in/sign-up buttons live in `src/components/SocialAuthRow.tsx` and use
Supabase OAuth (`signInWithOAuth` → in-app browser → back to the app).
Each provider must be enabled in **Supabase → Authentication → Sign In / Providers**.

> **No secrets in this file or in git.** Only identifiers (which are not secret)
> are recorded here. Secrets (Apple `.p8` key, generated Apple secret, Google /
> Facebook / LinkedIn client secrets) are stored in the company password manager
> and pasted into Supabase only. The "Stored at" column says where.

## Shared values

| Item | Value |
|---|---|
| Supabase project ref | `cmrxwuqfagqskrjdmjte` |
| OAuth callback URL (register this with every provider) | `https://cmrxwuqfagqskrjdmjte.supabase.co/auth/v1/callback` |
| App redirect (Supabase → Authentication → URL Configuration → Redirect URLs) | `niqra://login-callback` |
| App URL scheme (Android manifest + iOS Info.plist + app.json) | `niqra` |
| Supabase provider id used by the app | `apple`, `google`, `facebook`, `linkedin_oidc` |

## Apple (Sign in with Apple = iCloud login)

Set up on the **company** Apple Developer account, 2026-09-23.

| Item | Value | Secret? / Stored at |
|---|---|---|
| Team ID | `UJV5N29U6F` | not secret |
| App ID (bundle id) | `ng.moneta.capital` (portal name "XC ng moneta capital") — *Sign In with Apple* capability ticked | not secret |
| Services ID | `ng.moneta.capital.signin` (description "ETICO Sign In") | not secret |
| Services ID → Domain | `cmrxwuqfagqskrjdmjte.supabase.co` | not secret |
| Services ID → Return URL | `https://cmrxwuqfagqskrjdmjte.supabase.co/auth/v1/callback` | not secret |
| Key name | `ETICO Sign In with Apple` | not secret |
| Key ID | `296TLG6SUU` | not secret |
| Private key file | `AuthKey_296TLG6SUU.p8` | **SECRET** — password manager. Apple allows one download only; if lost, revoke and create a new key. |
| Supabase "Client IDs" | `ng.moneta.capital.signin,ng.moneta.capital` | not secret |
| Supabase "Secret Key (for OAuth)" | JWT generated from the .p8 (ES256, iss = Team ID, sub = Services ID, kid = Key ID) | **SECRET** — Supabase only. **Expires every 6 months.** |
| Secret generated on | _(fill in)_ | |
| **Secret expires / regenerate by** | _(fill in — 6 months after generation; set a calendar reminder a month earlier)_ | |

If the secret expires, Apple sign-in fails for everyone until a new one is
generated from the same `.p8` and pasted into Supabase.

## Google

| Item | Value | Secret? / Stored at |
|---|---|---|
| Google Cloud project | _(fill in)_ | not secret |
| OAuth consent screen | External, app name "ETICO", domain `etico.ng`, privacy `https://www.etico.ng/privacy` | not secret |
| OAuth client type | Web application | |
| Authorized redirect URI | `https://cmrxwuqfagqskrjdmjte.supabase.co/auth/v1/callback` | not secret |
| Client ID | _(fill in)_ | not secret |
| Client Secret | — | **SECRET** — password manager + Supabase |

## Facebook

| Item | Value | Secret? / Stored at |
|---|---|---|
| Meta app name | _(fill in)_ | not secret |
| App ID | _(fill in)_ | not secret |
| Valid OAuth Redirect URI | `https://cmrxwuqfagqskrjdmjte.supabase.co/auth/v1/callback` | not secret |
| App domain / privacy / data deletion | `etico.ng` / `https://www.etico.ng/privacy` / `https://www.etico.ng/delete-account` | not secret |
| Mode | must be **Live** (Development mode = testers only) | |
| App Secret | — | **SECRET** — password manager + Supabase |

## LinkedIn (OpenID Connect)

| Item | Value | Secret? / Stored at |
|---|---|---|
| LinkedIn app name / company page | _(fill in)_ | not secret |
| Product | "Sign In with LinkedIn using OpenID Connect" | |
| Authorized redirect URL | `https://cmrxwuqfagqskrjdmjte.supabase.co/auth/v1/callback` | not secret |
| Client ID | _(fill in)_ | not secret |
| Primary Client Secret | — | **SECRET** — password manager + Supabase |
| Supabase provider | **LinkedIn (OIDC)** — not the legacy "LinkedIn" | |

## Troubleshooting

- "Provider is not enabled" → that provider isn't switched on / saved in Supabase.
- Ends up on the website instead of back in the app → `niqra://login-callback` missing from Supabase Redirect URLs.
- Apple works then suddenly stops → the 6-month Apple secret expired; regenerate.
- Browser autofill can put your email/password into these provider forms — check before saving.
