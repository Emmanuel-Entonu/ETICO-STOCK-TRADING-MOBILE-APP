# Session handoff — 2026-09-29 → 2026-10-01

> **Written for: the next engineer/AI picking up ETICO.** Read this first, then
> [`../HANDOFF.md`](../HANDOFF.md) (system map) and [`IOS_RELEASE.md`](IOS_RELEASE.md)
> (iOS release). **No secrets in this file** — it's a public repo; it only says
> where secrets live.

Repos (all on the Desktop of the Windows dev machine):

| Repo | Folder | Branch | Deploys to |
|---|---|---|---|
| Mobile (this) | `Moneta Stock  Trading App` | `main` | EAS builds (iOS from the Mac / EAS cloud) |
| Proxy | `Moneta-stock trading Demo` | `main` | `moneta-app-ten.vercel.app` (push = deploy) |
| Web | `Niqra-web` | `master` | `www.etico.ng` (push = deploy) |

---

## 0. URGENT — open right now (2026-10-01)

### 0.1 Moneta's VA server (`app.moneta.ng`) is down-slow → every wallet feature fails
Since **~01:00 WAT 1 Oct**, every request to `https://app.moneta.ng` takes **~20–21 s** to
answer (even unauthenticated requests and the homepage). Our `moneta-va` function first mints a
partner token (`GET /partner/auth/access-token`, ~21 s) and then makes the real call (~21 s), so it
always hits Vercel's **30 s limit** → `504 FUNCTION_INVOCATION_TIMEOUT`.

**Proven to be Moneta's side, not ours** (see §5 for how to re-test):
- Same ~21 s directly from an unrelated network, through the Fly proxy (**50.31.197.117**), and through
  both Fixie IPs (**54.217.142.99**, **54.195.3.54**).
- TCP + TLS complete in ~0.3 s; Moneta's own `Date` response header is ~20 s after the request was
  sent → the delay is inside their server (nginx at **144.126.197.31**).
- `api.moneta.ng` (159.65.160.60 — BVN, name-enquiry, email) answers in ~1 s from all routes.
- Our load is negligible (~140 wallet-endpoint requests/hour across all users).
- The owner has the copy-paste report for Moneta (timed captures). Waiting on Moneta.

| Broken until Moneta fixes it (all `api/moneta-va.ts` → Fly `/nibss-app` → `app.moneta.ng`) | Still works |
|---|---|
| VA creation after KYC · live VA balance · VA transaction history · deposit crediting (`reconcile-funding` reads VA balances) · IPO VA→VA transfer + `ipo-status`/`ipo-sweep` · partner dashboard "collection VA balance (live)" | BVN verify (`nibss-bvn`) · settlement account-name enquiry · emails (`send-email*`) · **wallet → trading-account funding** (`fund-wallet` uses our DB `va_available` + PAC, no Moneta call) · PAC trading/market data |

Nothing is lost: deposits get credited and stuck IPO payments resolve once Moneta answers normally.
**When it recovers: re-run the §5 tests, then do 0.2.**

### 0.2 User A.A.'s VA "No account found" in a bank app
- Profile **exists and is intact**: profile id `717d0251-…` (owner knows the user), KYC `verified`,
  CSCS `pending`, VA ending **…6878**, **Providus Bank**, name `MONETA TECH(Blessing-…)`,
  `va_available` ₦796. Get the full VA number/reference from `profiles`.
- In the owner's Moniepoint screenshot the bank was **not selected** ("Select Bank") — retry with
  Providus selected first.
- 3 users' VAs were created on the **old "Blessing" Moneta merchant**, 3 on the new **"ETICO"** one
  (the bracket prefix in `va_account_name`). The owner's own old-merchant VA (…9838) still
  resolves, so the merchant switch did **not** drop old VAs wholesale.
- **Next step once Moneta is responsive:** query his VA via the backend (`moneta-va` `balance` /
  `transactions` with his `va_reference`). If Moneta says not-found/inactive while others work → ask
  Moneta about that single VA. The owner also asked to try `moneta-va` `create` with his details
  (it only forwards to Moneta, writes nothing to our DB; Moneta allows **one VA per BVN**, so a
  refusal = his VA is still registered). **Do NOT run `create` while Moneta is slow** — the 30 s
  timeout hides the reply and Moneta may still create a VA we never see.

### 0.3 PAC trading accounts aren't linked → orders fail "No trading account number found"
- PAC issued CSCS number + CHN but left every user investment account with no trading account
  (`tradingAccountNo` / `clearingAccountNo` / `tradingAccounts` empty). Only Moneta's own account
  (0000031002) has one. Fee calc and orders fail for every user.
- **Built (live):** `api/reconcile-funding.ts` → `linkTradingAccount(uid)` PATCHes
  `/investing/api/v1/investment/accounts/{id}` keeping every existing field + CSCS/CHN. Runs on the
  user's wallet reconcile, on partner KYC approval (web `verifySubmissionAction` →
  `action:'link-trading'` with `EMAIL_SEND_SECRET`), and for all users on cron runs.
- **Blocked:** PAC answers **403 Access Denied** — the endpoint needs role
  `investment_account_update` (or `sysadmin`) and our PAC API user doesn't have it. The owner is
  asking PAC to grant the role **or** link accounts themselves (CSCS no. + CHN are on each
  `profiles` row). Once granted, it starts working with no code change. Until then each approved
  user's wallet open makes one harmless refused PATCH.

### 0.4 SQL the owner still has to run (Supabase SQL editor)
| File | Status | Notes |
|---|---|---|
| `supabase/events-ipo-lots-2026-09-30.sql` | **not confirmed run** | Min 10 / multiples of 10 / no cap (cap stored as 1,000,000 so old builds don't read null as 0). **Supersedes** `events-ipo-require-details-2026-09-30.sql` (includes its "fully verified + all details" rules). |
| `supabase/remove-nin-2026-09-30.sql` | **run only after 1.0.1 (build 18) has rolled out** | Drops `profiles.nin/id_type/id_number`, recreates `partner_list_submissions`. Older builds still write those columns → their KYC submit + wallet setup would break. Irreversible. |
| Blessing's CHN `update public.profiles set chn=… where id='e3ed42f4-…';` (value given by owner in chat) | not confirmed | Needed for his IPO eligibility + PAC link. |
| `profiles_kyc_status_check` adding `'skipped'` | not confirmed | Given earlier. |

### 0.5 No cron is calling the reconciler
`vercel.json` has no `crons`, and the logs only show user-triggered `reconcile-funding` calls. So the
scheduled parts never run: **`ipo-sweep`** (resolves stuck IPO payments) and **link-all trading
accounts**. Either add a Vercel cron (watch the Hobby **12-function cap** — crons don't add a
function) or an external cron hitting `POST /api/reconcile-funding?commit=1` with `x-cron-secret`.

---

## 1. What shipped this session (all pushed)

### Events / Dangote IPO (mobile + web + proxy)
- Events is its own section: **Events product card** on Assets (mobile) / Market (web) → events list of
  **banner cards** → event page. Dangote logo square; banner removed from the mobile IPO page.
- Subscribe = server-priced (shares × ₦525), PIN/re-auth gated, money moves **VA→VA** to the collection
  VA **9644114164** (Mr Ibrahim, ref `VATWU3OZLOVURMXDC9MQH0`, Providus) via Moneta
  `POST /partner/virtual-accounts/transfer`, sent **once, never retried**; unknown outcome stays
  `processing` and is resolved from VA history (refund only after 60 min with history read OK).
- Eligibility (DB-enforced): KYC `verified` + CSCS `approved` + CSCS no., CHN, BVN, name, email, phone
  on file; details carried silently.
- **Lots (latest):** minimum **10**, multiples of **10**, **no per-user cap**. Clients:
  `lotMin/lotStep/lotMax/hasCap/capReached` in `src/lib/eventsApi.ts` and `Niqra-web/src/lib/events.ts`
  (fall back to lots of 1 if the SQL hasn't run). Web Buy dialog header = "Minimum buyable / Buy in
  multiples of" (PAC style). Proxy maps `below_minimum:<n>` / `not_multiple:<n>`; per-request cap 1,000,000.
- Partner dashboard `/partner/events/[id]`: totals, one row per subscriber (PAC ID, full BVN, settlement
  bank/account/name, email, phone, CSCS, CHN, shares × price), CSV, mark placed, **live collection VA
  balance** (proxy `ipo-collection-balance`, auth = `EMAIL_SEND_SECRET`).
- **First real subscription verified**: Blessing, 1 share, ₦525, transfer sent
  2026-09-30 14:02:40 (his VA → collection VA), backend 200 (bought before the 10-lot rule).

### NIN removed everywhere (owner: "we don't need the NIN")
- Mobile + web KYC: no NIN/ID field, step 2 is just **Settlement account**; no NIN in review; BVN parse
  drops `nin`; partner review "Identification" section and both PDFs' ID rows removed; PAC email no
  longer selects `id_type/id_number`; NIN/ID validators deleted.
- **Moneta VA create payload still sends `nin`** (required) = placeholder **`0000000000`** always
  (real NINs were never used — only 10-digit values passed the old check).
- Proxy `nibss-bvn` strips `nin` from the details it returns.
- Background: Moneta's `/api/v2/bvn/details` **changed** (seen 2026-09-30): no `nin`, no `title`, new
  `customer_id`, message "Successfully Retrieved". Our request/creds unchanged since May. **Do not treat
  `customer_id` as the NIN** (tried + reverted).

### Other fixes
- **Fixie quota**: 2026-09-30 every BVN call failed with `407 Monthly request quota exceeded` (free
  "tricycle" plan, 500 req/month, cycle resets the 7th). Owner upgraded (Fixie login:
  `app.usefixie.com/login`, Google sign-in). BVN worked again 13:06. Fixie IPs: 54.217.142.99,
  54.195.3.54.
- **Blessing's ₦50 fund-wallet** (2026-09-30 02:18): PAC deposit `POSTED` (trans `0000071502`) but
  `cashBalance` stayed 0 for hours, then applied. PAC-side lag; never re-send a "stuck" funding.
- Web wealth-card beams rotated **30°** to match mobile.
- KYC PDF selfie: EXIF auto-orient (browser canvas / server `sharp().rotate()`), fitted + centred.
  **The selfie capture itself is untouched — owner said leave it.**
- All card CTAs **centred** (owner never asked for right-aligned). Home "Load wallet" / "Invest now" green.

---

### Web (Niqra-web) — also see `Niqra-web/docs/HANDOFF_2026-10-01.md`
- Everything above mirrored on web (Events/IPO, lots, NIN removal, PDF photo fix, centred CTAs,
  green buttons, beams 30°), plus partner-dashboard work (IPO page, CHN, PAC link on approval).
- **2026-10-01 launch perf + mobile fixes** (`0af4173`, `5b91542`): Lenis smooth-scroll removed,
  hero self-hosted WebP, landing statically generated + edge-cached (5 min), Supabase/ogl/LiquidChrome
  lazy-loaded, Beams + LineWaves pause off-screen; wallet balance/button stack on phones, account
  number not squeezed, menus lock page scroll. Landing JS 1258 KB → 957 KB.
- Web Events/IPO handoff updated: `Niqra-web/docs/HANDOFF_EVENTS_IPO.md`.

## 2. Owner's working rules (follow these)
- **Every change on BOTH mobile and web** unless told otherwise.
- **Test against our backend, not locally** (call `moneta-app-ten.vercel.app` endpoints the way the apps
  do). Pull and compare **logs before assuming**; never guess a field mapping.
- **No `Co-Authored-By` / AI trailer on commits** (`HANDOFF.md` §7). This session added them by
  mistake before noticing — don't repeat.
- **Pull before pushing** — teammates (e.g. Musa) push to `main` (build 18 / `IOS_RELEASE.md`).
- Buttons/CTAs centred. Don't touch the KYC selfie capture.
- Short, direct answers; when blocked by a permission prompt, explain and let the owner decide.

---

## 3. Credentials & access (where, never values)
- Vercel proxy env holds everything (PAC, Moneta onboard/VA, BVN service, email, `CRON_SECRET`,
  `EMAIL_SEND_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `FIXIE_URL`).
- `vercel env pull` **blanks values marked sensitive** (service role, cron secret, Moneta creds).
  `FIXIE_URL` is not sensitive and pulls fine.
- Vercel **Hobby log retention ≈ 1 hour**, and `vercel logs` shows only the **first log line** of each
  request (use `--json` for status codes; the dashboard shows all lines).
- Safe pattern for user-path tests: Supabase admin `generate_link` (magiclink) → `/auth/v1/verify` →
  one-time JWT for the owner's own account (`xrenegade1815@gmail.com`) → call the backend → `logout`.
- Delete any local scratch copies of secrets when done.

---

## 4. Key people / accounts / ids (not secrets)
- Owner test account: `xrenegade1815@gmail.com` (profile `9292a7f0-…`, VA on the old merchant).
- Blessing (test user): profile `e3ed42f4-…`, VA on the new ETICO merchant.
- Collection VA (Dangote IPO): 9644114164 "MONETA TECH(ETICO-Ibrahim)".
- PAC client "Moneta Technology Ltd" `019e2ad4-…`; settlement source acct `11011120221`.
- PAC OpenAPI spec is public at `https://api.prod.mywealthcare.io/investing/v3/api-docs` (needs the daemon token).

---

## 5. How to test the Moneta VA services (what we ran)

Goal: separate "our code/IPs" from "Moneta". All tests are **read-only**; unauthenticated probes
expect `401` — **we only measure how long Moneta takes to answer.**

**A. Through our backend, like the app** (needs the cron secret or a one-time user JWT, §3):
```bash
curl -s -m 45 -w "\nhttp=%{http_code} t=%{time_total}s\n" -X POST \
  https://moneta-app-ten.vercel.app/api/moneta-va -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"action":"balance","virtual_account_reference":"<va_reference from profiles>"}'
# user path: -H "Authorization: Bearer $JWT" (the backend uses the caller's own VA ref)
# other actions: transactions, list, ipo-status, create (create = real VA; see 0.2)
```
2026-10-01 result: `504 FUNCTION_INVOCATION_TIMEOUT` after ~31 s for every VA. Backend logs showed no
`[moneta-va auth]` line → it stalls on the token call (`moneta-va.ts` `getPartnerAccessToken`).

**B. Through the Fly static-IP proxy (50.31.197.117), core services, no creds:**
```bash
F=https://moneta-proxy.fly.dev
for p in partner/auth/access-token \
         "partner/virtual-accounts/account-balance?virtual_account_reference=test" \
         "partner/virtual-accounts/transaction-histories?virtual_account_reference=test" \
         partner/virtual-accounts; do
  curl -s -o /dev/null -m 45 -w "$p HTTP %{http_code} first-byte %{time_starttransfer}s\n" "$F/nibss-app/api/v1/$p"
done
curl -s -o /dev/null -w "BVN control %{time_total}s\n" "$F/api/v2/generate-access-token"   # api.moneta.ng
curl -s -w "  fly itself %{time_total}s\n" "$F/ip"
```

**C. Through Fixie (our other static IPs 54.217.142.99 / 54.195.3.54):** `curl -x "$FIXIE_URL" …` to
`https://app.moneta.ng/api/v1/partner/auth/access-token`. Fixie keeps one egress IP for a while; check
which with `curl -x "$FIXIE_URL" https://api.ipify.org`. (Each call uses Fixie quota.)

**D. Direct, unrelated network** (proves it's not our routing):
```bash
curl -s -o /dev/null -D - -m 45 \
  -w "connect %{time_connect}s tls %{time_appconnect}s first-byte %{time_starttransfer}s\n" \
  https://app.moneta.ng/api/v1/partner/auth/access-token | grep -iE "^date|^server|first-byte"
```
Compare Moneta's `Date:` header with the send time → server-side processing delay.

**Healthy baseline:** Fly `/ip` < 1 s, `api.moneta.ng` ~1 s, `app.moneta.ng` should also be ~1 s.
When `app.moneta.ng` is back to ~1 s, test A should return a balance in a few seconds.

---

## 6. Other open items
- Session expiry shows raw "Broker 401 …" — change to "Session expired, sign in again" (mobile + web).
  Builds ≥16 have the token-refresh fix (`a2169df`); ≤15 don't.
- Android build: EAS free Android builds reset **1 Oct**; build from the Mac or EAS.
- iOS 1.0.1 (build 18) — submit for review (see `IOS_RELEASE.md` §1).
- Bank lookup on a VA should always be done with **Providus Bank** selected.
