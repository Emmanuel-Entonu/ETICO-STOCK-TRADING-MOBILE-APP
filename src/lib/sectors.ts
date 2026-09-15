import { isEthical } from './ethicalTickers'

// NGX sector membership. Mirrors the buckets used by the Market screen; kept
// here so the home "Recommended for you" engine can map a traded symbol back
// to its sector without importing screen code.
export const SECTORS: Record<string, ReadonlySet<string>> = {
  Banking:      new Set(['GTCO', 'ZENITHBANK', 'FBNH', 'ACCESS', 'ACCESSCORP', 'UBA', 'STANBIC', 'FIDELITYBK', 'FCMB', 'JAIZBANK', 'STERLNBANK', 'WEMABANK', 'UBN', 'UNITYBNK', 'ETI']),
  Cement:       new Set(['DANGCEM', 'BUACEMENT', 'WAPCO', 'CCNN']),
  Telecom:      new Set(['MTNN', 'AIRTELAFRI']),
  Consumer:     new Set(['NESTLE', 'UNILEVER', 'CADBURY', 'DANGSUGAR', 'FLOURMILL', 'HONYFLOUR', 'PZ', 'GUINNESS', 'NB', 'INTBREW', 'NASCON', 'BUAFOODS', 'CHAMPION', 'UACN', 'NNFM', 'MCNICHOLS']),
  'Oil & Gas':  new Set(['SEPLAT', 'OANDO', 'TOTAL', 'ETERNA', 'MRS', 'CONOIL', 'ARDOVA', 'ARADEL', 'JAPAULGOLD']),
  Insurance:    new Set(['AIICO', 'MANSARD', 'NEM', 'WAPIC', 'LINKASSURE', 'LASACO', 'LAWUNION', 'VERITASKAP', 'CORNERST', 'MUTUALBEN', 'CONTINSURE', 'PRESTIGE', 'SOVRENINS', 'ROYALEX']),
  Pharma:       new Set(['FIDSON', 'MAYBAKER', 'GLAXOSMITH', 'NEIMETH', 'EKOCORP', 'MORISON', 'PHARMDEKO', 'MECURE']),
  Agriculture:  new Set(['PRESCO', 'OKOMUOIL', 'LIVESTOCK', 'FTNCOCOA', 'ELLAHLAKES', 'MULTITREX']),
  Materials:    new Set(['MEYER', 'BERGER', 'CUTIX', 'CAP', 'VITAFOAM', 'JBERGER', 'IMG', 'PREMPAINTS', 'BETAGLAS', 'SMURFIT', 'MULTIVERSE', 'NOTORE', 'ENAMELWA']),
  Utilities:    new Set(['GEREGU', 'TRANSPOWER']),
  'Aviation & Logistics': new Set(['CAVERTON', 'NAHCO', 'SAHCO', 'REDSTAREX', 'ABCTRANS', 'TRANSEXPR']),
  Services:     new Set(['CWG', 'TRANSCOHOT', 'IKEJAHOTEL', 'TOURIST', 'UPL', 'LEARNAFRCA']),
}

export function sectorOf(symbol: string): string | null {
  const s = symbol.toUpperCase()
  for (const [sector, members] of Object.entries(SECTORS)) {
    if (members.has(s)) return sector
  }
  return null
}

/**
 * Recommend ETHICAL ticker symbols based ONLY on the sectors a user has
 * actually traded. Purely static (no network) so it resolves instantly.
 *
 * Rules (deliberate):
 *  - No trade history → no recommendations (returns []). New users get nothing
 *    until they've actually bought/sold; we don't guess.
 *  - Traded only uncategorised tickers → still [] (no sector signal).
 *  - Otherwise → other ethically screened names in those same sectors, excluding
 *    anything they already hold/traded.
 */
export function recommendEthicalSymbols(traded: string[], limit = 8): string[] {
  if (traded.length === 0) return []

  const held = new Set(traded.map(s => s.toUpperCase()))
  const tradedSectors = new Set(
    traded.map(s => sectorOf(s)).filter((x): x is string => !!x),
  )
  if (tradedSectors.size === 0) return []

  const out: string[] = []
  for (const sector of tradedSectors) {
    for (const sym of SECTORS[sector]) {
      if (out.length >= limit) break
      if (held.has(sym)) continue
      if (!isEthical(sym)) continue
      if (out.includes(sym)) continue
      out.push(sym)
    }
  }
  return out.slice(0, limit)
}
