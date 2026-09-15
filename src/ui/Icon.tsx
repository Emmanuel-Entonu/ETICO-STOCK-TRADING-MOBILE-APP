import React from 'react'
import { Iconify } from 'react-native-iconify'
import { colors } from '@/theme'

// Thin wrapper so callers can keep passing `name="solar:leaf-bold"` or any
// other Iconify identifier. The Iconify component renders SVG directly, so
// the icons match the reference designs pixel-for-pixel instead of relying
// on MaterialCommunityIcons approximations.
//
// The babel plugin (`react-native-iconify/babel`) statically inlines each
// icon's SVG data at build time. Names must appear in babel.config.js →
// plugins → 'react-native-iconify/babel' → { icons: [...] } to be bundled.
export function Icon({
  name,
  size = 22,
  color = colors.text,
}: {
  name: string
  size?: number
  color?: string
}) {
  return <Iconify icon={name} size={size} color={color} />
}
