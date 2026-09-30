import { config } from './config'
import { supabase } from './supabase'
import { resilientFetch } from './net'
import { ETHICAL_TICKERS } from './ethicalTickers'

// Every proxy call must carry the caller's Supabase JWT so the Vercel
// endpoint can enforce auth (see api/_auth.ts). Without this, our proxy
// becomes a public relay for the master PAC / MDS credentials.
async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const MARKET_CODE = 'NGX'

// Full NGX universe we track. Aligned with Niqra-web's tracked-symbols list
// so both apps quote the same tickers. Every symbol here gets a per-symbol
// quote fetch (via getMarketData's withConcurrency limiter). Missing or
// delisted tickers just fail their individual promise and the rest still
// land — safe to keep this list generous.
//
// Substitutions merged in from prior audits:
//   ACCESS       → ACCESSCORP     STERLNBANK   → STERLINGNG
//   AXAMANSARD   → MANSARD        NEMINS       → NEM
//   CCNN         → BUACEMENT      PORTLAND     → CAP
//   VONO         → VITAFOAM       INITSPLC     → TIP
//   CORONATION   → WAPIC          LAWUNION     → TANGERINE
//   MUTUALBEN    → MBENEFIT       CAPHOTEL     → TOURIST
//   UBN          → UNIONBNK       FBNH         ↔ FIRSTHOLDCO
//   MEDIAVISN, DANGFLOUR, GLAXOSMITH, IPWA, BRICNET, COURTVILLE — dropped
//   (delisted or 404 in MDS security master)
const TRACKED_SYMBOLS = Array.from(ETHICAL_TICKERS) // strictly ethical, cut from ~150

// A few tracked tickers trade under a different code in the MDS/PAC security
// master than the display ticker (the plain code 404s as "Security not found").
// Map display symbol -> feed code; the UI keeps showing the display symbol.
const MDS_SYMBOL_ALIAS: Record<string, string> = {
  SAHCO:     'SKYAVN',   // Skyway Aviation Handling Company
  UHOMEREIT: 'UHOMREIT', // Union Homes REIT
  HBMN:      'WAPCO',    // Lafarge Africa (WAPCO)
}
const mdsCode = (symbol: string): string => MDS_SYMBOL_ALIAS[symbol.toUpperCase()] ?? symbol

// Names for common tickers — nice-to-have. Anything not here falls back to
// the symbol itself; the MDS API often supplies the security name in the
// mover payloads too, which normalizeMover already picks up.
const SECURITY_NAMES: Record<string, string> = {
  ACCESSCORP:   'Access Holdings Plc',
  AIICO:        'AIICO Insurance Plc',
  AIRTELAFRI:   'Airtel Africa Plc',
  ARDOVA:       'Ardova Plc',
  AUSTINLAZ:    'Austin Laz & Company Plc',
  BAPLC:        'Briclinks Africa Plc',
  BERGER:       'Berger Paints Nigeria Plc',
  BETAGLAS:     'Beta Glass Plc',
  BUACEMENT:    'BUA Cement Plc',
  BUAFOODS:     'BUA Foods Plc',
  CADBURY:      'Cadbury Nigeria Plc',
  CAP:          'Chemical & Allied Products Plc',
  CCNN:         'Cement Company of Northern Nigeria Plc',
  CHAMPION:     'Champion Breweries Plc',
  CHAMS:        'Chams Holding Co. Plc',
  CILEASING:    'C & I Leasing Plc',
  CONOIL:       'Conoil Plc',
  CONTINSURE:   'Continental Reinsurance Plc',
  CORNERST:     'Cornerstone Insurance Plc',
  CUTIX:        'Cutix Plc',
  DAARCOMM:     'Daar Communications Plc',
  DANGCEM:      'Dangote Cement Plc',
  DANGSUGAR:    'Dangote Sugar Refinery Plc',
  EKOCORP:      'Ekocorp Plc',
  ELLAHLAKES:   'Ellah Lakes Plc',
  ETERNA:       'Eterna Plc',
  ETI:          'Ecobank Transnational Inc.',
  FBNH:         'FBN Holdings Plc',
  FCMB:         'FCMB Group Plc',
  FIDELITYBK:   'Fidelity Bank Plc',
  FIDSON:       'Fidson Healthcare Plc',
  FLOURMILL:    'Flour Mills of Nigeria Plc',
  FTNCOCOA:     'FTN Cocoa Processors Plc',
  GLAXOSMITH:   'GlaxoSmithKline Consumer Nigeria Plc',
  GTCO:         'GT Holding Company Plc',
  GUINNESS:     'Guinness Nigeria Plc',
  HONYFLOUR:    'Honeywell Flour Mills Plc',
  INTBREW:      'International Breweries Plc',
  JAIZBANK:     'Jaiz Bank Plc',
  JAPAULGOLD:   'Japaul Gold & Ventures Plc',
  JOHNHOLT:     'John Holt Plc',
  JULIUS:       'Julius Berger Nigeria Plc',
  LASACO:       'Lasaco Assurance Plc',
  LAWUNION:     'Law Union & Rock Insurance Plc',
  LEARNAFRCA:   'Learn Africa Plc',
  LINKASSURE:   'Linkage Assurance Plc',
  LIVESTOCK:    'Livestock Feeds Plc',
  MANSARD:      'AXA Mansard Insurance Plc',
  MAYBAKER:     'May & Baker Nigeria Plc',
  MEYER:        'Meyer Plc',
  MORISON:      'Morison Industries Plc',
  MRS:          'MRS Oil Nigeria Plc',
  MTNN:         'MTN Nigeria Communications Plc',
  MUTUALBEN:    'Mutual Benefits Assurance Plc',
  NASCON:       'NASCON Allied Industries Plc',
  NB:           'Nigerian Breweries Plc',
  NCR:          'NCR (Nigeria) Plc',
  NEIMETH:      'Neimeth International Pharmaceuticals Plc',
  NEM:          'NEM Insurance Plc',
  NESTLE:       'Nestle Nigeria Plc',
  NGL:          'Niger Insurance Plc',
  OANDO:        'Oando Plc',
  OKOMUOIL:     'Okomu Oil Palm Plc',
  OMATEK:       'Omatek Ventures Plc',
  PHARMDEKO:    'Pharma Deko Plc',
  PORTLAND:     'Lafarge Africa Plc',
  PRESCO:       'Presco Plc',
  PRESTIGE:     'Prestige Assurance Plc',
  PZ:           'PZ Cussons Nigeria Plc',
  ROYALEX:      'Royal Exchange Plc',
  SEPLAT:       'Seplat Energy Plc',
  SOVRENINS:    'Sovereign Trust Insurance Plc',
  STANBIC:      'Stanbic IBTC Holdings Plc',
  STERLNBANK:   'Sterling Financial Holdings Company Plc',
  TOTAL:        'TotalEnergies Marketing Nigeria Plc',
  TRANSCOHOT:   'Transcorp Hotels Plc',
  TRANSCORP:    'Transnational Corporation Plc',
  TRANSPOWER:   'Transcorp Power Plc',
  UACN:         'UAC of Nigeria Plc',
  UBA:          'United Bank for Africa Plc',
  UBN:          'Union Bank of Nigeria Plc',
  UNILEVER:     'Unilever Nigeria Plc',
  UNITYBNK:     'Unity Bank Plc',
  UPDC:         'UPDC Real Estate Investment Trust',
  VERITASKAP:   'Veritas Kapital Assurance Plc',
  VITAFOAM:     'Vitafoam Nigeria Plc',
  WAPCO:        'Lafarge Africa Plc',
  WAPIC:        'Wapic Insurance Plc',
  WEMABANK:     'Wema Bank Plc',
  ZENITHBANK:   'Zenith Bank Plc',
  // Aliased-code securities (traded under a different MDS code):
  SAHCO:        'Skyway Aviation Handling Company Plc',
  UHOMEREIT:    'Union Homes Real Estate Investment Trust Plc',
}

// Robust JSON parse: some RN fetch builds return empty from res.json() even when
// the body is valid JSON. Reading as text first + JSON.parse is more reliable.
async function readJson(res: Response, label: string): Promise<unknown> {
  const text = await res.text()
  if (!text) throw new Error(`${label}: empty response body`)
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${label}: JSON parse failed, first 200 chars: ${text.slice(0, 200)}`)
  }
}

async function pacProxy<T>(path: string, method = 'GET', body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const url = `${config.proxyBase}/api/pac-proxy?path=${encodeURIComponent(path)}`
  const isGet = method === 'GET' || method === 'HEAD'
  // Timeout on every call; GETs retry transient failures with jittered backoff.
  // Writes (orders, cancels) are never retried.
  const res = await resilientFetch(url, {
    method,
    headers: {
      'Accept': 'application/json',
      ...(!isGet ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeader()),
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Broker ${res.status}: ${await res.text()}`)
  return readJson(res, `broker ${path.split('?')[0]}`) as Promise<T>
}

async function mdsGet<T>(path: string): Promise<T> {
  // Public market data: NO Authorization header, so every user shares the
  // same Vercel CDN-cached response (the proxy sets s-maxage per endpoint).
  const res = await resilientFetch(`${config.proxyBase}/api/mds-proxy?path=${encodeURIComponent(path)}`, {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`MDS ${res.status}: ${await res.text()}`)
  return readJson(res, `mds ${path.split('?')[0]}`) as Promise<T>
}

const brokerGet   = <T>(p: string) => pacProxy<T>(p, 'GET')
const brokerPost  = <T>(p: string, body: unknown, h?: Record<string, string>) => pacProxy<T>(p, 'POST', body, h)
const brokerPatch = <T>(p: string, body?: unknown) => pacProxy<T>(p, 'PATCH', body)

export interface PacMarketData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
}

export interface PacPosition {
  symbol: string
  securityName: string
  quantity: number
  averageCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
}

export interface PacAccount {
  id: string
  accountNumber: string
  accountName: string
  balance: number
  currency: string
  status: string
  subAccountId?: string
}

export interface PacOrderRequest {
  accountId: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  orderType: 'MARKET' | 'LIMIT'
  limitPrice?: number
  estimatedTotal?: number
}

export interface PacOrderResponse {
  id?: string
  orderId?: string
  orderNo?: string
  orderStatus?: string
  routingStatus?: string
  routingMessage?: string
  status?: string
  message?: string
  totalValue?: number
}

export interface PacOrderListItem {
  id: string
  orderNo: string
  secId: string
  side: 'BUY' | 'SELL'
  orderStatus: string
  routingStatus: string
  routingMessage?: string
  requestedQty: number
  filledQty: number
  limitPrice?: number
  consideration: number
  commission: number
  fees: number
  totalValue: number
  accountId: string
  createdAt: string
  updatedAt: string
  currency: string
  marketCode: string
  deleted: boolean
}

interface MdsPriceQuote {
  marketCode: string
  secId: string
  open: number
  high: number
  low: number
  close: number
  lastPx: number
  volTraded: number
  percChange: number
}

interface MdsMover {
  secId?: string
  symbol?: string
  securityName?: string
  name?: string
  lastPx?: number
  close?: number
  price?: number
  open?: number
  high?: number
  low?: number
  volTraded?: number
  volume?: number
  percChange?: number
  changePercent?: number
}

async function getPriceQuote(secId: string): Promise<PacMarketData> {
  const raw = await mdsGet<unknown>(`/api/v1/price/quote?marketCode=${MARKET_CODE}&secId=${mdsCode(secId)}`)
  const r = raw as Record<string, unknown>
  const inner = r?.data ?? r?.result ?? raw
  const d = (Array.isArray(inner) ? inner[0] : inner) as MdsPriceQuote
  const q = normalizePriceQuote(d)
  // Keep the display ticker + name even when the quote was fetched via an alias.
  q.symbol = secId
  q.name = SECURITY_NAMES[secId] ?? q.name
  return q
}

// Simple concurrency limiter — runs the tasks in fixed-size waves so we
// don't blast 135 requests at the proxy at once (Vercel per-IP burst caps
// + Android OkHttp's ~5-per-host default = later requests queue anyway).
async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<PacMarketData>) {
  const results: PromiseSettledResult<PacMarketData>[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      try { results[i] = { status: 'fulfilled', value: await fn(items[i]) } }
      catch (e) { results[i] = { status: 'rejected', reason: e } }
    }
  })
  await Promise.all(workers)
  return results
}

export async function getMarketData(): Promise<PacMarketData[]> {
  const [quotesSettled, gainersResult, losersResult, activeResult] = await Promise.allSettled([
    withConcurrency(TRACKED_SYMBOLS, 10, getPriceQuote),
    getTopGainers(),
    getTopLosers(),
    getMostActive(),
  ])

  const seen = new Set<string>()
  const all: PacMarketData[] = []

  function add(stocks: PacMarketData[], limit = Infinity) {
    let count = 0
    for (const s of stocks) {
      if (!s.symbol || seen.has(s.symbol) || s.price <= 0) continue
      // Strictly ethical: the gainers/losers/most-active feeds return the WHOLE
      // NGX (banks, insurers, breweries…). Drop anything outside our screened
      // universe so only ethical stocks ever reach the app.
      if (!ETHICAL_TICKERS.has(s.symbol.toUpperCase())) continue
      if (count++ >= limit) break
      seen.add(s.symbol)
      all.push(s)
    }
  }

  if (gainersResult.status === 'fulfilled') add(gainersResult.value, 200)
  if (losersResult.status  === 'fulfilled') add(losersResult.value,  200)
  if (activeResult.status  === 'fulfilled') add(activeResult.value,  200)

  if (quotesSettled.status === 'fulfilled') {
    const quotes = quotesSettled.value
      .filter((r): r is PromiseFulfilledResult<PacMarketData> => r.status === 'fulfilled')
      .map(r => r.value)
    add(quotes)
  }

  if (all.length === 0) {
    const errs: string[] = []
    if (gainersResult.status === 'rejected') errs.push(`gainers: ${(gainersResult.reason as Error).message}`)
    if (losersResult.status  === 'rejected') errs.push(`losers: ${(losersResult.reason as Error).message}`)
    if (activeResult.status  === 'rejected') errs.push(`active: ${(activeResult.reason as Error).message}`)
    if (quotesSettled.status === 'rejected') errs.push(`quotes: ${(quotesSettled.reason as Error).message}`)
    else {
      const failed = quotesSettled.value.filter(r => r.status === 'rejected').length
      if (failed > 0) errs.push(`${failed}/${quotesSettled.value.length} quote fetches failed`)
    }
    throw new Error(errs.length > 0 ? errs.join(' | ') : 'All market data sources returned empty')
  }

  return all.sort((a, b) => {
    const aFlat = a.changePercent === 0
    const bFlat = b.changePercent === 0
    if (aFlat && bFlat) return a.symbol.localeCompare(b.symbol)
    if (aFlat) return 1
    if (bFlat) return -1
    return Math.abs(b.changePercent) - Math.abs(a.changePercent)
  })
}

export const getSecurityData = (symbol: string) => getPriceQuote(symbol)

function unwrapList(raw: unknown): MdsMover[] {
  if (Array.isArray(raw)) return raw as MdsMover[]
  const r = raw as Record<string, unknown>
  const list = r?.data ?? r?.result ?? r?.items ?? []
  return Array.isArray(list) ? list as MdsMover[] : []
}

export async function getTopGainers(): Promise<PacMarketData[]> {
  const raw = await mdsGet<unknown>(`/api/v1/price/top-gainers?marketCode=${MARKET_CODE}`)
  return unwrapList(raw).map(normalizeMover)
}

export async function getTopLosers(): Promise<PacMarketData[]> {
  const raw = await mdsGet<unknown>(`/api/v1/price/top-losers?marketCode=${MARKET_CODE}`)
  return unwrapList(raw).map(normalizeMover)
}

export async function getMostActive(): Promise<PacMarketData[]> {
  const raw = await mdsGet<unknown>(`/api/v1/price/most-active?marketCode=${MARKET_CODE}`)
  return unwrapList(raw).map(normalizeMover)
}

export const getHistoricalPrices = (symbol: string, startDate: string, endDate: string) =>
  mdsGet(`/api/v1/price/history?marketCode=${MARKET_CODE}&secId=${mdsCode(symbol)}&startDate=${startDate}&endDate=${endDate}`)

export const getIndexData = () => mdsGet(`/api/v1/price/index/all/summary`)

export async function getSubAccountBalance(subAccountId: string): Promise<number> {
  const valueDate = new Date().toISOString().split('T')[0]
  const data = await brokerGet<{ amount: number; currency: string }>(
    `/reports/accounting/api/v1/sub-accounts/balance/${subAccountId}?valueDate=${valueDate}`
  )
  return Number(data.amount ?? 0)
}

export async function getAccountById(accountId: string): Promise<PacAccount> {
  const inv = await brokerGet<Record<string, unknown>>(
    `/investing/api/v1/investment/accounts/${accountId}`
  )
  const subAccObj = inv.subAccount as Record<string, unknown> | undefined
  const subAccountId = String(inv.subAccountId ?? inv.subAccId ?? subAccObj?.id ?? '') || undefined
  let balance = Number(inv.cashBalance ?? 0)
  if (subAccountId) {
    try { balance = await getSubAccountBalance(subAccountId) } catch {}
  }
  return {
    id:            String(inv.id ?? accountId),
    accountNumber: String(inv.accountNo ?? ''),
    accountName:   String(inv.accountLabel ?? inv.clientLabel ?? ''),
    balance,
    currency:      String(inv.currency ?? 'NGN'),
    status:        String(inv.status ?? 'ACTIVE'),
    subAccountId,
  }
}

export async function getClientPositions(accountId: string): Promise<PacPosition[]> {
  const valueDate = new Date().toISOString().split('T')[0]
  try {
    const data = await brokerGet<Record<string, unknown>>(
      `/position/api/v1/ledgers/report/trading/account/${accountId}?valueDate=${valueDate}&currency=NGN`
    )
    const list = (data as { positionInstruments?: unknown[]; positions?: unknown[]; data?: unknown[] }).positionInstruments
      ?? (data as { positions?: unknown[] }).positions
      ?? (data as { data?: unknown[] }).data
      ?? (Array.isArray(data) ? data : [])
    return (list as unknown[]).map(normalizePosition)
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) return []
    throw e
  }
}

export async function placeOrder(order: PacOrderRequest, idempotencyKey?: string): Promise<PacOrderResponse> {
  const body = {
    accountId:    order.accountId,
    secId:        mdsCode(order.symbol),
    side:         order.side,
    requestedQty: order.quantity,
    tif:          'DAY',
    marketCode:   'NGX',
    currency:     'NGN',
    numberOfLegs: 1,
    assetType:    'EQUITY',
    allOrNone:    false,
    autoApprove:  true,
    channel:      'MOBILE',
    ...(order.orderType === 'LIMIT' && order.limitPrice ? { limitPrice: order.limitPrice } : {}),
  }
  const idempotencyId = idempotencyKey ?? generateUuid()
  return brokerPost('/investing/api/v1/orders', body, { 'x-idempotency-id': idempotencyId })
}

export const cancelOrder = (pacOrderId: string) =>
  brokerPatch<PacOrderResponse>(`/investing/api/v1/orders/cancel/${pacOrderId}`)

// ── Cash transactions (funding the PAC investment account) ──────────────────
// The user funds their Moneta wallet (VA); to give them buying power we mirror
// that into their PAC account with a DEPOSIT cash transaction, then post it to
// the ledger. The company float with PAC is reconciled/settled EOD.
//   1. create  -> POST /investing/api/v1/cash_transactions   (returns recordId)
//   2. post    -> PATCH /investing/api/v1/cash_transactions/post/{recordId}
// tenant + PAC auth are injected by the pac-proxy; branchId is our NGX branch.
const BRANCH_ID = 'b94b25a0-6546-49a5-8ee6-87046b9d602f'

export type CashTxnType = 'DEPOSIT' | 'PAYMENT'

interface CashTxnResponse { id?: string; recordId?: string }

// Create a DEPOSIT (fund) or PAYMENT (withdraw) cash transaction. Returns the
// new record id. Does NOT post it — call postCashTransaction next.
export async function createCashTransaction(params: {
  accountId: string
  amount: number
  type?: CashTxnType
  reference: string
  idempotencyKey?: string
}): Promise<string> {
  const body = {
    accountId:   params.accountId,
    branchId:    BRANCH_ID,
    type:        params.type ?? 'DEPOSIT',
    amount:      params.amount,
    currency:    'NGN',
    channel:     'API',
    reference:   params.reference,
    valueDate:   new Date().toISOString().split('T')[0],
    autoApprove: true,
  }
  const key = params.idempotencyKey ?? generateUuid()
  const res = await brokerPost<CashTxnResponse>(
    '/investing/api/v1/cash_transactions',
    body,
    { 'x-idempotency-id': key },
  )
  const id = res.id ?? res.recordId
  if (!id) throw new Error('Cash transaction created but no record id returned')
  return id
}

// Post a cash transaction to the general ledger (makes the funds effective).
export const postCashTransaction = (recordId: string) =>
  brokerPatch(`/investing/api/v1/cash_transactions/post/${recordId}`)

// Convenience: create a DEPOSIT + post it so the PAC buying power reflects the
// funded amount immediately.
export async function fundPacAccount(accountId: string, amount: number, reference: string): Promise<void> {
  const recordId = await createCashTransaction({ accountId, amount, type: 'DEPOSIT', reference })
  await postCashTransaction(recordId)
}

export interface PacOrderFill {
  id: string
  orderId: string
  orderNo: string
  secId: string
  side: 'BUY' | 'SELL'
  lastPx: number
  lastQty: number
  cumQty: number
  avgPx: number
  orderQty: number
  grossTradeAmt: number
  fillStatus: string
  tradeDate: string
  createdAt: string
  deleted: boolean
}

export async function listFills(orderId: string): Promise<PacOrderFill[]> {
  const data = await brokerGet<PacOrderFill[]>(`/investing/api/v1/orders/list/fill/${orderId}`)
  return Array.isArray(data) ? data.filter(f => !f.deleted) : []
}

export async function listOrders(accountId: string, options?: { page?: number; size?: number }): Promise<PacOrderListItem[]> {
  const params = new URLSearchParams({
    order: 'desc',
    page:  String(options?.page ?? 0),
    size:  String(options?.size ?? 100),
    sort:  'updatedAt',
  })
  const data = await brokerGet<{ content?: PacOrderListItem[] }>(
    `/investing/api/v1/orders/list/account/${accountId}?${params}`
  )
  return (data.content ?? []).filter(o => !o.deleted)
}

export interface PacValidationResult {
  consideration:  number
  commission:     number
  commissionRate: number
  fees:           number
  totalValue:     number
  orderDesc?:     string
}

export async function validateOrder(order: PacOrderRequest): Promise<PacValidationResult> {
  const body = {
    accountId:    order.accountId,
    secId:        mdsCode(order.symbol),
    side:         order.side,
    requestedQty: order.quantity,
    tif:          'DAY',
    marketCode:   'NGX',
    currency:     'NGN',
    numberOfLegs: 1,
    assetType:    'EQUITY',
    allOrNone:    false,
    autoApprove:  true,
    channel:      'MOBILE',
    ...(order.orderType === 'LIMIT' && order.limitPrice ? { limitPrice: order.limitPrice } : {}),
  }
  const data = await brokerPost<Record<string, unknown>>('/investing/api/v1/orders/validate', body)
  return {
    consideration:  Number(data.consideration  ?? 0),
    commission:     Number(data.commission     ?? 0),
    commissionRate: Number(data.commissionRate ?? 0),
    fees:           Number(data.fees           ?? 0),
    totalValue:     Number(data.totalValue     ?? 0),
    orderDesc:      data.orderDesc as string | undefined,
  }
}

function normalizePriceQuote(d: MdsPriceQuote): PacMarketData {
  const raw       = d as unknown as Record<string, unknown>
  const price     = Number(d.lastPx ?? d.close ?? raw.lastPrice ?? raw.price ?? 0)
  const open      = Number(d.open ?? raw.openPx ?? raw.openPrice ?? 0)
  const prevClose = Number(raw.prevClose ?? raw.previousClose ?? 0)
  const ref       = open || prevClose
  const change    = ref > 0 ? price - ref : 0
  const apiPct    = Number(d.percChange ?? raw.percentageChange ?? raw.changePercent ?? 0)
  const changePercent = apiPct !== 0 ? apiPct : (ref > 0 ? (change / ref) * 100 : 0)
  const sym = d.secId ?? String(raw.symbol ?? raw.ticker ?? '')
  return {
    symbol:        sym,
    name:          SECURITY_NAMES[sym] ?? sym,
    price,
    change,
    changePercent,
    volume:        Number(d.volTraded ?? raw.volume ?? 0),
    high:          Number(d.high ?? 0),
    low:           Number(d.low ?? 0),
    open,
  }
}

function normalizeMover(d: MdsMover): PacMarketData {
  const sym    = String(d.secId ?? d.symbol ?? '')
  const price  = Number(d.lastPx ?? d.close ?? d.price ?? 0)
  const open   = Number(d.open ?? 0)
  const pct    = Number(d.percChange ?? d.changePercent ?? 0)
  return {
    symbol:        sym,
    name:          String(d.securityName ?? d.name ?? SECURITY_NAMES[sym] ?? sym),
    price,
    change:        open > 0 ? price - open : 0,
    changePercent: pct,
    volume:        Number(d.volTraded ?? d.volume ?? 0),
    high:          Number(d.high ?? 0),
    low:           Number(d.low  ?? 0),
    open,
  }
}

function normalizePosition(d: unknown): PacPosition {
  const r   = d as Record<string, unknown>
  const qty = Number(r.quantity     ?? r.units       ?? 0)
  const avg = Number(r.avgCost      ?? r.averageCost ?? r.costPrice    ?? 0)
  const cur = Number(r.currentPrice ?? r.lastPrice   ?? r.price        ?? 0)
  const val = Number(r.currentValue ?? r.marketValue ?? qty * cur)
  const pnl = Number(r.unrealizedPnL ?? r.unrealisedPnL ?? val - avg * qty)
  return {
    symbol:               String(r.secId ?? r.symbol ?? ''),
    securityName:         String(r.secDesc ?? r.securityName ?? r.name ?? ''),
    quantity:             qty,
    averageCost:          avg,
    currentPrice:         cur,
    marketValue:          val,
    unrealizedPnL:        pnl,
    unrealizedPnLPercent: avg > 0 && qty > 0 ? (pnl / (avg * qty)) * 100 : 0,
  }
}

export async function createBrokerAccount(details: {
  fullName:  string
  email:     string
  phone:     string
  bvn?:      string
  dob?:      string
  address?:  string
}): Promise<string> {
  const mobileNo = details.phone.replace(/\D/g, '')
  const clientId  = '019e2ad4-e669-7777-8969-52a5edeac77b'
  const productId = '019e01ab-0727-74c1-9c60-81830bf546ba'
  const branchId  = 'b94b25a0-6546-49a5-8ee6-87046b9d602f'

  const refCode = `MONETA-${Date.now().toString(36).toUpperCase()}`.slice(0, 20)
  const subBrokerIdentifier = (details.email || mobileNo).slice(0, 64)
  const accountLabel = `Moneta / ${refCode} / ${subBrokerIdentifier}`

  const investData = await brokerPost<Record<string, unknown>>(
    '/investing/api/v1/investment/accounts',
    {
      clientId,
      productId,
      branchId,
      mgmtType:             'SELF',
      accountUsage:         'LIVE',
      accountLabel,
      directCashSettlement: false,
      autoApprove:          true,
      refCode,
    }
  )
  const accountId = String(investData.id ?? '')
  if (!accountId) throw new Error('Broker did not return an investment account ID')
  return accountId
}

// Lightweight UUID v4 that works without any native module. Only used for order idempotency.
function generateUuid(): string {
  const hex = '0123456789abcdef'
  const rnd = () => hex[Math.floor(Math.random() * 16)]
  const s = Array.from({ length: 36 }, (_, i) => {
    if (i === 8 || i === 13 || i === 18 || i === 23) return '-'
    if (i === 14) return '4'
    if (i === 19) return hex[8 + Math.floor(Math.random() * 4)]
    return rnd()
  }).join('')
  return s
}
