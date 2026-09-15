import React from 'react'

// Minimal error boundary. Wrap risky subtrees (three.js / shader code /
// third-party charts) so a render throw doesn't take the whole screen down.
// Renders `fallback` (or null) instead.

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (err: unknown) => void
}
interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(err: unknown) {
    console.warn('[ErrorBoundary]', err)
    this.props.onError?.(err)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}
