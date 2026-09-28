import { config } from './config'
import { supabase } from './supabase'

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Settlement-account name enquiry (KYC #18).
//
// Mirrors the PROVEN server flow in MPA Moneta App (app/api/accounts/lookup):
// Moneta's partner `account/resolve` returns "Invalid bank" for us, so name
// resolution goes through the NIBSS **debit-instruction name-enquiry** — the
// same Moneta service the BVN uses. That call needs the user's BVN + the 6-digit
// NIBSS institution code, and doubles as a BVN⇄account match (exactly what KYC
// wants). It therefore only works when the user provided a BVN.
//
// The client never holds Moneta creds — this hits the ETICO proxy route
// `/api/account-name-enquiry`, which does the generate-access-token
// (X-Auth-Token = base64(CLIENT_ID:CLIENT_SECRET:BVN_SERVICE_TOKEN)) →
// X-Service-Token → name-enquiry dance server-side through the whitelisted IP.
export interface NameEnquiryResult {
  name: string
  verified: boolean
}

export async function resolveAccountName(params: {
  accountNumber: string       // 10-digit NUBAN
  institutionCode: string     // 6-digit NIBSS code (from NG_BANKS)
  bvn: string                 // 11-digit BVN, required by the enquiry service
}): Promise<NameEnquiryResult> {
  const res = await fetch(`${config.proxyBase}/api/account-name-enquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      accountNumber: params.accountNumber,
      institutionCode: params.institutionCode,
      bvn: params.bvn,
    }),
  })
  if (!res.ok) throw new Error(`Account enquiry failed (${res.status})`)
  const data = await res.json() as { name?: string; verified?: boolean; error?: string }
  if (data.error) throw new Error(data.error)
  return { name: data.name ?? '', verified: !!data.verified }
}
