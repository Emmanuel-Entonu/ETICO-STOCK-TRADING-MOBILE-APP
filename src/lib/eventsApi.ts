import { config } from './config'
import { supabase } from './supabase'

// Events (IPOs and future offers) + the user's subscriptions.
//
// Reads go straight to Supabase (RLS: events are readable by signed-in users,
// subscriptions only by their owner). Paying goes through the proxy's
// moneta-va `ipo-subscribe` action, which prices the order on the server,
// enforces the per-user limit, reserves the wallet money atomically and moves
// it VA-to-VA to the event's collection account. The client only sends the
// share count.

export interface AppEvent {
  id: string
  kind: 'ipo'
  title: string
  issuer: string | null
  summary: string | null
  logo_url: string | null
  unit_price_kobo: number
  /** 1,000,000 or more = no cap (see hasCap). */
  max_units_per_user: number
  /** Smallest purchase, and purchases must be a multiple of unit_step. */
  min_units?: number
  unit_step?: number
  opens_at: string | null
  closes_at: string | null
  status: 'upcoming' | 'open' | 'closed'
  docs: Array<{ title: string; url: string }>
  /** Payments can only start once the collection account exists. */
  collection_va_number: string | null
}

export interface EventSubscription {
  id: string
  event_id: string
  units: number
  unit_price_kobo: number
  amount_kobo: number
  status: 'processing' | 'paid' | 'failed'
  failure_reason: string | null
  created_at: string
}

export const unitPrice = (e: AppEvent) => e.unit_price_kobo / 100
/** Exact naira total for `units` (integer kobo maths, same as the server). */
export const totalFor = (e: AppEvent, units: number) => (Math.max(0, Math.floor(units)) * e.unit_price_kobo) / 100

export function isOpen(e: AppEvent, now = Date.now()): boolean {
  if (e.status !== 'open') return false
  if (e.opens_at && now < Date.parse(e.opens_at)) return false
  if (e.closes_at && now > Date.parse(e.closes_at)) return false
  return true
}

/** Shares already bought or in progress (these count toward the limit). */
export const unitsHeld = (subs: EventSubscription[]) =>
  subs.filter((s) => s.status !== 'failed').reduce((n, s) => n + s.units, 0)

// Lot rules. The server enforces the same (event_subscribe RPC).
export const NO_CAP = 1_000_000
export const hasCap = (e: AppEvent) => e.max_units_per_user < NO_CAP
export const lotStep = (e: AppEvent) => Math.max(1, e.unit_step ?? 1)
/** Smallest valid purchase: at least min_units, rounded up to a multiple of the step. */
export const lotMin = (e: AppEvent) => {
  const step = lotStep(e)
  return Math.ceil(Math.max(1, e.min_units ?? 1) / step) * step
}
/** Largest valid purchase left under the cap (NO_CAP when uncapped), in whole steps. */
export const lotMax = (e: AppEvent, held: number) => {
  const step = lotStep(e)
  const room = hasCap(e) ? Math.max(0, e.max_units_per_user - held) : NO_CAP
  return Math.floor(room / step) * step
}
/** True when no valid purchase is left (only possible with a cap). */
export const capReached = (e: AppEvent, held: number) => hasCap(e) && lotMax(e, held) < lotMin(e)

const EVENT_COLS = 'id, kind, title, issuer, summary, logo_url, unit_price_kobo, max_units_per_user, opens_at, closes_at, status, docs, collection_va_number'

export async function fetchEvents(): Promise<AppEvent[]> {
  const full = await supabase
    .from('events')
    .select(`${EVENT_COLS}, min_units, unit_step`)
    .order('sort', { ascending: true })
  if (!full.error) return (full.data ?? []) as AppEvent[]
  // Lot columns not added yet (SQL not run): load without them (lots of 1).
  if (!/min_units|unit_step/.test(full.error.message)) throw new Error(full.error.message)
  const basic = await supabase.from('events').select(EVENT_COLS).order('sort', { ascending: true })
  if (basic.error) throw new Error(basic.error.message)
  return (basic.data ?? []) as AppEvent[]
}

export async function fetchMySubscriptions(eventId?: string): Promise<EventSubscription[]> {
  let q = supabase
    .from('event_subscriptions')
    .select('id, event_id, units, unit_price_kobo, amount_kobo, status, failure_reason, created_at')
    .order('created_at', { ascending: false })
  if (eventId) q = q.eq('event_id', eventId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as EventSubscription[]
}

async function callIpo<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in again.')
  const res = await fetch(`${config.proxyBase}/api/moneta-va`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(text) } catch { /* handled below */ }
  if (!res.ok) throw new Error(String(json.error ?? `Couldn't complete that (${res.status}).`))
  return json as T
}

export interface SubscribeResult {
  status: 'paid' | 'failed' | 'processing'
  id: string
  units: number
  amount: number
  message?: string
}

/** Subscribe for `units` shares. Throws a user-readable message when refused. */
export function subscribe(eventId: string, units: number): Promise<SubscribeResult> {
  return callIpo<SubscribeResult>({ action: 'ipo-subscribe', event_id: eventId, units })
}

/** Current state of one of the user's subscriptions (resolves 'processing'). */
export function subscriptionStatus(id: string): Promise<{ id: string; status: SubscribeResult['status']; units: number; amount: number; event_id: string }> {
  return callIpo({ action: 'ipo-status', id })
}
