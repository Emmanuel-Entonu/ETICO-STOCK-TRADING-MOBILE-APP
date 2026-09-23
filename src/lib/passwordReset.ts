import { config } from './config'

// In-app OTP password reset (no Supabase magic-link redirect). Talks to the
// proxy /api/password-reset, which mirrors the web server actions over the
// shared password_reset_otps table. See Moneta-stock trading Demo/api/password-reset.ts.

// Emails a 6-digit code. Always resolves (never reveals whether the email exists).
export async function requestPasswordOtp(email: string): Promise<void> {
  try {
    await fetch(`${config.proxyBase}/api/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request', email }),
    })
  } catch {
    // Silent — the user is told "if that email exists, a code was sent".
  }
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
