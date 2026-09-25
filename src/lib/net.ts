// Resilient fetch for backend calls.
//
//  • Timeout on every request (a hung upstream can't leave a spinner forever).
//  • Retries ONLY idempotent reads (GET/HEAD) on network errors, 5xx and 429,
//    with exponential backoff + full jitter so thousands of clients recovering
//    from the same blip don't retry in lock-step (thundering herd). A server
//    Retry-After is honoured (capped). Writes are never retried — a timed-out
//    order must not be placed twice.

const DEFAULT_TIMEOUT_MS = 15_000
const BASE_DELAY_MS = 400
const MAX_DELAY_MS = 8_000

type Opts = { timeoutMs?: number; retries?: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoff(attempt: number, retryAfterHeader: string | null): number {
  const ra = Number(retryAfterHeader)
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, MAX_DELAY_MS)
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
  return Math.random() * cap // full jitter
}

export async function resilientFetch(url: string, init: RequestInit = {}, opts: Opts = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  const retries = idempotent ? (opts.retries ?? 2) : 0
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(timer)
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        await sleep(backoff(attempt, res.headers.get('retry-after')))
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      const timedOut = (e as Error)?.name === 'AbortError'
      if (attempt < retries) { await sleep(backoff(attempt, null)); continue }
      throw new Error(timedOut ? 'The server took too long to respond. Check your connection and try again.' : (e as Error).message)
    }
  }
}
