import { useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useShallow } from 'zustand/react/shallow'
import { usePortfolioStore } from '@/store/portfolioStore'
import { colors } from '@/theme'
import { EticoLogo } from './EticoMark'

// Cold-start brand screen: shows the ETICO lockup for a moment WHILE it warms
// the ethical-stock market data, so the market/home paint instantly after.
// Self-dismisses once data is in (min 1.6s of branding) or after a hard cap.
const MIN_MS = 1600
const CAP_MS = 3800

export function BrandSplash() {
  const { marketData, loadMarketData } = usePortfolioStore(
    useShallow(s => ({ marketData: s.marketData, loadMarketData: s.loadMarketData })),
  )
  const start = useRef(Date.now())
  const [ready, setReady] = useState(false) // begin fade-out
  const [gone, setGone] = useState(false)   // fully unmounted

  useEffect(() => { loadMarketData().catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const e = Date.now() - start.current
      if ((marketData.length > 0 && e >= MIN_MS) || e >= CAP_MS) setReady(true)
    }, 150)
    return () => clearInterval(id)
  }, [marketData.length])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), 340)
    return () => clearTimeout(t)
  }, [ready])

  if (gone) return null

  return (
    <MotiView
      animate={{ opacity: ready ? 0 : 1 }}
      transition={{ type: 'timing', duration: 320 }}
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 2000, elevation: 2000 }]}
    >
      <MotiView
        from={{ scale: 0.94, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ loop: true, type: 'timing', duration: 900 }}
      >
        <EticoLogo size={128} />
      </MotiView>
    </MotiView>
  )
}
