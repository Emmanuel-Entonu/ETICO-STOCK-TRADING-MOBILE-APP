// Risk buckets for the Invest page's risk dial and the filtered Market list.
// Shared so both show the same stocks. (Moved out of app/(app)/market.tsx.)
//   low    — mega-cap blue-chips: proven moats, stable, dividend payers.
//   medium — large-cap growth / industrials / pharma.
//   high   — small/mid-cap, commodity-exposed or speculative names.

export type RiskKey = 'low' | 'medium' | 'high'

export const RISK_GROUPS: Record<RiskKey, Set<string>> = {
  low: new Set([
    'DANGCEM', 'BUACEMENT', 'MTNN', 'AIRTELAFRI', 'NESTLE', 'UNILEVER',
    'BUAFOODS', 'PZ', 'DANGSUGAR', 'NASCON', 'SEPLAT', 'GEREGU',
    'PRESCO', 'OKOMUOIL', 'JAIZBANK',
  ]),
  medium: new Set([
    'HBMN', 'UACN', 'CADBURY', 'HONYFLOUR', 'TRANSPOWER', 'FIDSON', 'MAYBAKER',
    'MECURE', 'CAP', 'BERGER', 'VITAFOAM', 'CUTIX', 'NAHCO', 'SAHCO',
    'CAVERTON', 'REDSTAREX', 'CONOIL', 'TOTAL', 'MRS', 'ETERNA', 'ARADEL',
    'NGXGROUP', 'CWG', 'LOTUSHAL15',
  ]),
  high: new Set([
    'OANDO', 'JAPAULGOLD', 'NEIMETH', 'EKOCORP', 'MORISON', 'JULI', 'IMG',
    'PREMPAINTS', 'BETAGLAS', 'SMURFIT', 'MULTIVERSE', 'NOTORE', 'ENAMELWA',
    'NNFM', 'MCNICHOLS', 'MULTITREX', 'UPL', 'LEARNAFRCA', 'ACADEMY',
    'THOMASWY', 'TRIPPLEG', 'CHAMS', 'ETRANZACT', 'NCR', 'NSLTECH',
    'DAARCOMM', 'TIP', 'CILEASING', 'JOHNHOLT', 'LIVESTOCK', 'FTNCOCOA',
    'ZICHIS', 'CNIF', 'NIDF', 'NREIT', 'UHOMEREIT', 'ABCTRANS', 'TRANSEXPR',
  ]),
}

// User-facing framing: invite, don't warn ("Growth", not "High risk").
export const RISK_META: Record<RiskKey, { label: string; meter: number; blurb: string }> = {
  low: {
    label: 'Conservative',
    meter: 2,
    blurb: 'Established, dividend-paying companies: banks, telecoms, food and consumer brands. Smaller ups and downs.',
  },
  medium: {
    label: 'Balanced',
    meter: 3,
    blurb: 'Growing large companies: industrials, pharma, logistics. A mix of steadiness and growth.',
  },
  high: {
    label: 'Growth',
    meter: 4,
    blurb: 'Smaller and faster-moving companies: energy, emerging names. Bigger swings, bigger potential.',
  },
}

export const isRiskKey = (v: unknown): v is RiskKey => v === 'low' || v === 'medium' || v === 'high'
