import { config } from './config'
import { supabase } from './supabase'

// Finalize KYC through the web app's shared server path (Niqra-web
// POST /api/kyc/finalize) so mobile and web behave identically: a service-role
// write of pac_account_id / kyc_status='verified' / cacs_status='pending', then
// the branded KYC PDF (with the user's identifier email user+<ref>@etico.ng and
// verification selfie) is emailed to PAC server-side.
//
// Falls back to the legacy client-side write if the web route is unreachable
// (network error, 404 before web deploys, 5xx), so KYC completion never blocks
// on it — the PAC PDF is skipped in that case. A 4xx other than 404 is a real
// rejection (e.g. PAC account already linked) and is surfaced to the user.

class FinalizeRejected extends Error {}

export async function finalizeKyc(userId: string, pacAccountId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (token) {
    try {
      const res = await fetch(`${config.siteBase}/api/kyc/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pacAccountId }),
      })
      if (res.ok) return
      let msg = ''
      try { msg = ((await res.json()) as { error?: string }).error ?? '' } catch { /* non-JSON */ }
      if (res.status >= 400 && res.status < 500 && res.status !== 404) {
        throw new FinalizeRejected(msg || `Couldn't finalize KYC (${res.status})`)
      }
      console.warn('[kyc] finalize route unavailable, using legacy write:', res.status, msg)
    } catch (e) {
      if (e instanceof FinalizeRejected) throw e
      console.warn('[kyc] finalize route failed, using legacy write:', (e as Error).message)
    }
  }

  const { error } = await supabase.from('profiles')
    .update({ pac_account_id: pacAccountId, kyc_status: 'verified', cacs_status: 'pending', cacs_rejection_reason: null })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}
