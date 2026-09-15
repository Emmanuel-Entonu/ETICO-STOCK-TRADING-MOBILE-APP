// Local logo manifest.
//
// StockLogo checks this map FIRST before falling back to the remote proxy
// cascade (logo.dev → clearbit → apple-touch-icon → Google favicon → chip).
// These are hand-curated PNGs (kept in sync with Niqra-web's public/logos) for
// tickers whose auto-fetched logo is missing or poor quality.
//
// To add a ticker:
//   1. Drop the PNG file into `assets/logos/{TICKER}.png`
//   2. Add a line here:  TICKER: require('../../assets/logos/TICKER.png'),
//   3. Rebuild
//
// The `require()` must be a literal path — React Native's bundler resolves
// these statically at build time, not at runtime. That's why we can't just
// scan the folder dynamically.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LOCAL_LOGOS: Record<string, any> = {
  ABCTRANS: require('../../assets/logos/ABCTRANS.png'),
  ACADEMY: require('../../assets/logos/ACADEMY.png'),
  BERGER: require('../../assets/logos/BERGER.png'),
  BETAGLAS: require('../../assets/logos/BETAGLAS.png'),
  CAP: require('../../assets/logos/CAP.png'),
  CHAMS: require('../../assets/logos/CHAMS.png'),
  CHELLARAM: require('../../assets/logos/CHELLARAM.png'),
  CILEASING: require('../../assets/logos/CILEASING.png'),
  CNIF: require('../../assets/logos/CNIF.png'),
  CUTIX: require('../../assets/logos/CUTIX.png'),
  CWG: require('../../assets/logos/CWG.png'),
  DAARCOMM: require('../../assets/logos/DAARCOMM.png'),
  EKOCORP: require('../../assets/logos/EKOCORP.png'),
  ENAMELWA: require('../../assets/logos/ENAMELWA.png'),
  ETRANZACT: require('../../assets/logos/ETRANZACT.png'),
  FTNCOCOA: require('../../assets/logos/FTNCOCOA.png'),
  GEREGU: require('../../assets/logos/GEREGU.png'),
  HBMN: require('../../assets/logos/HBMN.png'),
  HONYFLOUR: require('../../assets/logos/HONYFLOUR.png'),
  IMG: require('../../assets/logos/IMG.png'),
  JAPAULGOLD: require('../../assets/logos/JAPAULGOLD.png'),
  JOHNHOLT: require('../../assets/logos/JOHNHOLT.png'),
  JULI: require('../../assets/logos/JULI.png'),
  LIVESTOCK: require('../../assets/logos/LIVESTOCK.png'),
  MCNICHOLS: require('../../assets/logos/MCNICHOLS.png'),
  MECURE: require('../../assets/logos/MECURE.png'),
  MEYER: require('../../assets/logos/MEYER.png'),
  MORISON: require('../../assets/logos/MORISON.png'),
  MULTITREX: require('../../assets/logos/MULTITREX.png'),
  MULTIVERSE: require('../../assets/logos/MULTIVERSE.png'),
  NAHCO: require('../../assets/logos/NAHCO.png'),
  NASCON: require('../../assets/logos/NASCON.png'),
  NIDF: require('../../assets/logos/NIDF.png'),
  NNFM: require('../../assets/logos/NNFM.png'),
  NOTORE: require('../../assets/logos/NOTORE.png'),
  NREIT: require('../../assets/logos/NREIT.png'),
  NSLTECH: require('../../assets/logos/NSLTECH.png'),
  PREMPAINTS: require('../../assets/logos/PREMPAINTS.png'),
  PRESCO: require('../../assets/logos/PRESCO.png'),
  REDSTAREX: require('../../assets/logos/REDSTAREX.png'),
  SAHCO: require('../../assets/logos/SAHCO.png'),
  SMURFIT: require('../../assets/logos/SMURFIT.png'),
  TANTALIZER: require('../../assets/logos/TANTALIZER.png'),
  TIP: require('../../assets/logos/TIP.png'),
  TRANSEXPR: require('../../assets/logos/TRANSEXPR.png'),
  TRANSPOWER: require('../../assets/logos/TRANSPOWER.png'),
  TRIPPLEG: require('../../assets/logos/TRIPPLEG.png'),
  UACN: require('../../assets/logos/UACN.png'),
  UHOMEREIT: require('../../assets/logos/UHOMEREIT.png'),
  UPL: require('../../assets/logos/UPL.png'),
  ZICHIS: require('../../assets/logos/ZICHIS.png'),
}
