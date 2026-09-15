// Deterministic sparkline path generator. Same symbol always produces the
// same shape, so the list feels stable across refreshes.
export function generateSparklinePath(symbol: string, isUp: boolean, w = 64, h = 32): string {
  const seed = symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)
  const n = 14
  const points: [number, number][] = []

  for (let i = 0; i < n; i++) {
    const r1 = ((seed * (i + 3) * 29 + i * 17) % 1000) / 1000
    const r2 = ((seed * (i + 7) * 13 + i * 41) % 1000) / 1000
    const noise = (r1 - 0.5) * 22 + (r2 - 0.5) * 8
    const trend = isUp ? (i / (n - 1)) * 38 : -(i / (n - 1)) * 38
    const val = Math.max(4, Math.min(96, 50 + trend * 0.5 + noise))
    points.push([i, val])
  }

  const xS = w / (n - 1)
  const yS = h / 100

  let d = `M ${(points[0][0] * xS).toFixed(1)} ${(h - points[0][1] * yS).toFixed(1)}`
  for (let i = 1; i < n; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const cpx = ((x0 + x1) / 2) * xS
    const cp0y = (h - y0 * yS).toFixed(1)
    const p1y  = (h - y1 * yS).toFixed(1)
    d += ` Q ${cpx.toFixed(1)} ${cp0y} ${(x1 * xS).toFixed(1)} ${p1y}`
  }
  return d
}
