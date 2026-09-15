const BASE = 'https://moneta-app-ten.vercel.app'
const MARKET_CODE = 'NGX'
const TRACKED = ['DANGCEM', 'GTCO', 'ZENITHBANK', 'MTNN', 'AIRTELAFRI', 'FBNH', 'BUACEMENT', 'ACCESS', 'NESTLE', 'SEPLAT']

async function mdsGet(path) {
  const res = await fetch(`${BASE}/api/mds-proxy?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`MDS ${res.status}: ${await res.text()}`)
  return res.json()
}

function unwrapList(raw) {
  if (Array.isArray(raw)) return raw
  const list = raw?.data ?? raw?.result ?? raw?.items ?? []
  return Array.isArray(list) ? list : []
}

function normalizeMover(d) {
  const sym    = String(d.secId ?? d.symbol ?? '')
  const price  = Number(d.lastPx ?? d.close ?? d.price ?? 0)
  const open   = Number(d.open ?? 0)
  const pct    = Number(d.percChange ?? d.changePercent ?? 0)
  return {
    symbol: sym,
    name:   String(d.securityName ?? d.name ?? sym),
    price,
    change: open > 0 ? price - open : 0,
    changePercent: pct,
    volume: Number(d.volTraded ?? d.volume ?? 0),
    high: Number(d.high ?? 0),
    low: Number(d.low ?? 0),
    open,
  }
}

async function main() {
  const [gainers, losers, active] = await Promise.allSettled([
    mdsGet(`/api/v1/price/top-gainers?marketCode=${MARKET_CODE}`),
    mdsGet(`/api/v1/price/top-losers?marketCode=${MARKET_CODE}`),
    mdsGet(`/api/v1/price/most-active?marketCode=${MARKET_CODE}`),
  ])

  const results = { gainers, losers, active }
  for (const [name, r] of Object.entries(results)) {
    if (r.status === 'fulfilled') {
      const list = unwrapList(r.value)
      console.log(`${name}: OK, unwrapped ${list.length} items`)
      if (list.length > 0) {
        const n = normalizeMover(list[0])
        console.log(`  first normalized: symbol="${n.symbol}" price=${n.price} pct=${n.changePercent}`)
      }
    } else {
      console.log(`${name}: FAILED - ${r.reason.message}`)
    }
  }
}

main().catch(e => console.error('CRASH:', e))
