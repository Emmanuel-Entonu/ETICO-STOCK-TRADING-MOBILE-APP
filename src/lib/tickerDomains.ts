// Ticker → company domain. Powers the logo lookup in StockLogo (via
// logo.clearbit.com/{domain}). Anything not in this map falls back to the
// coloured initial badge.
//
// Add new tickers here whenever we notice a stock without a logo. Use the
// company's official website domain (not the investor relations subdomain).
export const TICKER_DOMAINS: Record<string, string> = {
  // Cement + industrial
  DANGCEM:    'dangotecement.com',
  BUACEMENT:  'buacement.com',
  WAPCO:      'lafargeafrica.com',

  // Banking
  GTCO:       'gtcoplc.com',
  ZENITHBANK: 'zenithbank.com',
  FBNH:       'fbnholdings.com',
  ACCESS:     'accessbankplc.com',
  UBA:        'ubagroup.com',
  STANBIC:    'stanbicibtc.com',
  FIDELITYBK: 'fidelitybank.ng',
  FCMB:       'fcmb.com',
  JAIZBANK:   'jaizbankplc.com',
  STERLNBANK: 'sterling.ng',
  ABBEYBANK:  'abbeymortgagebank.com',
  ETI:        'ecobank.com',
  UNIONBANK:  'unionbankng.com',
  WEMABANK:   'wemabank.com',

  // Telecom
  MTNN:       'mtn.ng',
  AIRTELAFRI: 'airtel.africa',

  // Consumer goods
  NESTLE:     'nestle-cwa.com',
  BUAFOODS:   'buafoods.com',
  FLOURMILL:  'fmnplc.com',
  UACN:       'uacnplc.com',
  PZ:         'pzcussons.com',
  HONYFLOUR:  'honeywellflour.com',
  DANGSUGAR:  'dangotesugar.com.ng',
  NB:         'nbplc.com',
  GUINNESS:   'guinness-nigeria.com',
  CADBURY:    'cadburynigeria.com',
  UNILEVER:   'unilevernigeria.com',
  INTBREW:    'intbrew.com',

  // Energy
  SEPLAT:     'seplatenergy.com',
  OANDO:      'oandoplc.com',
  CONOIL:     'conoilplc.com',
  TOTAL:      'totalenergies.com',
  ARDOVA:     'ardovaplc.com',
  MRS:        'mrsholdings.com',
  ETERNA:     'eternaplc.com',
  RAKUNITY:   'rakunitypetroleum.com',

  // Insurance
  VERITASKAP: 'veritaskapitalassurance.com',
  AIICO:      'aiicoplc.com',
  NEM:        'nem-insurance.com',
  MANSARD:    'axamansard.com',
  CORNERST:   'cornerstoneinsuranceplc.com',
  LINKASSURE: 'linkageassurance.com',
  MUTBEN:     'mutualbenefitsassurance.com',
  SUNUASSUR:  'sunuassurancesnigeria.com',

  // Services / conglomerates
  CAVERTON:   'caverton-offshore.com',
  FTNCOCOA:   'ftnfoods.com',
  CWG:        'cwg-plc.com',
  JAPAULGOLD: 'japaulgold.com',
  EUNISELL:   'eunisellinteractive.com',
  CHAMS:      'chamsholding.com',
  TRANSCORP:  'transcorpnigeria.com',
  TRANSCOHOT: 'transcorphotels.com',
  TIP:        'transnationwidepower.com',
  ACADEMY:    'academypressplc.com',
  BUAPLC:     'bua.com',

  // Real estate
  UPDCREIT:   'updcplc.com',
  UPDC:       'updcplc.com',

  // Others commonly on NGX top-movers
  THOMASWY:   'thomaswyatt-nigeria.com',
  IKEJAHOTEL: 'ikejahotel.com',
  MEYER:      'meyerpaints.com',
  CUTIX:      'cutixplc.com',
  BERGER:     'bergerpaintsnig.com',
  VITAFOAM:   'vitafoamng.com',
  PRESCO:     'presco-plc.com',
  OKOMUOIL:   'okomuoil.com',
  LIVESTOCK:  'livestockfeeds-ng.com',
  UNITYBNK:   'unitybankng.com',
  RTBRISCOE:  'rtbriscoe.com',
  ROYALEX:    'royalexinsurance.com',
  MBENEFIT:   'mutualbenefitsassurance.com',
  NAHCO:      'nahco.com',
  NCR:        'ncrnigeria.com',
  ETRANZACT:  'etranzact.com',
  COURTVILLE: 'courtvilleplc.com',
  MCNICHOLS:  'mcnichols-plc.com',
  MULTIVERSE: 'multiverseplc.com',
  MORISON:    'morisonindustries.com',
  NEIMETH:    'neimeth.com',
  MAYBAKER:   'may-baker.com',
  FIDSON:     'fidson.com',
  GLAXOSMITH: 'gsk.com',
  PHARMDEKO:  'pharmadekoplc.com',
  TRANSEXPR:  '', // no reliable domain, falls back to initials

  // ── Newly-tracked tickers ─────────────────────────────────
  // Banks
  ACCESSCORP: 'accesscorpplc.com',
  UBN:        'unionbankng.com',
  // Consumer / F&B
  DANGFLOUR:  'dangoteflour.com',
  GOLDBREW:   'goldenguineadistilleries.com',
  ENAMELWA:   'enamelware.com.ng',
  NNFM:       'niger-flour.com',
  UPL:        'unionplc.com',
  VONO:       'vonoproducts.com',
  CHAMPION:   'championbreweriesplc.com',
  NASCON:     'nasconplc.com',
  // Industrial / building
  IPWA:       'ipwaplc.com',
  PREMPAINTS: 'premierpaintsng.com',
  CAP:        'capplc.com',
  PORTLAND:   'lafargeafrica.com',
  CCNN:       'sokotocement.com',
  // ICT / services
  TRIPPLEG:   'tripple-gee.com',
  // Insurance (additional)
  AXAMANSARD: 'axamansard.com',
  STACO:      'stacoinsurance.com',
  UNIVINSURE: 'universalinsuranceplc.com',
  GUINEAINS:  'guineainsurance.com',
  LASACO:     'lasacoassurance.com',
  LAWUNION:   'lawunion-rock.com',
  PRESTIGE:   'prestigeassuranceplc.com',
  SOVRENINS:  'stiplc.com',
  CONTINSURE: 'continentalreinsurance.com',
  REGALINS:   'regalinsuranceplc.com',
  NGL:        'niger-insurance.com',
  WAPIC:      'wapic.com',
  // Pharma / healthcare
  JULI:       'juliplc.com',
  EKOCORP:    'ekocorp.com',
  // Agriculture
  ELLAHLAKES: 'ellahlakesplc.com',
  // Real estate / conglomerates
  CHELLARAM:  'chellaramsplc.com',
  SCOA:       'scoanigeriaplc.com',
  JOHNHOLT:   'johnholtplc.com',
  LEARNAFRCA: 'learnafricaplc.com',
  TRANSPOWER: 'transafampower.com',
  // Transport / hospitality
  REDSTAREX:  'redstarplc.com',
  CAPHOTEL:   'capitalhotelsplc.com',
  TANTALIZER: 'tantalizersplc.com',
  // Micro-caps / other
  MEDIAVISN:  'mediavisionplc.com',
  DAARCOMM:   'daargroup.com',
  ABBEYBDS:   'abbeymortgagebank.com',
  BAPLC:      'briclinksafrica.com',
  BETAGLAS:   'betaglassplc.com',
  BRICNET:    'bricnetplc.com',
  AUSTINLAZ:  'austinlaz.com',
  OMATEK:     'omatekventures.com',
  INITSPLC:   'initsplc.com',
  CILEASING:  'cileasing.com',
  // ETI covered above
}
