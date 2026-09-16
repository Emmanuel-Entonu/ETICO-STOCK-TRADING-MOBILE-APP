# ETICO × PAC — Partner Dashboard, KYC Review, Rejection & Redo

> **Audience:** the ETICO **mobile** engineering team.
> **Purpose:** document the partner-review + KYC-settlement + CSCS-status system
> that now exists on the **web** app, spell out the **mobile changes** needed to
> match it (rejection UI + redo KYC, CSCS "pending" on finalize, VA persistence
> fix), and record the **bug-check** findings for the KYC status flow and the
> wallet system.
> `web:` = the Next.js app (`Niqra-web`, serves `www.etico.ng`).
> `mobile:` = this repo.

---

## 0. TL;DR — what mobile must do

1. **Run one SQL fix (shared DB): re-add the `bvn` column.** It was dropped by a
   half-finished encryption migration, so **KYC currently fails** on both apps
   (both write `profiles.bvn`). Highest priority. (§6.1)
2. **Set `cacs_status = 'pending'` when KYC finalizes** (mobile skips this today,
   so mobile users have no "under review" state and don't appear correctly).
   (§4, §6.2)
3. **Persist the VA through the `set_virtual_account` RPC**, not a client
   `.update()` on `va_*` (that write fails once the column revoke is on → the
   wallet re-provisions a duplicate VA every launch). (§6.3)
4. **Add the rejection UI + "Redo KYC"** so a rejected user sees the reviewer's
   reasons and can resubmit. (§5)

---

## 1. The model (how CSCS verification works now)

A user completes **identity KYC** (BVN + ID + settlement bank account). That is
**not** the same as being allowed to trade. A **PAC Securities reviewer** must
open the user's **CSCS account** by reviewing the submission and approving it.
The trade gate is `cacs_status === 'approved'`.

```
 user finishes KYC ──▶ kyc_status = 'verified'
                       cacs_status = 'pending'      ("CSCS under review")
                              │
              PAC reviewer opens the partner dashboard,
              sees the submission, and decides:
                              │
          ┌───────────────────┴────────────────────┐
     APPROVE                                     REJECT (with reasons)
  cacs_status='approved'                    cacs_status='rejected'
  → trading unlocks (web + mobile)          cacs_rejection_reason='…'
                                            → user sees reasons, redoes KYC
```

`cacs_status` lifecycle: `not_submitted → pending → approved | rejected`
(and `rejected → pending` again after a redo). It lives on `profiles` and is
**shared** by web and mobile, so a decision reflects on both instantly (on the
user's next profile load).

---

## 2. What was built on the WEB (for reference)

### 2.1 KYC now also collects the settlement bank account
The PAC account-opening form's **BANK ACCOUNT DETAILS** (settlement account for
sale proceeds / withdrawals): **bank name, 10-digit account number, account
name**. BVN still supplies the personal fields.
`web:` `src/app/app/kyc/page.tsx` (step 2), `src/lib/actions/kyc.ts`.
Persisted to `profiles.settlement_account_name / _account_number / _bank_name`.

On finalize the web sets `cacs_status = 'pending'`:
```ts
// web: src/lib/actions/kyc.ts → finalizeKycAction
.update({ pac_account_id, kyc_status: "verified", cacs_status: "pending" })
```

### 2.2 The partner dashboard
- Routes: **`/partner`** (login) → **`/partner/review`** (queue).
  Live at `https://www.etico.ng/partner`.
- **Auth = env credentials on the web Vercel project** (NOT Supabase user
  accounts). The login checks the typed email/password against env vars, then
  sets an HMAC-signed, httpOnly session cookie.
  - Env vars on the **web** project: `PARTNER_EMAIL`, `PARTNER_PASSWORD`,
    `PARTNER_SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
  - `web:` `src/lib/partner-auth.ts`, `src/lib/actions/partner.ts`.
- **Data access = Supabase service role** (server-only) because RLS blocks a
  reviewer from reading other users' `profiles`. Reads the whole review queue,
  writes the decision.
  - `web:` `src/lib/supabase/admin.ts`, `src/app/partner/review/page.tsx`.
- **Review UI**: list (segmented **Awaiting | All** filter) + detail panel with
  every field (BVN identity, ID, settlement account, PAC account id) + **Verify
  & approve CSCS** / **Reject**.
  - `web:` `src/components/partner/partner-review.tsx`.
- **Reject** opens a dialog with a **picklist of causes** (below); the chosen
  text is saved to `cacs_rejection_reason`.
  - `web:` `src/components/partner/reject-dialog.tsx`.

> Note: a user who finished KYC on **mobile** shows as **"Awaiting review"** in
> the dashboard even though `cacs_status` is still `not_submitted`, because the
> dashboard treats "kyc verified + cacs not decided" as needing review. Once
> mobile sets `cacs_status='pending'` (§6.2) this is exact.

### 2.3 The rejection cause list (keep identical on mobile)
```
BVN details don't match the name provided
Name on the settlement account doesn't match the applicant
Settlement bank account number is invalid or incorrect
ID document is unclear, expired, or unverifiable
ID number doesn't match the selected ID type
Applicant appears to be under 18
Suspected duplicate or existing account
Incomplete or inconsistent information
```
The reviewer can tick several + add a free note. They're stored joined by
`" • "`, e.g. `Reason A • Reason B • Note: <text>`. **Split on `•`** to render
them as a list on the user side.

---

## 3. Database (shared Supabase project)

| Item | Where |
|---|---|
| `profiles.settlement_account_name / _account_number / _bank_name` | `Niqra-web/supabase/kyc-settlement.sql` |
| `profiles.bvn` (plaintext text) — **must exist**, currently DROPPED (§6.1) | re-add: `alter table public.profiles add column if not exists bvn text;` |
| `cacs_status`, `cacs_rejection_reason` | already present |
| Wallet: `set_virtual_account`, `decrement_wallet`, `increment_wallet`, `reconcile_deposit`, `claim_payment`, `wallet_transactions` | `Niqra-web/supabase/wallet.sql` + this repo's `supabase/*.sql` |

The partner dashboard's final version does **not** use `partner_admins` or the
`partner_*` RPCs (that was an earlier iteration) — auth is env creds + service
role. You can ignore `Niqra-web/supabase/partner-dashboard.sql`.

After any schema change: `notify pgrst, 'reload schema';`.

---

## 4. Mobile change — set CSCS to "pending" on KYC finalize

Today mobile finalizes without `cacs_status`, so the user has no "under review"
state and the reviewer queue can't tell mobile submissions apart cleanly.

```ts
// mobile: app/(auth)/kyc.tsx  (the finalize update, ~L181)
const { error: updateErr } = await supabase.from('profiles')
  .update({
    pac_account_id: pacAccountId,
    kyc_status: 'verified',
    cacs_status: 'pending',           // ← ADD THIS
  })
  .eq('id', user.id)
```
(If the `cacs_status` column is ever UPDATE-revoked from clients, move this to a
SECURITY DEFINER RPC — see §6.4. Right now the direct write works.)

---

## 5. Mobile change — rejection reasons + Redo KYC

The store already hydrates `cacsRejectionReason` (`authStore.ts:158`). It just
isn't shown, and there's no redo entry point. Mirror the web's `CscsNotice`.

**Where:** the dashboard/home and/or `app/(app)/account.tsx`.

**Behaviour** (only once identity KYC is done, i.e. `kycStatus === 'verified'`):
- `cacsStatus === 'approved'` → show nothing (trading is unlocked).
- `cacsStatus === 'pending'` **or** `not_submitted` → "CSCS account under review
  by PAC Securities. Trading unlocks once approved."
- `cacsStatus === 'rejected'` → show the reasons + a **Redo KYC** button.

```tsx
// mobile: src/components/CscsNotice.tsx  (sketch — adapt to your UI kit)
import { useAuthStore } from '../store/authStore'
import { router } from 'expo-router'

export function CscsNotice() {
  const kycStatus = useAuthStore(s => s.kycStatus)
  const cacsStatus = useAuthStore(s => s.cacsStatus)
  const reason = useAuthStore(s => s.cacsRejectionReason)
  if (kycStatus !== 'verified' || cacsStatus === 'approved') return null

  if (cacsStatus === 'rejected') {
    const reasons = (reason ?? '').split('•').map(s => s.trim()).filter(Boolean)
    return (
      <Card tone="negative">
        <Text variant="bodyStrong" tone="negative">Your CSCS verification was rejected</Text>
        <Text variant="small" tone="muted">Fix these and redo KYC to try again.</Text>
        {reasons.map(r => (
          <Row key={r} gap="sm" align="flex-start">
            <Dot tone="negative" />
            <Text variant="small">{r}</Text>
          </Row>
        ))}
        <Button title="Redo KYC" onPress={() => router.push('/(auth)/kyc')} />
      </Card>
    )
  }
  // pending / not_submitted
  return (
    <Card tone="warning">
      <Text variant="bodyStrong">CSCS account under review</Text>
      <Text variant="small" tone="muted">
        Your details are with PAC Securities. Trading unlocks once approved —
        usually 1–2 business days.
      </Text>
    </Card>
  )
}
```

**Redo path:** `/(auth)/kyc` already re-runs the full flow and re-upserts the
profile; with §4 in place the resubmit sets `cacs_status='pending'` again, so
the user goes back into the review queue. No extra work — just make sure the KYC
screen is reachable when `kyc_status==='verified'` (it is).

`web:` reference implementation is `src/components/portfolio/cscs-notice.tsx`.

---

## 6. Bug-check report

### 6.1 CRITICAL — `bvn` column was dropped → KYC is broken
A partial "encrypt BVN at rest" migration added `bvn_enc` (bytea) and **dropped
the plaintext `bvn` column without ever backfilling** (`bvn_enc` is all NULL).
But **both apps still write `profiles.bvn`** (`web: kyc.ts:92`,
`mobile: kyc.tsx:151`). PostgREST rejects an unknown column, so **every new KYC
submission now fails**.

**Fix (run once on the shared DB):**
```sql
alter table public.profiles add column if not exists bvn text;
notify pgrst, 'reload schema';
```
Old BVNs are unrecoverable (never encrypted); those users re-verify. New ones
save fine after this. `bvn_enc` is dead weight — leave it or
`drop column if exists bvn_enc;`.

### 6.2 Mobile KYC doesn't set `cacs_status='pending'`
Confirmed at `app/(auth)/kyc.tsx:182` — finalize updates only `pac_account_id`
+ `kyc_status`. Consequence: mobile users sit at `cacs_status='not_submitted'`,
show no "under review" state, and only appear in the reviewer queue via the
"kyc verified ⇒ awaiting" fallback. **Fix in §4.**

### 6.3 Mobile VA persistence uses a client `.update()` on `va_*`
Confirmed at `authStore.ts:253` — `supabase.from('profiles').update({ va_reference, … })`.
`funding-security-patch.sql` **revokes UPDATE on `va_reference/va_number/va_bank/
va_account_name/va_last_balance/wallet_balance` from `authenticated`**. Once that
revoke is applied, this write **fails silently** (mobile ignores the result), the
VA never persists, and `ensureWallet` **re-provisions a second VA** on the next
launch. (Web already fixed this.)

**Fix — persist through the SECURITY DEFINER RPC** (already in
`Niqra-web/supabase/wallet.sql`, one-time write that can't overwrite/hijack):
```ts
// mobile: src/store/authStore.ts → ensureWallet, replace the .update({ va_* }) with:
const { error: rpcErr } = await supabase.rpc('set_virtual_account', {
  p_ref:  va.reference,
  p_num:  va.number,
  p_bank: va.bank,
  p_name: va.accountName,
})
if (rpcErr) throw new Error(rpcErr.message)
```
Make sure `set_virtual_account` exists on the DB (run `Niqra-web/supabase/wallet.sql`).

### 6.4 Status-column revokes (watch-out, not currently breaking)
`audit_2026_fixes.sql` revokes UPDATE on `wallet_balance, kyc_status,
cacs_status, pac_account_id` from clients. These are **not currently applied**
(KYC status writes still work), which is the only reason §4's direct
`cacs_status` write is fine. **If** you later apply that hardening, move the
KYC finalize (`kyc_status/pac_account_id/cacs_status`) into a SECURITY DEFINER
RPC (mirror `set_virtual_account`). The §6.1 evidence shows partial hardening
was applied piecemeal, so treat this as a live risk.

### 6.5 Wallet system — verification
- Ledger RPCs are **single-arg** (`decrement_wallet(delta)` /
  `increment_wallet(delta)`), auth enforced via `auth.uid()`. Mobile
  (`authStore.ts` credit/debit) and web both call them correctly with
  **kobo-rounded** amounts (`Math.round(n*100)/100`). ✅
- `wallet_balance` is the **spendable ledger**; both apps READ it for display
  and never overwrite it with the raw VA balance. ✅ (web `use-wallet.ts`,
  mobile `refreshWalletBalance`).
- Deposit reconciliation: web forwards `POST /api/reconcile-funding` to the
  shared proxy (JWT self-service + cron paths). Ensure the proxy's reconciler
  is scheduled (pg_cron / Vercel cron) and `CRON_SECRET` is set. The
  `reconcile_deposit` balance-guard makes it idempotent. ✅
- **Only real wallet bug is §6.3** (VA persistence on mobile).

---

## 7. Checklist

- [ ] **DB:** `alter table public.profiles add column if not exists bvn text;` +
      `notify pgrst, 'reload schema';` (§6.1) — unblocks KYC.
- [ ] **DB:** confirm `set_virtual_account` + settlement columns exist
      (`Niqra-web/supabase/wallet.sql`, `kyc-settlement.sql`).
- [ ] **Mobile:** set `cacs_status='pending'` on KYC finalize (§4).
- [ ] **Mobile:** persist VA via `set_virtual_account` RPC (§6.3).
- [ ] **Mobile:** add `CscsNotice` (under-review + rejection reasons + Redo KYC)
      (§5).
- [ ] **Reviewer login** works at `www.etico.ng/partner` with the web project's
      `PARTNER_*` env vars (already set on the web Vercel project).
