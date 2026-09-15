const BASE = 'https://moneta-app-ten.vercel.app'
const MARKET_CODE = 'NGX'
const TRACKED = ['DANGCEM', 'GTCO', 'ZENITHBANK', 'MTNN', 'AIRTELAFRI', 'FBNH', 'BUACEMENT', 'ACCESS', 'NESTLE', 'SEPLAT']

async function mdsGet(path) {
  const url = `${BASE}/api/mds-proxy?path=${encodeURIComponent(path)}`
  console.log('FETCH →', url.slice(0, 90))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MDS ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  console.log('--- top-gainers ---')
  const g = await mdsGet(`/api/v1/price/top-gainers?marketCode=${MARKET_CODE}`)
  console.log('shape:', Array.isArray(g) ? `array[${g.length}]` : Object.keys(g).slice(0, 5))
  console.log('sample:', JSON.stringify(g[0] || g).slice(0, 200))

  console.log('\n--- quote for DANGCEM ---')
  const q = await mdsGet(`/api/v1/price/quote?marketCode=${MARKET_CODE}&secId=DANGCEM`)
  console.log('shape:', Array.isArray(q) ? `array[${q.length}]` : Object.keys(q).slice(0, 5))
  console.log('sample:', JSON.stringify(q).slice(0, 200))
}

main().catch(e => console.error('FAILED:', e.message))
