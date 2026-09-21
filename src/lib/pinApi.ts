import { supabase } from './supabase'

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; reason: 'no_pin' }
  | { ok: false; reason: 'locked'; lockedUntil: Date }
  // `lockedUntil` is null when the wrong attempt did NOT trigger a lockout
  // (the user still has tries left in the current window of 3).
  | { ok: false; reason: 'wrong';  lockedUntil: Date | null; attempts: number }

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be 6 digits')
  const { error } = await supabase.rpc('set_pin', { new_pin: pin })
  if (error) throw new Error(error.message)
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be 6 digits')
  const { data, error } = await supabase.rpc('verify_pin', { pin })
  if (error) throw new Error(error.message)
  const r = data as { ok: boolean; reason?: string; locked_until?: string; attempts?: number }
  if (r.ok) return { ok: true }
  if (r.reason === 'no_pin') return { ok: false, reason: 'no_pin' }
  if (r.reason === 'locked') return { ok: false, reason: 'locked', lockedUntil: new Date(r.locked_until!) }
  return {
    ok: false,
    reason: 'wrong',
    lockedUntil: r.locked_until ? new Date(r.locked_until) : null,
    attempts: r.attempts ?? 0,
  }
}

// Password re-auth reset. Client verifies the password via
// signInWithPassword. To prevent session hijacking (attacker with device
// access entering a different account's credentials), we capture the
// current user id first and refuse if signInWithPassword ends up returning
// a different user. On mismatch we sign out immediately to avoid leaving
// the app on someone else's session.
export async function resetPinWithPassword(email: string, password: string, newPin: string): Promise<void> {
  if (!/^\d{6}$/.test(newPin)) throw new Error('PIN must be 6 digits')

  const { data: pre } = await supabase.auth.getUser()
  const originalUserId = pre?.user?.id ?? null
  if (!originalUserId) throw new Error('Session expired — please sign in again')

  const { data: signed, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
  if (authErr) {
    throw new Error(authErr.message === 'Invalid login credentials' ? 'Wrong password' : authErr.message)
  }

  if (signed?.user?.id !== originalUserId) {
    // Attacker attempted to swap to a different account. Nuke the impostor
    // session before it can be used, then reject.
    await supabase.auth.signOut().catch(() => {})
    throw new Error('That password is for a different account. PIN not changed.')
  }

  await setPin(newPin)
}
