import { Stack } from 'expo-router'

// Default is slide-from-right (feels like standard forward navigation).
// The PIN gate overrides with slide-from-bottom so it reads as a lockscreen
// rising up over whatever content was underneath — matches the mental
// model of a security gate rather than a linear navigation step.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="pin" options={{ animation: 'slide_from_bottom', animationDuration: 320 }} />
      <Stack.Screen name="kyc" options={{ animation: 'slide_from_right', animationDuration: 260 }} />
    </Stack>
  )
}
