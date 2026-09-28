import { useEffect, useMemo, useState } from 'react'
import { AppState, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import {
  Atlas, Blur, Canvas, Group, Paint, Path, Skia,
  useColorBuffer, useRSXformBuffer, useRectBuffer, useTexture,
} from '@shopify/react-native-skia'
import { useFrameCallback, useSharedValue } from 'react-native-reanimated'

// AeroShards — React Bits <AeroShards/> (placement "full", flow "stream",
// material "pearl") ported to React Native.
//
// The original renders instanced 3D geometry through WebGPU (vgpu), which
// doesn't exist in React Native. This port keeps its motion model — the same
// "full" stream path + arc-length table, lane spread, depth layering,
// perspective, depth-scaled size, per-shard roll and the depth-fog colour mix —
// and draws every shard as one sprite of a Skia <Atlas> (a single draw call),
// with a blurred copy underneath for the bloom. Transforms and colours are
// rewritten in place on the UI thread each frame.
//
// Dropped vs the web version: cursor repel / hold-to-gather / click ripples
// (the header has buttons on top and no cursor), dither/ASCII effects, film
// grain and chromatic aberration.
//
// iOS worklet rule: everything the frame worklets touch is a plain number /
// array captured as a constant, or a helper marked 'worklet' — never the
// `colors` theme proxy or a plain JS function.

interface Props {
  shardColor?: string
  accentColor?: string
  /** Shard count multiplier (1 = ~560 shards). */
  density?: number
  shardSize?: number
  speed?: number
  spin?: number
  spread?: number
  depth?: number
  stretch?: number
  glow?: number
  bloom?: number
  /** Stop animating (e.g. host screen not focused). */
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
  bloom = 0.5,
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

  const count = Math.max(80, Math.round(560 * density))

  const seeds = useMemo(() => {
    const phase: number[] = [], lane: number[] = [], dep: number[] = [], scale: number[] = []
    for (let i = 0; i < count; i++) {
      phase.push(unitFloat(Math.imul(i, 1664525) + 1013904223))
      lane.push(unitFloat(Math.imul(i, 2246822519) + 3266489917))
      dep.push(unitFloat(Math.imul(i, 668265263) + 374761393))
      scale.push(unitFloat(Math.imul(i, 1597334677) + 3812015801))
    }
    return { phase, lane, dep, scale }
  }, [count])

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

  // Seconds of animation (only advances while running).
  const time = useSharedValue(0)
  const frame = useFrameCallback((info) => {
    'worklet'
    const dt = info.timeSincePreviousFrame ?? 16
    time.value += Math.min(dt, 50) / 1000
  }, false)
  const running = !paused && appActive && size.width > 0
  useEffect(() => { frame.setActive(running) }, [running, frame])

  const W = size.width
  const H = size.height
  const aspect = H > 0 ? W / H : 1.6
  const pathLength = Math.sqrt((2.44 * aspect) ** 2 + 5)
  // World size of a shard: in the original, screen height = 2 world units.
  const worldShard = 0.042 * shardSize
  const pxPerWorld = H / 2
  const { phase: sPhase, lane: sLane, dep: sDep, scale: sScale } = seeds

  // Roll → which width frame of the sprite sheet this shard shows.
  const sprites = useRectBuffer(count, (val, i) => {
    'worklet'
    const roll = sLane[i] * 2 * 3.14159265359 + time.value * (-1.5 + 3.2 * sDep[i]) * spin * 2.4
    const j = Math.min(5, Math.round((1 - Math.abs(Math.cos(roll))) * 5))
    val.setXYWH(j * 24, 0, 24, 64)
  })

  const transforms = useRSXformBuffer(count, (val, i) => {
    'worklet'
    const t = time.value
    const PI = 3.14159265359
    // Position along the path (transport), same for every shard, plus its seed.
    let phase = sPhase[i] + (t * 0.16 * speed) / pathLength
    phase = phase - Math.floor(phase)
    const scaled = Math.min(phase, 0.999999) * 31
    const k = Math.min(Math.floor(scaled), 30)
    const u = FULL_ARC[k] + (FULL_ARC[k + 1] - FULL_ARC[k]) * (scaled - k)
    // fullPath()
    const px = -aspect * 1.22 + aspect * 2.44 * u
    const py = Math.sin((u * 1.72 - 0.2) * PI) * 0.54 + Math.sin(u * PI * 3) * 0.12
    const pz = Math.cos(u * PI * 2 - 0.7) * 0.22
    let dx = aspect * 2.44
    let dy = Math.cos((u * 1.72 - 0.2) * PI) * 1.72 * PI * 0.54 + Math.cos(u * PI * 3) * PI * 3 * 0.12
    const dl = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= dl; dy /= dl
    // Lane spread across the flow, wider mid-stream; a few loose shards stray further.
    const signedLane = sLane[i] * 2 - 1
    const lane = (signedLane < 0 ? -1 : 1) * Math.pow(Math.abs(signedLane), 0.72)
    const widthProfile = 0.46 + Math.pow(Math.max(Math.sin(phase * PI), 0), 0.72) * 0.54
    const loose = sDep[i] > 0.92 ? (sDep[i] - 0.92) / 0.08 : 0
    const flowWave = Math.sin(phase * 37.699 + sDep[i] * 12)
    const laneWidth = (lane * 0.56 + flowWave * 0.055) * 0.62 * spread * widthProfile * (1 + loose * 0.72)
    const wx = px + -dy * laneWidth
    const wy = py + dx * laneWidth
    const wz = pz + (sDep[i] * 2 - 1) * 0.5 * depth + Math.cos(phase * 31.4159 + sLane[i] * 8) * 0.06
    // Perspective + depth-scaled size (the shader's depthScale / scaleShape).
    const persp = 1 / Math.max(0.62, 1 - wz * 0.34)
    const depthT = Math.min(Math.max(wz * 0.62 + 0.5, 0), 1)
    const depthScale = 0.56 + (1.58 - 0.56) * depthT
    const scaleShape = 0.46 + sScale[i] * 0.58 + Math.pow(sScale[i], 12) * 1.55
    // Roll foreshortens the shard's width — RSXform is a uniform scale, so we
    // fold that into the tint (see colour buffer) and keep the size here.
    const lengthPx = worldShard * scaleShape * depthScale * 1.26 * stretch * 2 * pxPerWorld * persp
    const s = lengthPx / TEX_H
    // World → screen (y up → y down).
    const sx = (wx * persp / aspect * 0.5 + 0.5) * W
    const sy = (0.5 - wy * persp * 0.5) * H
    // Texture's long axis (0,1) → screen flow direction (dx, -dy).
    const theta = Math.atan2(-dx, -dy)
    const sc = Math.cos(theta) * s
    const ss = Math.sin(theta) * s
    const cx = TEX_W / 2
    const cy = TEX_H / 2
    val.set(sc, ss, sx - (sc * cx - ss * cy), sy - (ss * cx + sc * cy))
  })

  const tints = useColorBuffer(count, (val, i) => {
    'worklet'
    const t = time.value
    const PI = 3.14159265359
    let phase = sPhase[i] + (t * 0.16 * speed) / pathLength
    phase = phase - Math.floor(phase)
    const scaled = Math.min(phase, 0.999999) * 31
    const k = Math.min(Math.floor(scaled), 30)
    const u = FULL_ARC[k] + (FULL_ARC[k + 1] - FULL_ARC[k]) * (scaled - k)
    const wz = Math.cos(u * PI * 2 - 0.7) * 0.22 + (sDep[i] * 2 - 1) * 0.5 * depth
    // Depth fog: far shards lean toward a dim accent, near ones to the shard colour.
    const f = Math.min(Math.max((wz + 0.68) / 1.26, 0), 1)
    const fog = f * f * (3 - 2 * f)
    // Pearl roll: facets catch the key light as they turn.
    const rollDir = -1.5 + 3.2 * sDep[i]
    const roll = sLane[i] * 2 * PI + t * rollDir * spin * 2.4
    const c = Math.cos(roll)
    const facing = Math.abs(c)
    const spec = Math.pow(Math.max(c, 0), 18) * glow
    const fresnel = Math.pow(1 - facing, 4) * (0.15 + glow * 0.16)
    const bright = (0.28 + facing * 0.62) * (0.42 + 0.58 * fog)
    const mixA = sLane[i]
    let r = (accent[0] * 0.52 + (base[0] - accent[0] * 0.52) * fog) * bright + hi[0] * spec * 0.9 + (base[0] + (accent[0] - base[0]) * mixA) * fresnel
    let g = (accent[1] * 0.52 + (base[1] - accent[1] * 0.52) * fog) * bright + hi[1] * spec * 0.9 + (base[1] + (accent[1] - base[1]) * mixA) * fresnel
    let b = (accent[2] * 0.52 + (base[2] - accent[2] * 0.52) * fog) * bright + hi[2] * spec * 0.9 + (base[2] + (accent[2] - base[2]) * mixA) * fresnel
    // Soft shoulder instead of hard clipping (ACES-ish).
    r = r / (1 + r * 0.35) * 1.3; g = g / (1 + g * 0.35) * 1.3; b = b / (1 + b * 0.35) * 1.3
    // Taper at the path's ends so shards don't pop at the wrap seam.
    const seam = Math.min(1, phase / 0.035) * Math.min(1, (1 - phase) / 0.035)
    val[0] = Math.min(r, 1)
    val[1] = Math.min(g, 1)
    val[2] = Math.min(b, 1)
    val[3] = (0.58 + 0.39 * fog) * seam
  })

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          {bloom > 0 && (
            <Group layer={<Paint opacity={Math.min(1, bloom * 1.2)} blendMode="plus"><Blur blur={7} mode="decal" /></Paint>}>
              <Atlas image={texture} sprites={sprites} transforms={transforms} colors={tints} colorBlendMode="modulate" />
            </Group>
          )}
          <Atlas image={texture} sprites={sprites} transforms={transforms} colors={tints} colorBlendMode="modulate" />
        </Canvas>
      )}
    </View>
  )
}
