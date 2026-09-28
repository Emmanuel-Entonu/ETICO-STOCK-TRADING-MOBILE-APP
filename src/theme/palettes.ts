// ETICO palette. Light and dark share the same token names so the app can
// use `colors.bg`, `colors.text`, `colors.brand`, etc. everywhere without
// caring which mode is active.
//
// The brand has three colours: deep olive Green (#3A4429), warm Gold
// (#DAA92F), and Cream (#FDFCFA). The two logo lockups tell us how they
// behave per mode:
//   - On CREAM, green leads (it's the ink) and gold is the single accent.
//   - On BLACK, the gold GLOWS and green recedes to a muted support role.
//
// So we invert the hero colour by mode: `brand` is green in light and gold
// in dark, `accent` is gold in light and a lifted olive in dark. Same
// semantics (brand = primary action, accent = flourish) — the hue swap is
// intentional and mirrors the real brand.

export const lightPalette = {
  bg:            '#FDFCFA',   // cream
  bgMuted:       '#F4F1EA',   // deeper cream
  bgSubtle:      '#ECE8DD',   // warm sand

  surface:       '#FFFFFF',
  surfaceRaised: '#FFFFFF',

  border:        '#E6E1D4',   // warm hairline
  borderStrong:  '#D2CBB8',

  text:          '#2C3420',   // deep green-black ink
  textMuted:     '#6C7358',   // olive gray
  textSubtle:    '#9AA187',   // sage
  textInverse:   '#FDFCFA',   // cream: on green surfaces
  textOnBrand:   '#FDFCFA',   // cream: on green primary buttons

  brand:         '#3A4429',   // GREEN leads in light
  brandPress:    '#2C3420',
  brandSubtle:   '#EAEDE0',   // pale green tint
  brandInk:      '#3A4429',

  accent:        '#DAA92F',   // GOLD is the accent in light
  accentPress:   '#C0921F',
  accentSubtle:  '#F8EFD6',   // pale gold
  accentInk:     '#8A6A12',   // deep gold for text on gold-subtle

  positive:      '#2E7D46',
  positiveSubtle:'#E4F1E6',

  negative:      '#D42D20',   // real red, sell action, chart down candles, losses
  negativeSubtle:'#FCE7E4',

  warning:       '#B4791A',
  warningSubtle: '#FBEED0',

  overlay:       'rgba(30,34,20,0.5)',   // green-tinted scrim
}

export type Palette = { [K in keyof typeof lightPalette]: string }

export const darkPalette: Palette = {
  // ETICO dark palette (per the design guide). Green-tinted near-black grounds,
  // warm off-white ink, gold as the primary action, green for ethical/positive.
  bg:            '#0B0D0A',   // background
  bgMuted:       '#0F130E',
  bgSubtle:      '#161C15',

  surface:       '#121612',   // cards / surfaces
  surfaceRaised: '#1B211A',

  border:        '#1F241E',   // divider
  borderStrong:  '#2E3A28',   // primary green as the stronger hairline

  text:          '#EAEDE7',   // primary text (warm off-white)
  textMuted:     '#8A9586',   // muted green-grey
  textSubtle:    '#5E685C',
  textInverse:   '#0B0D0A',   // dark: on gold / light surfaces
  textOnBrand:   '#0B0D0A',   // dark ink on the gold primary buttons

  brand:         '#D4AF37',   // GOLD leads the dark theme (primary buttons, active, star)
  brandPress:    '#BE9A2C',
  brandSubtle:   'rgba(212,175,55,0.15)',   // gold tint behind tiles
  brandInk:      '#E6C65C',   // lifted gold for emphasis

  accent:        '#3FBF6B',   // green: ethical / flourish
  accentPress:   '#34A65B',
  accentSubtle:  'rgba(63,191,107,0.15)',
  accentInk:     '#74D398',

  positive:      '#3FBF6B',
  positiveSubtle:'rgba(63,191,107,0.15)',

  negative:      '#FF5C5C',
  negativeSubtle:'rgba(255,92,92,0.16)',

  warning:       '#D4AF37',
  warningSubtle: 'rgba(212,175,55,0.15)',

  overlay:       'rgba(0,0,0,0.70)',
}
