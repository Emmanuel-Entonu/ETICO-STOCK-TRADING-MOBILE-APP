// Crash guard for the Home "Beams" card (three.js on expo-gl).
//
// The two crashes seen on 2026-09-28 are fixed at the source:
//   • "Cannot read property 'trim' of undefined" — Beams turns off three's
//     shader-log read (renderer.debug.checkShaderErrors = false).
//   • "Cannot set property '__expoSetLogging' of undefined" — expo-gl is patched
//     to wait for its GL context (patches/expo-gl+57.0.2.patch).
//
// This is only a backstop: such errors fire from native GL events / the render
// loop, outside React, where the global handler would make them FATAL. Here a
// GL-lifecycle error is logged and ignored — the app keeps running and Beams
// keeps its canvas (three simply draws the next frame). Nothing is torn down or
// rebuilt. Every other error goes to the original handler unchanged.

const GL_ERROR = /__expoSetLogging|getProgramInfoLog|getShaderInfoLog|configureLogging|_onSurfaceCreate|onFirstUse|EXGL|exglCtx/i

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
      console.warn('[glGuard] GL error contained (app kept running):', e?.message)
      return
    }
    prev(error, isFatal)
  })
}
