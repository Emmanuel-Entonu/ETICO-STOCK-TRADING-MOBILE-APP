// Ethical NGX ticker set (starter list).
//
// TODO: replace this hardcoded set with the drafted ethical-screening engine
// once it's integrated. Real screening applies quantitative thresholds
// (interest income %, debt/equity, prohibited activity) rather than a
// static allowlist. Until then this list powers the Ethical filter for
// demo purposes and should be reviewed by Moneta's compliance team before
// any user sees it in production.

export const ETHICAL_TICKERS: ReadonlySet<string> = new Set([
  // Ethically screened ETF (NGX-listed)
  'LOTUSHAL15',
  // Non-interest / ethical finance
  'JAIZBANK',
  // Cement + materials  (HBMN = Lafarge Africa; WAPCO is the same security so it
  // is not listed separately)
  'DANGCEM', 'BUACEMENT', 'HBMN',
  'MEYER', 'BERGER', 'CUTIX', 'CAP', 'VITAFOAM',
  // Telecom + communication
  'MTNN', 'AIRTELAFRI', 'DAARCOMM',
  // Consumer goods & FMCG
  'NESTLE', 'BUAFOODS', 'DANGSUGAR', 'HONYFLOUR',
  'UACN', 'PZ', 'UNILEVER', 'CADBURY', 'NASCON', 'CHELLARAM', 'TANTALIZER',
  // Agriculture / agro-allied
  'PRESCO', 'OKOMUOIL', 'LIVESTOCK', 'FTNCOCOA', 'ZICHIS',
  // Energy (subject to compliance ratio checks)
  'SEPLAT', 'CONOIL', 'TOTAL', 'MRS', 'ETERNA', 'ARADEL', 'OANDO',
  // Utilities
  'GEREGU', 'TRANSPOWER',
  // Services / logistics / support (ethically compatible sectors)
  'CAVERTON', 'NAHCO', 'SAHCO', 'REDSTAREX',
  'TIP', 'CILEASING', 'JOHNHOLT',
  // Technology / digital / IT
  'CWG', 'CHAMS', 'ETRANZACT', 'NCR', 'NSLTECH',
  // Healthcare
  'FIDSON', 'NEIMETH', 'MAYBAKER', 'EKOCORP', 'MECURE', 'JULI', 'MORISON',
  // Industrials
  'JBERGER', 'IMG',
  // Materials (paints / glass / packaging / mining / fertiliser)
  'PREMPAINTS', 'BETAGLAS', 'SMURFIT', 'MULTIVERSE', 'NOTORE', 'ENAMELWA',
  'JAPAULGOLD',
  // Food & agriculture
  'NNFM', 'MCNICHOLS', 'MULTITREX',
  // Printing / education / publishing
  'UPL', 'LEARNAFRCA', 'ACADEMY', 'THOMASWY', 'TRIPPLEG',
  // Funds / REITs / infrastructure
  'NGXGROUP', 'CNIF', 'NIDF', 'NREIT', 'UHOMEREIT',
  // Logistics / transport
  'ABCTRANS', 'TRANSEXPR',
])

// Removed after compliance review (do NOT re-add without sign-off):
//   ELLAHLAKES  — a business segment is piggery.
//   IKEJAHOTEL  — hotel bars sell alcohol (a revenue source).
//   TRANSCOHOT  — Transcorp Hotels; hotel bars sell alcohol.
//
// Removed — DELISTED from the NGX (no live price/trading):
//   FLOURMILL   — Flour Mills of Nigeria, delisted Dec 2024 (taken private).
//   TOURIST     — Tourist Company of Nigeria, delisted 31 Jan 2025.

export function isEthical(symbol: string): boolean {
  return ETHICAL_TICKERS.has(symbol.toUpperCase())
}
