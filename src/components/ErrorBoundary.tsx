import React from 'react'

// Error boundary for risky subtrees (three.js / shaders / animations), so a
// render throw can't take the whole screen down.
//
// With `retry`, it SELF-HEALS: after a throw it remounts the children fresh
// after a short backoff (0.5s, 2s, 5s, then every 10s) instead of leaving a
// permanent substitute up. `fallback` is only what shows during that brief
// retry window (default: nothing).

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (err: unknown) => void
  /** Remount the children automatically after an error. */
  retry?: boolean
}
interface State { hasError: boolean; attempt: number }

const BACKOFF = [500, 2000, 5000]

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, attempt: 0 }
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(err: unknown) {
    console.warn('[ErrorBoundary]', err)
    this.props.onError?.(err)
    if (this.props.retry) {
      const delay = BACKOFF[this.state.attempt] ?? 10_000
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 }))
      }, delay)
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    // key = attempt → each retry mounts a completely fresh subtree.
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>
  }
}
