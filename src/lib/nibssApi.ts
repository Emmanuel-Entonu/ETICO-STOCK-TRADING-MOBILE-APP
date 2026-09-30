import { config } from './config'
import { supabase } from './supabase'

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface BvnInitResult {
  otpRequired: true
  reference: string
  maskedPhone: string
}

export interface BvnProfile {
  firstName:     string
  middleName:    string
  surname:       string
  dob:           string
  gender:        string
  phone:         string
  address:       string
  nin:           string
  maritalStatus: string
  nationality:   string
  stateOfOrigin: string
  lgaOfOrigin:   string
  title:         string
}

// Pull YYYY-MM-DD straight off the string. Using `new Date(...).toISOString()`
// shifts the calendar day when the source has a +01:00 offset (WAT), which is
// why DOBs came back one day early. Fall back to Date only for odd formats.
function toDateOnly(raw: string): string {
  if (!raw) return ''
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(raw)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

export async function initiateBvn(bvn: string): Promise<BvnInitResult> {
  const res = await fetch(`${config.proxyBase}/api/nibss-bvn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action: 'query', bvn }),
  })
  const raw = await res.json() as Record<string, unknown>
  if (!res.ok || !(raw.status === true || raw.status === 'success' || raw.status === 'SUCCESSFUL')) {
    throw new Error(String(raw.message ?? raw.error ?? `BVN query failed (${res.status})`))
  }
  const data = raw.data as Record<string, unknown> | undefined
  const d = (Array.isArray(data) ? data[0] : data ?? raw) as Record<string, unknown>
  const nested = d?.customer as Record<string, unknown> | undefined
  const reference = String(
    d?.customer_reference ?? d?.customerReference ?? d?.reference ?? d?.ref ??
    nested?.customer_reference ?? nested?.customerReference ?? ''
  )
  if (!reference) throw new Error('We couldn’t start BVN verification. Please try again.')
  return {
    otpRequired: true,
    reference,
    maskedPhone: String(d?.maskedPhone ?? d?.masked_phone ?? d?.phoneNumber ?? ''),
  }
}

export async function confirmBvnOtp(reference: string, otp: string): Promise<BvnProfile> {
  const res = await fetch(`${config.proxyBase}/api/nibss-bvn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action: 'verify-otp', reference, otp }),
  })
  const raw = await res.json() as Record<string, unknown>
  if (!res.ok || !(raw.status === true || raw.status === 'success' || raw.status === 'SUCCESSFUL')) {
    throw new Error(String(raw.message ?? raw.error ?? `OTP verification failed (${res.status})`))
  }
  const rawData = raw.data ?? raw
  const d = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, unknown>
  const str = (v: unknown) => (v ? String(v).trim() : '')
  const firstName  = str(d.first_name  ?? d.firstName)
  const middleName = str(d.middle_name ?? d.middleName)
  const surname    = str(d.surname     ?? d.last_name ?? d.lastName)
  const rawDob     = str(d.DateOfBirth ?? d.date_of_birth ?? d.dob)
  // NIBSS BVN records do NOT include a residential address. Only use a genuine
  // address field if the provider ever returns one; never fall back to state of
  // origin, or "Plateau State" (the state of origin) wrongly shows as the address.
  const street     = str(d.address ?? d.residential_address ?? d.residentialAddress ?? d.home_address)
  const city       = str(d.city)
  const state      = str(d.state_of_origin ?? d.stateOfOrigin)
  const lga        = str(d.lga_of_origin ?? d.lgaOfOrigin ?? d.lga)
  return {
    firstName:     firstName,
    middleName:    middleName,
    surname:       surname,
    dob:           toDateOnly(rawDob),
    gender:        str(d.gender),
    // NIBSS returns the phone as `Phone_number1` (with `Phone_number2` as a
    // secondary); older mocks used phoneNumber/phone. Check them all.
    phone:         str(d.Phone_number1 ?? d.phone_number1 ?? d.phoneNumber ?? d.phone ?? d.phone_number ?? d.Phone_number2),
    // Only a real street/city address, never the state of origin. Empty here
    // means the KYC screen leaves the address blank for the user to fill in.
    address:       [street, city].filter(Boolean).join(', '),
    // Moneta now returns the NIN as `customer_id` (it used to be `nin`).
    nin:           [d.nin, d.NIN, d.nin_number, d.national_identity_number, d.customer_id].map(str).find((v) => /^\d{11}$/.test(v)) ?? '',
    maritalStatus: str(d.marital_status ?? d.maritalStatus),
    nationality:   str(d.nationality),
    stateOfOrigin: state,
    lgaOfOrigin:   lga,
    title:         str(d.title),
  }
}
