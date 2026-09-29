import type { ImageSourcePropType } from 'react-native'

// Artwork bundled with the app for each event (logo = square, banner = 2:1).
// Keyed by events.id. An event without an entry falls back to its logo_url, then
// to an initials tile. Add a future event's artwork here + in assets/events/.
export const EVENT_ASSETS: Record<string, { logo?: ImageSourcePropType; banner?: ImageSourcePropType }> = {
  'dangote-ipo': {
    logo: require('../../assets/events/dangote-ipo-logo.jpg'),
    banner: require('../../assets/events/dangote-ipo-banner.jpg'),
  },
}

export const BANNER_ASPECT = 2 // width : height of the banner artwork
