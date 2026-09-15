import { View, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import * as Haptics from 'expo-haptics'
import { Icon, Text } from '@/ui'
import { radii, useEffectiveScheme } from '@/theme'

// Floating bottom nav: a rounded dark capsule that floats over the content,
// each tab an icon with its label underneath (per the reference). Active tab
// is gold; inactive is quiet cream. Same chrome in light and dark.
export const TAB_BAR_CLEARANCE = 104

const TABS: Record<string, { icon: string; label: string }> = {
  index:   { icon: 'solar:home-2-bold',         label: 'Home' },
  invest:  { icon: 'solar:pie-chart-2-bold',    label: 'Invest' },
  support: { icon: 'solar:chat-round-line-bold', label: 'Support' },
  account: { icon: 'solar:user-bold',           label: 'Account' },
}
const ORDER = ['index', 'invest', 'support', 'account']

// Deep olive capsule floats over the cream light theme; on true-black dark it
// steps up to a neutral elevated grey so the pill stays visible.
const PILL_BG_LIGHT = '#21261A'
const PILL_BG_DARK  = '#1B211A'                // green-dark surface (dark palette)
const ACTIVE        = '#D4AF37'                // gold
const INACTIVE      = 'rgba(234,237,231,0.55)' // quiet off-white

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const scheme = useEffectiveScheme()
  const pillBg = scheme === 'dark' ? PILL_BG_DARK : PILL_BG_LIGHT
  const routes = state.routes.filter(r => ORDER.includes(r.name))

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 10), alignItems: 'center' }}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 8, paddingVertical: 8, borderRadius: 26,
          backgroundColor: pillBg,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
        }}
      >
        {routes.map((route) => {
          const meta = TABS[route.name]
          const isFocused = state.routes[state.index].key === route.key
          const color = isFocused ? ACTIVE : INACTIVE
          const onPress = () => {
            Haptics.selectionAsync().catch(() => {})
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
          }
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              hitSlop={6}
              style={{ width: 70, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 5 }}
            >
              <Icon name={meta.icon} size={23} color={color} />
              <Text style={{ fontSize: 11, fontWeight: isFocused ? '800' : '600', color }}>{meta.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
