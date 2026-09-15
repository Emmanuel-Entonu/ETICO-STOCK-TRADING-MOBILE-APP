# Niqra Funding Flow — Full Spec (start / middle / end)

## The model (boss's start-middle-end)

- **START — the wallet / scoreboard.** A number in our Supabase DB, per user.
  What they're allowed to spend. This is all the user sees.
- **MIDDLE — the user's Moneta virtual account (Providus).** Their real money.
  They fund this. It stays here, held, until settlement.
- **END — the central PAC account** `019e2b0e-a0a4-7c7f-b069-b86f4ac6c150`
  (linked to xrenegade1815@gmail.com's profile). Pre-funded float. EVERY
  user's trades execute against this one account.

Flow: user funds MIDDLE → app sets START (scoreboard) to that amount → user
trades against END (already funded) → scoreboard ticks down → LATER we settle
by sweeping MIDDLE balances into the central account.

## Moneta payments API — endpoints we use

Base: `https://app.moneta.ng/api/v1`
Auth: partner `client_id` / `client_secret` (basic auth) → Bearer token.
**These are SECRETS — they live on the Vercel proxy only, never in the app.**

1. **Create virtual account** — `POST /partner/virtual-accounts`
   Body: `{ account_name, account_type: "static", surname, first_name, bvn, nin }`
   Returns: `{ virtual_account_reference, account_number, account_name, bank_name }`
   → Called once per user at KYC completion.

2. **Detect credit** — `GET /partner/virtual-accounts/transaction-histories?fromDate=&toDate=&virtual_account_reference=`
   Returns credits with `reference`, `action_type: "credit"`, `amount_paid`,
   `transaction_fee`, `amount_settled`.
   → Polled server-side to detect funding.

3. **Balance** — `GET /partner/virtual-accounts/account-balance?virtual_account_reference=`
   → Optional sanity check.

4. **Transfer (settlement only)** — `POST /partner/virtual-accounts/transfer`
   Body: `{ source_virtual_account, destination_virtual_account, amount }`
   Returns `{ reference, status, ... }`. Moves money VA→VA *inside Moneta*.
   Does NOT reach PAC. Used at settlement to consolidate user VAs into one
   central Moneta VA. NOT called at funding time.

## The funding build (app + proxy + DB)

### 1. Proxy — new server endpoint `/api/moneta-va` (Vercel)
Holds the partner credentials, mints the Moneta bearer token, and forwards:
- create-account
- transaction-histories
- account-balance
- transfer
Same pattern as the existing `nibss-bvn` proxy. Client never sees credentials.

### 2. DB — new columns on `profiles`
- `va_reference    text`   — virtual_account_reference
- `va_number       text`   — account_number (shown to user)
- `va_bank         text`   — bank_name ("Providus Bank")
(cash ledger `wallet_balance` + `wallet_transactions` already exist.)

### 3. KYC — create the VA
After BVN verified + NIN captured, call create-account, store the 3 va_*
columns. If it fails, KYC still succeeds — VA creation retried on first
"Add money" open.

### 4. "Add money" screen
Shows: "Transfer to **{va_number}**, {va_bank}" + copy button + the user's
name. No card/redirect. Below: "Funds reflect within ~1 min of transfer."

### 5. Funding detection → scoreboard
Server polls transaction-histories for the user's VA (poll-on-open + a cron
backstop). For each new `reference` we haven't seen:
  → credit `wallet_balance` by `amount_settled`
  → insert `wallet_transactions` row keyed on `reference` (UNIQUE = idempotent)
Double-detection can't double-credit (23505 on the unique reference).

### 6. Trading routes to the CENTRAL account
Order execution uses `CENTRAL_PAC_ACCOUNT_ID = 019e2b0e-...` for ALL users,
not the per-user `pacAccountId`. Each order:
  → debits the user's `wallet_balance` (atomic, via decrement_wallet)
  → executes against the central PAC account
  → updates the per-user HOLDINGS sub-ledger (see below)

### 7. Holdings sub-ledger (REQUIRED by the central model)
Because everyone trades against ONE PAC account, PAC only knows the aggregate.
We must track per-user positions ourselves:
  new table `user_holdings (user_id, symbol, quantity, avg_cost)`
  buy  → increment user's qty + recompute avg_cost
  sell → check user's qty is sufficient (NOT PAC's aggregate), decrement
Holdings screen reads from THIS table, not from PAC.

### 8. Settlement (later, ops)
Periodically sweep each user's MIDDLE (VA) balance → central Moneta VA via
transfer, then Moneta moves the pool to the PAC custodian. Keeps the END
float ahead of total user spend. Batch job, out of the hot path.

## Fee decision
`amount_paid 1000, transaction_fee 5, amount_settled 995`.
Default: credit `amount_settled` (995) — user absorbs the fee.

## Open dependencies before build
- Partner `client_id` / `client_secret` set as env vars on Vercel.
- Confirm NIN is always available at KYC (BVN lookup returns it; if user
  skips BVN, need a NIN capture fallback — create-account requires nin).
- Confirm the central-account decision (all users → 019e2b0e-...) with boss.
- Webhook vs polling: confirm with Moneta if a credit webhook exists.
