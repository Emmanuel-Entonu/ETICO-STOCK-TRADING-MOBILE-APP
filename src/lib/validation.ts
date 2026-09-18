// Central input validation + sanitization.
// Every user-input surface must run values through these before display,
// storage, or transmission. Rules chosen for Nigerian financial context.

export type ValidResult<T> = { ok: true; value: T } | { ok: false; error: string }

// ---- Primitive normalizers ----

/** Trim + collapse internal whitespace + cap length. Never returns undefined. */
export function normalizeText(v: unknown, max = 255): string {
  if (typeof v !== 'string') return ''
  return v.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Digits only, then cap length. */
export function normalizeDigits(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return ''
  return String(v).replace(/\D+/g, '').slice(0, max)
}

/** Alphanumeric + a few allowed chars (for ID numbers, ref codes, etc). */
export function normalizeAlphaNum(v: unknown, max = 50, extra = '-/'): string {
  if (typeof v !== 'string') return ''
  const re = new RegExp(`[^a-zA-Z0-9${extra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g')
  return v.replace(re, '').trim().slice(0, max)
}

// ---- Field validators ----

export function validateEmail(raw: string): ValidResult<string> {
  const v = normalizeText(raw, 254).toLowerCase()
  if (!v) return { ok: false, error: 'Email is required' }
  // Deliberately loose but catches obvious garbage. Server does the real check.
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) {
    return { ok: false, error: 'Enter a valid email address' }
  }
  return { ok: true, value: v }
}

// Individual password requirements — drives the live checklist + strength meter
// on the sign-up screen, and the same rules gate validatePassword below.
export interface PasswordRules {
  length: boolean   // ≥ 8 characters
  number: boolean   // ≥ 1 digit
  lower: boolean    // ≥ 1 lowercase letter
  upper: boolean    // ≥ 1 uppercase letter
  special: boolean  // ≥ 1 non-alphanumeric
}

export function passwordRules(raw: string): PasswordRules {
  const s = typeof raw === 'string' ? raw : ''
  return {
    length: s.length >= 8,
    number: /\d/.test(s),
    lower:  /[a-z]/.test(s),
    upper:  /[A-Z]/.test(s),
    special: /[^A-Za-z0-9]/.test(s),
  }
}

/** 0–5: how many requirements the password satisfies. */
export function passwordScore(raw: string): number {
  const r = passwordRules(raw)
  return [r.length, r.number, r.lower, r.upper, r.special].filter(Boolean).length
}

export function validatePassword(raw: string): ValidResult<string> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: 'Password is required' }
  }
  if (raw.length > 72) return { ok: false, error: 'Password is too long (max 72 characters)' }
  const r = passwordRules(raw)
  if (!r.length || !r.number || !r.lower || !r.upper || !r.special) {
    return { ok: false, error: 'Password must be 8+ characters with an uppercase, lowercase, number and special character' }
  }
  return { ok: true, value: raw }
}

export function validateFullName(raw: string): ValidResult<string> {
  const v = normalizeText(raw, 100)
  if (v.length < 2) return { ok: false, error: 'Enter your full name' }
  if (v.split(' ').filter(Boolean).length < 2) {
    return { ok: false, error: 'Please include first and last name' }
  }
  // Names can contain letters, spaces, hyphens, apostrophes, dots. Reject anything else.
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.\-]{1,99}$/.test(v)) {
    return { ok: false, error: 'Name contains invalid characters' }
  }
  return { ok: true, value: v }
}

export function validateBvn(raw: string): ValidResult<string> {
  const v = normalizeDigits(raw, 11)
  if (v.length !== 11) return { ok: false, error: 'BVN must be exactly 11 digits' }
  return { ok: true, value: v }
}

export function validateNin(raw: string): ValidResult<string> {
  const v = normalizeDigits(raw, 11)
  if (v.length !== 11) return { ok: false, error: 'NIN must be exactly 11 digits' }
  return { ok: true, value: v }
}

export function validateOtp(raw: string, len = 6): ValidResult<string> {
  const v = normalizeDigits(raw, len)
  if (v.length !== len) return { ok: false, error: `Enter the ${len}-digit code` }
  return { ok: true, value: v }
}

/** Nigerian mobile: 11 digits starting with 0, or 13 starting with +234 → normalized to 11-digit local. */
export function validateNigerianPhone(raw: string): ValidResult<string> {
  const digits = normalizeDigits(raw, 15)
  let local = digits
  if (digits.startsWith('234') && digits.length >= 13) local = '0' + digits.slice(3)
  if (local.length !== 11) return { ok: false, error: 'Enter a valid Nigerian phone number (11 digits)' }
  if (!/^0[789][01]\d{8}$/.test(local)) {
    return { ok: false, error: 'Phone number does not look valid' }
  }
  return { ok: true, value: local }
}

/** Date of birth in YYYY-MM-DD, age between 18 and 100. */
export function validateDob(raw: string): ValidResult<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: 'Date must be YYYY-MM-DD' }
  }
  const d = new Date(raw)
  if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date' }
  const age = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  if (age < 18) return { ok: false, error: 'You must be at least 18 years old' }
  if (age > 100) return { ok: false, error: 'Enter a valid date of birth' }
  return { ok: true, value: raw }
}

export function validateAddress(raw: string): ValidResult<string> {
  const v = normalizeText(raw, 255)
  if (v.length < 5) return { ok: false, error: 'Enter a full address' }
  return { ok: true, value: v }
}

export function validateIdNumber(raw: string): ValidResult<string> {
  const v = normalizeAlphaNum(raw, 50)
  if (v.length < 4) return { ok: false, error: 'ID number is too short' }
  return { ok: true, value: v }
}

const NGX_SYMBOL = /^[A-Z][A-Z0-9]{1,14}$/
export function validateSymbol(raw: string): ValidResult<string> {
  const v = normalizeAlphaNum(raw, 15).toUpperCase()
  if (!NGX_SYMBOL.test(v)) return { ok: false, error: 'Invalid stock symbol' }
  return { ok: true, value: v }
}

/** Positive integer for quantity. Max = 10M shares (protects against typos). */
export function validateQuantity(raw: string | number, max = 10_000_000): ValidResult<number> {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^\d]/g, ''), 10)
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter a quantity' }
  if (!Number.isInteger(n)) return { ok: false, error: 'Quantity must be a whole number' }
  if (n <= 0) return { ok: false, error: 'Quantity must be at least 1' }
  if (n > max) return { ok: false, error: `Quantity exceeds maximum (${max.toLocaleString()})` }
  return { ok: true, value: n }
}

/** Positive decimal price. Max 2 decimal places. Range guards protect against typos. */
export function validatePrice(raw: string | number, opts?: { min?: number; max?: number }): ValidResult<number> {
  const min = opts?.min ?? 0.01
  const max = opts?.max ?? 1_000_000
  const s = String(raw).trim()
  if (!s) return { ok: false, error: 'Enter a price' }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Price must be a number with up to 2 decimals' }
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return { ok: false, error: 'Invalid price' }
  if (n < min) return { ok: false, error: `Price must be at least ₦${min}` }
  if (n > max) return { ok: false, error: `Price exceeds ceiling (₦${max.toLocaleString()})` }
  return { ok: true, value: Number(n.toFixed(2)) }
}

/** Positive naira amount for wallet funding. Range 100 – 10M. */
export function validateNairaAmount(raw: string | number, opts?: { min?: number; max?: number }): ValidResult<number> {
  const min = opts?.min ?? 100
  const max = opts?.max ?? 10_000_000
  return validatePrice(raw, { min, max })
}

// ---- Composite validators (return first error) ----

export function firstError(...results: ValidResult<unknown>[]): string | null {
  for (const r of results) if (!r.ok) return r.error
  return null
}
