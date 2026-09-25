import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { colors } from '@/theme'

// App-wide safety net. A render error anywhere under it shows a recovery
// screen with "Try again" (remounts the tree) instead of killing the app.
// Built from plain React Native primitives only, so the fallback itself can't
// throw for the same reason the app did.

interface State { error: Error | null }

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Hook for crash reporting (e.g. Sentry.captureException) once a DSN is set.
    console.error('[AppErrorBoundary]', error?.message, info?.componentStack?.slice(0, 500))
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
          Something went wrong
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          This screen hit an unexpected error. Your account and money are safe.
        </Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => ({
            marginTop: 24, height: 50, paddingHorizontal: 32, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? colors.brandSubtle : colors.brand,
          })}
        >
          <Text style={{ color: colors.textOnBrand, fontSize: 15, fontWeight: '800' }}>Try again</Text>
        </Pressable>
      </View>
    )
  }
}
