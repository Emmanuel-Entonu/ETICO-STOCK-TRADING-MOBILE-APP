import { useEffect, useMemo, useState } from 'react'
import { AppState, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Atlas, Canvas, Group, Path, Skia, useTexture } from '@shopify/react-native-skia'
import { makeMutable, useFrameCallback } from 'react-native-reanimated'

// AeroShards — React Bits <AeroShards/> (placement "full", flow "stream",
// material "pearl") ported to React Native.
//
// The original renders instanced 3D geometry through WebGPU (vgpu), which
// doesn't exist in React Native. This port keeps its motion model — the same
// "full" stream path + arc-length table, lane spread, depth layering,
// perspective, depth-scaled size, per-shard roll and the depth-fog colour mix —
// and draws every shard as one sprite of a Skia <Atlas> (a single draw call).
//
// Performance (2026-09-28): the first version looped all shards THREE times a
// frame (transform, colour, roll frame — one mapper each), drew twice and ran a
// full-screen blur for the bloom; on Android that made the Account page lag.
// Now: ONE loop per frame writes all three buffers, per-shard constants are
// precomputed, trig is avoided where the maths allows (rotation comes straight
// from the unit tangent, powers by repeated squaring), ~480 shards instead of
// 840, no blur pass, and the host pauses it when the header scrolls off-screen.
//
// Dropped vs the web version: cursor repel / hold-to-gather / click ripples
// (the header has buttons on top and no cursor), dither/ASCII effects, film
// grain, chromatic aberration and the blurred bloom.
//
// iOS worklet rule: everything the frame worklet touches is a plain number /
// array captured as a constant — never the `colors` theme proxy or a plain JS
// function.

interface Props {
  shardColor?: string
  accentColor?: string
  /** Shard count multiplier (1 = ~320 shards). */
  density?: number
  shardSize?: number
  speed?: number
  spin?: number
  spread?: number
  depth?: number
  stretch?: number
  glow?: number
  /** Frame-rate cap for the animation (the rest of the app is unaffected). */
  fps?: number
  /** Stop animating (e.g. host screen not focused / header off-screen). */
  paused?: boolean
}

// Arc-length table for the "full" path, copied from the original shader so
// shards travel at an even speed along the curve.
const FULL_ARC = [
  0.000000, 0.028092, 0.055939, 0.083892, 0.112291, 0.141449, 0.171637, 0.203033,
  0.235650, 0.269282, 0.303537, 0.337982, 0.372308, 0.406392, 0.440263, 0.474026,
  0.507794, 0.541636, 0.575553, 0.609470, 0.643257, 0.676761, 0.709855, 0.742465,
  0.774594, 0.806319, 0.837790, 0.869218, 0.900862, 0.933020, 0.965991, 1.000000,
]

// Sprite sheet: a folded diamond (two facets + a bright crease) drawn white
// so each shard's colour tints it via BlendMode "modulate". ROLL_FRAMES copies
// get narrower, full face → edge-on sliver; each frame picks the copy matching
// the shard's current roll (RSXform can only scale uniformly, so this is how the
// 3D roll of the original reads).
const TEX_W = 24
const TEX_H = 64
const ROLL_FRAMES = 6
const ROLL_WIDTHS = [1, 0.8, 0.6, 0.42, 0.26, 0.12]
const facet = (cx: number, half: number, side: -1 | 1) =>
  Skia.Path.MakeFromSVGString(`M${cx} 0 L${cx + side * half} 32 L${cx} 64 Z`)!
const SHEET = ROLL_WIDTHS.map((w, j) => {
  const cx = j * TEX_W + TEX_W / 2
  const half = (TEX_W / 2) * w
  return {
    left: facet(cx, half, -1),
    right: facet(cx, half, 1),
    crease: Skia.Path.MakeFromSVGString(`M${cx} 2 L${cx + Math.max(0.5, 1.2 * w)} 32 L${cx} 62 L${cx - Math.max(0.5, 1.2 * w)} 32 Z`)!,
  }
})

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Deterministic per-shard seeds (the shader's hashU32 → unitFloat).
const hashU32 = (value: number) => {
  let state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0
  state = ((word >>> 22) ^ word) >>> 0
  return state
}
const unitFloat = (v: number) => hashU32(v) / 4294967296

export default function AeroShards({
  shardColor = '#10B981',
  accentColor = '#EAB308',
  density = 1,
  shardSize = 1.1,
  speed = 1,
  spin = 1,
  spread = 1,
  depth = 1,
  stretch = 1,
  glow = 1,
  fps = 30,
  paused = false,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width !== size.width || height !== size.height) setSize({ width, height })
  }

  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'))
    return () => sub.remove()
  }, [])

  const count = Math.max(80, Math.round(320 * density))
  const W = size.width
  const H = size.height
  const aspect = H > 0 ? W / H : 1.6
  const pathLength = Math.sqrt((2.44 * aspect) ** 2 + 5)

  // Everything per shard that doesn't change over time, computed once.
  const k = useMemo(() => {
    const phase0: number[] = [], lane: number[] = [], loose: number[] = [], zOff: number[] = []
    const wave: number[] = [], zWave: number[] = [], scaleShape: number[] = []
    const rollBase: number[] = [], rollRate: number[] = [], mixA: number[] = []
    for (let i = 0; i < count; i++) {
      const sp = unitFloat(Math.imul(i, 1664525) + 1013904223)
      const sl = unitFloat(Math.imul(i, 2246822519) + 3266489917)
      const sd = unitFloat(Math.imul(i, 668265263) + 374761393)
      const ss = unitFloat(Math.imul(i, 1597334677) + 3812015801)
      const signed = sl * 2 - 1
      phase0.push(sp)
      lane.push((signed < 0 ? -1 : 1) * Math.pow(Math.abs(signed), 0.72))
      loose.push(1 + (sd > 0.92 ? (sd - 0.92) / 0.08 : 0) * 0.72)
      zOff.push((sd * 2 - 1) * 0.5 * depth)
      wave.push(sd * 12)
      zWave.push(sl * 8)
      scaleShape.push(0.46 + ss * 0.58 + Math.pow(ss, 12) * 1.55)
      rollBase.push(sl * 2 * Math.PI)
      rollRate.push((-1.5 + 3.2 * sd) * spin * 2.4)
      mixA.push(sl)
    }
    return { phase0, lane, loose, zOff, wave, zWave, scaleShape, rollBase, rollRate, mixA }
  }, [count, depth, spin])

  const base = hexToRgb(shardColor)
  const accent = hexToRgb(accentColor)
  // Highlight = the shard colour pushed toward white (pearl finish).
  const hi: [number, number, number] = [
    base[0] + (1 - base[0]) * 0.78, base[1] + (1 - base[1]) * 0.78, base[2] + (1 - base[2]) * 0.78,
  ]

  const texture = useTexture(
    <Group>
      {SHEET.map((f, j) => (
        <Group key={j}>
          <Path path={f.left} color="rgba(255,255,255,0.78)" />
          <Path path={f.right} color="rgba(255,255,255,1)" />
          <Path path={f.crease} color="rgba(255,255,255,1)" />
        </Group>
      ))}
    </Group>,
    { width: TEX_W * ROLL_FRAMES, height: TEX_H },
  )

  // Draw buffers, mutated in place on the UI thread.
  const buf = useMemo(() => ({
    sprites: makeMutable(Array.from({ length: count }, () => Skia.XYWHRect(0, 0, TEX_W, TEX_H))),
    transforms: makeMutable(Array.from({ length: count }, () => Skia.RSXform(0, 0, 0, 0))),
    tints: makeMutable(Array.from({ length: count }, () => Skia.Color('transparent'))),
  }), [count])

  const worldShard = 0.042 * shardSize
  const pxPerWorld = H / 2
  const glowF = 0.15 + glow * 0.16
  const { phase0, lane, loose, zOff, wave, zWave, scaleShape, rollBase, rollRate, mixA } = k
  const { sprites, transforms, tints } = buf
  const clock = useMemo(() => makeMutable(0), [])
  // Frame cap: time keeps advancing with the real clock (motion speed is
  // unchanged), but shards are only recomputed + redrawn every 1/fps seconds.
  const pending = useMemo(() => makeMutable(0), [])
  const step = 1 / Math.max(10, Math.min(60, fps))

  const frame = useFrameCallback((info) => {
    'worklet'
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 50) / 1000
    const t = clock.value + dt
    clock.value = t
    const acc = pending.value + dt
    // Small tolerance so a 60Hz display lands exactly on every 2nd frame.
    if (acc < step - 0.004) { pending.value = acc; return }
    pending.value = 0
    const PI = 3.14159265359
    const travel = (t * 0.16 * speed) / pathLength
    const xf = transforms.value
    const col = tints.value
    const spr = sprites.value
    for (let i = 0; i < count; i++) {
      // ── Position along the "full" stream path ──
      let phase = phase0[i] + travel
      phase -= Math.floor(phase)
      const scaled = (phase < 0.999999 ? phase : 0.999999) * 31
      const a0 = Math.floor(scaled)
      const ai = a0 > 30 ? 30 : a0
      const u = FULL_ARC[ai] + (FULL_ARC[ai + 1] - FULL_ARC[ai]) * (scaled - ai)
      const ang1 = (u * 1.72 - 0.2) * PI
      const ang3 = u * PI * 3
      const px = -aspect * 1.22 + aspect * 2.44 * u
      const py = Math.sin(ang1) * 0.54 + Math.sin(ang3) * 0.12
      const pz = Math.cos(u * PI * 2 - 0.7) * 0.22
      let dx = aspect * 2.44
      let dy = Math.cos(ang1) * 1.72 * PI * 0.54 + Math.cos(ang3) * PI * 3 * 0.12
      const dl = Math.sqrt(dx * dx + dy * dy)
      dx /= dl; dy /= dl
      // ── Lane spread + depth ──
      const sp = Math.sin(phase * PI)
      const widthProfile = 0.46 + Math.sqrt(sp > 0 ? sp : 0) * 0.54
      const laneWidth = (lane[i] * 0.56 + Math.sin(phase * 37.699 + wave[i]) * 0.055) * 0.62 * spread * widthProfile * loose[i]
      const wx = px - dy * laneWidth
      const wy = py + dx * laneWidth
      const wz = pz + zOff[i] + Math.cos(phase * 31.4159 + zWave[i]) * 0.06
      const pd = 1 - wz * 0.34
      const persp = 1 / (pd > 0.62 ? pd : 0.62)
      let depthT = wz * 0.62 + 0.5
      depthT = depthT < 0 ? 0 : depthT > 1 ? 1 : depthT
      const lengthPx = worldShard * scaleShape[i] * (0.56 + 1.02 * depthT) * 1.26 * stretch * 2 * pxPerWorld * persp
      const sc = lengthPx / TEX_H
      // Texture long axis → screen flow direction (dx, -dy): cos θ = -dy, sin θ = -dx.
      const scos = -dy * sc
      const ssin = -dx * sc
      const sx = (wx * persp / aspect * 0.5 + 0.5) * W
      const sy = (0.5 - wy * persp * 0.5) * H
      xf[i].set(scos, ssin, sx - (scos * 12 - ssin * 32), sy - (ssin * 12 + scos * 32))

      // ── Roll → sprite width frame + pearl lighting ──
      const c = Math.cos(rollBase[i] + t * rollRate[i])
      const facing = c < 0 ? -c : c
      const fr = Math.round((1 - facing) * 5)
      spr[i].setXYWH(fr * 24, 0, 24, 64)
      let f = (wz + 0.68) / 1.26
      f = f < 0 ? 0 : f > 1 ? 1 : f
      const fog = f * f * (3 - 2 * f)
      let spec = 0
      if (c > 0) { const c2 = c * c; const c4 = c2 * c2; const c8 = c4 * c4; spec = c8 * c8 * c2 * glow }
      const inv = 1 - facing
      const inv2 = inv * inv
      const fresnel = inv2 * inv2 * glowF
      const bright = (0.28 + facing * 0.62) * (0.42 + 0.58 * fog)
      const m = mixA[i]
      let r = (accent[0] * 0.52 + (base[0] - accent[0] * 0.52) * fog) * bright + hi[0] * spec * 0.9 + (base[0] + (accent[0] - base[0]) * m) * fresnel
      let g = (accent[1] * 0.52 + (base[1] - accent[1] * 0.52) * fog) * bright + hi[1] * spec * 0.9 + (base[1] + (accent[1] - base[1]) * m) * fresnel
      let b = (accent[2] * 0.52 + (base[2] - accent[2] * 0.52) * fog) * bright + hi[2] * spec * 0.9 + (base[2] + (accent[2] - base[2]) * m) * fresnel
      r = r / (1 + r * 0.35) * 1.3; g = g / (1 + g * 0.35) * 1.3; b = b / (1 + b * 0.35) * 1.3
      const e1 = phase / 0.035
      const e2 = (1 - phase) / 0.035
      const seam = (e1 < 1 ? e1 : 1) * (e2 < 1 ? e2 : 1)
      const ci = col[i]
      ci[0] = r < 1 ? r : 1
      ci[1] = g < 1 ? g : 1
      ci[2] = b < 1 ? b : 1
      ci[3] = (0.58 + 0.39 * fog) * seam
    }
    // One notify per buffer → one redraw per frame.
    transforms.modify((v) => { 'worklet'; return v })
    tints.modify((v) => { 'worklet'; return v })
    sprites.modify((v) => { 'worklet'; return v })
  }, false)

  const running = !paused && appActive && size.width > 0
  useEffect(() => { frame.setActive(running) }, [running, frame])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Atlas image={texture} sprites={sprites} transforms={transforms} colors={tints} colorBlendMode="modulate" />
        </Canvas>
      )}
    </View>
  )
}
