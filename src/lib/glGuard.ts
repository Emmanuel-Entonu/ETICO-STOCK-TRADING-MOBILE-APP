import { create } from 'zustand'

// Reliability layer for the Home "Beams" card (three.js on expo-gl).
//
// Causes of the 2026-09-28 crashes are fixed at the source (tabs stay attached
// so the GL surface is never torn down mid-navigation; three's shader-log read
// is off; expo-gl patched to wait for its context — patches/expo-gl+*.patch).
//
// This is the last line of defence: GL-lifecycle errors are thrown from native
// GL events / the render loop, outside React rendering, so an ErrorBoundary
// can't catch them and the global handler made them fatal. Here they're
// contained and Beams REBUILDS its canvas (self-heal with backoff) — the app
// never crashes and the card comes back on its own. Every other error goes to
// the original handler unchanged.

interface GlHealth {
  /** Bumped on each contained GL error → Beams remounts its canvas. */
  generation: number
  errorsInWindow: number
  report: () => void
}

let windowStart = 0

export const useGlHealth = create<GlHealth>((set, get) => ({
  generation: 0,
  errorsInWindow: 0,
  report: () => {
    const now = Date.now()
    if (now - windowStart > 60_000) { windowStart = now; set({ errorsInWindow: 0 }) }
    set({ errorsInWindow: get().errorsInWindow + 1 })
  },
}))

/** Delay before rebuilding: 0.4s, 1s, 3s, then 8s — never gives up. */
export function rebuildDelay(errorsInWindow: number): number {
  return [400, 1000, 3000][errorsInWindow - 1] ?? 8000
}

const GL_ERROR = /__expoSetLogging|getProgramInfoLog|getShaderInfoLog|configureLogging|_onSurfaceCreate|onFirstUse|EXGL|exglCtx|WebGL(Rendering)?Context/i

type Handler = (error: unknown, isFatal?: boolean) => void
declare const ErrorUtils: { getGlobalHandler: () => Handler; setGlobalHandler: (h: Handler) => void } | undefined

let installed = false
export function installGlGuard() {
  if (installed || typeof ErrorUtils === 'undefined') return
  installed = true
  const prev = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    const e = error as { message?: string; stack?: string } | undefined
    const text = `${e?.message ?? String(error)}\n${e?.stack ?? ''}`
    if (GL_ERROR.test(text)) {
      console.warn('[glGuard] GL error contained, rebuilding Beams canvas:', e?.message)
      useGlHealth.getState().report()
      return
    }
    prev(error, isFatal)
  })
}
