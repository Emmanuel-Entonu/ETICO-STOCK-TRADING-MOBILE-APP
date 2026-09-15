export function naira(n: number, opts?: { fractionDigits?: number }): string {
  const digits = opts?.fractionDigits ?? 2
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function pct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function nairaCompact(n: number): string {
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '₦' + (n / 1_000).toFixed(1) + 'K'
  return '₦' + n.toFixed(0)
}

export function isoDate(d = new Date()): string {
  return d.toISOString().split('T')[0]
}
