// Client-side Moneta payment helper.
// IMPORTANT: this calls a server-side proxy that holds the merchant secrets.
// The native app must NEVER contain CLIENT_SECRET / MAC_KEY / WALLET_SERVICE_KEY.
// If the Vercel proxy has not been updated to expose these endpoints, they must be
// added there first — see PRODUCT_HANDOFF.md § Part 3 (security).

import { config } from './config'
import { supabase } from './supabase'

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type PaymentType = 'card' | 'bank-transfer' | 'ussd'

interface InitResponse {
  reference: string
  authorizationUrl: string
}

export async function initializePayment(
  email: string,
  amountNaira: number,
  paymentType: PaymentType,
  callbackUrl: string,
): Promise<InitResponse> {
  const res = await fetch(`${config.proxyBase}/api/moneta-charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action: 'initialize', email, amountNaira, paymentType, callbackUrl }),
  })
  if (!res.ok) throw new Error(`Payment init failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { reference: string; authorizationUrl: string }
  return data
}

export async function verifyPayment(reference: string): Promise<{
  success: boolean
  amountNaira: number
  message: string
}> {
  const res = await fetch(`${config.proxyBase}/api/moneta-charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action: 'verify', reference }),
  })
  if (!res.ok) throw new Error(`Verify failed (${res.status})`)
  return res.json()
}

// ── Virtual account (wallet) ────────────────────────────────────────────────
// All wallet calls route through /api/moneta-va, which holds the partner
// service token and forwards to Moneta via the static (whitelisted) IP.

// The wallet proxy always answers with JSON. If we get an empty body or HTML
// (e.g. the /api/moneta-va route hasn't been deployed yet, so Vercel returns a
// 404 / the SPA shell), surface a clear message instead of a raw JSON.parse
// "Unexpected end of input".
async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text) {
    throw new Error(`Wallet service returned no response (${res.status}). Is the /api/moneta-va proxy deployed?`)
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`Wallet service error (${res.status}): ${text.slice(0, 140)}`)
  }
}

export interface VirtualAccount {
  reference:   string   // virtual_account_reference
  number:      string   // account_number
  accountName: string   // account_name as returned by Moneta
  bank:        string   // bank_name (e.g. "Providus Bank")
}

export async function createVirtualAccount(params: {
  accountName: string
  surname:     string
  firstName:   string
  bvn:         string
  nin:         string
}): Promise<VirtualAccount> {
  const res = await fetch(`${config.proxyBase}/api/moneta-va`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      action:       'create',
      account_name: params.accountName,
      account_type: 'static',
      surname:      params.surname,
      first_name:   params.firstName,
      bvn:          params.bvn,
      nin:          params.nin,
    }),
  })
  const raw = await parseJson(res) as { status?: boolean; message?: string; error?: string; data?: Record<string, string> }
  if (!res.ok || raw.status !== true || !raw.data) {
    throw new Error(String(raw.message ?? raw.error ?? `Could not create wallet (${res.status})`))
  }
  const d = raw.data
  return {
    reference:   String(d.virtual_account_reference ?? ''),
    number:      String(d.account_number ?? ''),
    accountName: String(d.account_name ?? params.accountName),
    bank:        String(d.bank_name ?? ''),
  }
}

// On-demand funding sync: asks the server to reconcile THIS user's own VA
// deposit into their PAC account + wallet ledger right now (instead of waiting
// for the periodic cron). Best-effort — the cron is the backstop. Idempotent
// server-side, so calling it repeatedly is safe.
export async function syncWalletFunding(): Promise<void> {
  try {
    await fetch(`${config.proxyBase}/api/reconcile-funding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    })
  } catch {
    // ignore — the scheduled reconciler will still pick it up
  }
}

// Move an amount from the user's Virtual Account (va_available) into their PAC
// trading wallet. Server-authoritative: it reserves from va_available, fires the
// cash_transactions DEPOSIT to PAC, and writes the va_ledger. Returns the new
// va_available on success; throws with a readable message otherwise.
export async function fundWalletFromVa(amountNaira: number): Promise<{ vaAvailable: number }> {
  const res = await fetch(`${config.proxyBase}/api/fund-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ amount: amountNaira }),
  })
  const raw = await parseJson(res) as { ok?: boolean; vaAvailable?: number; error?: string }
  if (!res.ok || raw.ok !== true) {
    throw new Error(String(raw.error ?? `Could not fund wallet (${res.status})`))
  }
  return { vaAvailable: Number(raw.vaAvailable ?? 0) }
}

// A single virtual-account transaction (money into/out of the user's Moneta VA).
export interface VaTransaction {
  id: string
  reference: string
  amount: number        // net amount that hit the VA (amount_settled)
  amountGross: number   // gross amount paid before fee
  fee: number
  type: 'credit' | 'debit'
  party: string         // merchant/narration, or a sensible default
  status: 'success' | 'failed'
  ts: number            // epoch ms
}

// Pull the user's VA transaction history (real bank deposits/debits) from
// Moneta via the proxy. The proxy resolves the caller's OWN VA reference from
// their JWT — the client never supplies it — so a user can only see their own.
// Dates are optional (server defaults to the last 90 days).
export async function getVaTransactions(opts?: { fromDate?: string; toDate?: string }): Promise<VaTransaction[]> {
  const res = await fetch(`${config.proxyBase}/api/moneta-va`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      action: 'transactions',
      ...(opts?.fromDate ? { fromDate: opts.fromDate } : {}),
      ...(opts?.toDate ? { toDate: opts.toDate } : {}),
    }),
  })
  const raw = await parseJson(res) as { status?: boolean; data?: { transactions?: VaTransaction[] }; error?: string; message?: string }
  if (!res.ok || raw.status !== true) {
    throw new Error(String(raw.error ?? raw.message ?? `Could not load transactions (${res.status})`))
  }
  return raw.data?.transactions ?? []
}

// Returns the wallet balance in naira, or null if it could not be read.
export async function getVirtualAccountBalance(reference: string): Promise<number | null> {
  const res = await fetch(`${config.proxyBase}/api/moneta-va`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action: 'balance', virtual_account_reference: reference }),
  })
  const raw = await parseJson(res) as { status?: boolean; data?: { balance?: string | number } }
  if (!res.ok || raw.status !== true || raw.data?.balance == null) return null
  const n = Number(raw.data.balance)
  return Number.isFinite(n) ? n : null
}
