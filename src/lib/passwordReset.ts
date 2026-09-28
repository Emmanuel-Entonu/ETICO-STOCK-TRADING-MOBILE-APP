import { config } from './config'

// In-app OTP password reset (no Supabase magic-link redirect). Talks to the
// proxy /api/password-reset, which mirrors the web server actions over the
// shared password_reset_otps table. See Moneta-stock trading Demo/api/password-reset.ts.

// Emails a 6-digit code. Resolves { registered: false } when no ETICO account
// uses the email (the reset screen says so instead of pretending a code went
// out). Throws only on a network failure.
export async function requestPasswordOtp(email: string): Promise<{ registered: boolean }> {
  const res = await fetch(`${config.proxyBase}/api/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request', email }),
  })
  if (res.status === 404) return { registered: false }
  if (!res.ok) {
    let msg = ''
    try { msg = ((await res.json()) as { error?: string }).error ?? '' } catch { /* non-JSON */ }
    throw new Error(msg || `Couldn't send the code (${res.status})`)
  }
  return { registered: true }
}

// Verifies the code and sets the new password. Throws with a readable message on failure.
export async function resetPasswordWithOtp(email: string, code: string, password: string): Promise<void> {
  const res = await fetch(`${config.proxyBase}/api/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', email, code, password }),
  })
  let j: { ok?: boolean; error?: string } = {}
  try { j = await res.json() } catch { /* keep default */ }
  if (!res.ok || !j.ok) throw new Error(j.error ?? `Couldn't reset your password (${res.status})`)
}
