import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuthStore } from '@/store/authStore'
import { usePinStore } from '@/store/pinStore'
import { colors } from '@/theme'
import { Loader } from '@/ui'
import { useShallow } from 'zustand/react/shallow'

// Guards the very first render on cold-start so we never redirect to /(app)
// while the PIN gate hasn't decided yet (that was one source of the Home
// flash before the PIN screen).
export default function Index() {
  const { user, loading, profileReady, hasPin } = useAuthStore(useShallow((s) => ({ user: s.user, loading: s.loading, profileReady: s.profileReady, hasPin: s.hasPin })))
  const unlocked = usePinStore((s) => s.unlockedThisSession)

  if (loading || (user && !profileReady)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={72} />
      </View>
    )
  }

  if (!user)      return <Redirect href={'/(auth)/welcome' as never} />
  if (!hasPin)    return <Redirect href="/(auth)/pin?mode=create" />
  if (!unlocked)  return <Redirect href="/(auth)/pin?mode=enter" />

  return <Redirect href="/(app)" />
}
