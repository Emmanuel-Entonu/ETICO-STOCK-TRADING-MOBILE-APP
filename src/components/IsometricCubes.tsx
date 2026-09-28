import React from 'react'
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse, G } from 'react-native-svg'

/**
 * Isometric 3D illustrations for the Assets grid. All shapes use a real
 * 2:1 isometric projection (±30° axes) with three-face shading per solid
 * — no drop shadows, no gradients that would flatten. Palettes control
 * the top / left / right face colors so the same shape reads differently
 * per category.
 */

const ISO = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) } // (√3/2, 1/2)

type Vec = [number, number, number]
function project(cx: number, cy: number, s: number, v: Vec): [number, number] {
  const [x, y, z] = v
  return [
    cx + (x - y) * ISO.x * s,
    cy + (x + y) * ISO.y * s - z * s,
  ]
}
const p = (cx: number, cy: number, s: number) => (v: Vec) =>
  project(cx, cy, s, v).map(n => n.toFixed(2)).join(',')

function cube(
  cx: number, cy: number, s: number,
  pos: Vec, sizeVec: [number, number, number],
  face: { top: string; left: string; right: string },
  key: string,
): React.ReactNode {
  const [x, y, z] = pos
  const [sx, sy, sz] = sizeVec
  const q = p(cx, cy, s)
  const c000: Vec = [x,      y,      z]
  const c100: Vec = [x + sx, y,      z]
  const c010: Vec = [x,      y + sy, z]
  const c110: Vec = [x + sx, y + sy, z]
  const c001: Vec = [x,      y,      z + sz]
  const c101: Vec = [x + sx, y,      z + sz]
  const c011: Vec = [x,      y + sy, z + sz]
  const c111: Vec = [x + sx, y + sy, z + sz]

  const leftFace  = `M ${q(c010)} L ${q(c110)} L ${q(c111)} L ${q(c011)} Z`
  const rightFace = `M ${q(c100)} L ${q(c110)} L ${q(c111)} L ${q(c101)} Z`
  const topFace   = `M ${q(c001)} L ${q(c101)} L ${q(c111)} L ${q(c011)} Z`

  return (
    <G key={key}>
      <Path d={leftFace}  fill={face.left}  />
      <Path d={rightFace} fill={face.right} />
      <Path d={topFace}   fill={face.top}   />
    </G>
  )
}

// ─────────────────────────────────────────────────────────────
// Palettes — top, left, right per solid
// ─────────────────────────────────────────────────────────────
export type IsoPalette = 'green' | 'brand' | 'gold' | 'silver'

type FaceSet = { top: string; left: string; right: string }
const PALETTES: Record<IsoPalette, FaceSet[]> = {
  green:  [
    { top: '#3EE58E', left: '#1EB56E', right: '#0F7A48' },
    { top: '#22C275', left: '#158B54', right: '#0B5535' },
    { top: '#8CE0B0', left: '#4DB682', right: '#2C8858' },
    { top: '#0F7A48', left: '#0B5535', right: '#083A24' },
  ],
  brand:  [
    { top: '#5E7538', left: '#3A4429', right: '#2C3420' },
    { top: '#DAA92F', left: '#C0921F', right: '#8A6A12' },
    { top: '#6E8A3F', left: '#4A5636', right: '#2C3420' },
    { top: '#2C3420', left: '#1E2116', right: '#0F100B' },
  ],
  gold:   [
    { top: '#FFDA75', left: '#F0B429', right: '#A07300' },
    { top: '#F0B429', left: '#B47600', right: '#6E4600' },
    { top: '#FFEDB3', left: '#F0CD65', right: '#A97F00' },
    { top: '#A07300', left: '#6E4600', right: '#3F2700' },
  ],
  silver: [
    { top: '#E7ECF2', left: '#B4BDC7', right: '#7C8794' },
    { top: '#CBD3DC', left: '#9BA5B0', right: '#6C7583' },
    { top: '#F5F7FA', left: '#D6DCE3', right: '#A2AAB4' },
    { top: '#7C8794', left: '#5F6773', right: '#3C424B' },
  ],
}

// ─────────────────────────────────────────────────────────────
// GroundShadow — subtle ellipse under any composition
// ─────────────────────────────────────────────────────────────
function GroundShadow({ cx, cy, s, w = 3.2, h = 1.1 }: {
  cx: number; cy: number; s: number; w?: number; h?: number
}) {
  const rx = s * w
  const ry = s * h
  return (
    <>
      <Defs>
        <LinearGradient id="iso-ground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#iso-ground)" />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Variant: 'chart-up' — three ascending iso bars (growth)
// ─────────────────────────────────────────────────────────────
function ChartUpArt({ size, palette }: { size: number; palette: IsoPalette }) {
  const s = size / 5.4
  const cx = size / 2
  const cy = size * 0.65        // was 0.80, anchor higher on the canvas
  const pal = PALETTES[palette]

  const bars = [
    { pos: [0, 0, 0] as Vec, size: [1, 1, 1.4] as [number, number, number], face: pal[2] },
    { pos: [1, 0, 0] as Vec, size: [1, 1, 2.1] as [number, number, number], face: pal[0] },
    { pos: [2, 0, 0] as Vec, size: [1, 1, 2.7] as [number, number, number], face: pal[1] },
  ]

  const originX = cx - 1.5 * ISO.x * s

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <GroundShadow cx={cx} cy={cy + s * 1.3} s={s} w={2.4} h={0.55} />
      {bars
        .map((b, i) => ({ b, key: `b${i}`, depth: b.pos[0] + b.pos[1] }))
        .sort((a, z) => a.depth - z.depth)
        .map(({ b, key }) => cube(originX, cy, s, b.pos, b.size, b.face, key))}
    </Svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Variant: 'stack' — 4 cubes in a stepped-L
// ─────────────────────────────────────────────────────────────
function StackArt({ size, palette }: { size: number; palette: IsoPalette }) {
  const s = size / 4.8
  const cx = size / 2
  const cy = size * 0.48        // was 0.62, anchor higher on the canvas
  const pal = PALETTES[palette]

  const specs: { pos: Vec; face: FaceSet }[] = [
    { pos: [0, 1, 0], face: pal[0] },
    { pos: [1, 0, 0], face: pal[1] },
    { pos: [0, 0, 1], face: pal[2] },
    { pos: [1, 1, 0], face: pal[3] },
  ]

  // Composition spans 2 units × 2 units on the ground plus 1 unit high.
  // Iso-project the centroid to figure out where to plant it on the canvas.
  const originX = cx - 0 * ISO.x * s // Composition is roughly symmetric around (1, 0.5): good enough
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <GroundShadow cx={cx + s * 0.3} cy={cy + s * 1.7} s={s} w={2.4} h={0.7} />
      {specs
        .map((sp, i) => ({ sp, key: `c${i}`, depth: sp.pos[0] + sp.pos[1] + sp.pos[2] }))
        .sort((a, b) => a.depth - b.depth)
        .map(({ sp, key }) => cube(originX, cy, s, sp.pos, [1, 1, 1], sp.face, key))}
    </Svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Variant: 'document' — flat wide iso slab with fold + ribbon lines
// ─────────────────────────────────────────────────────────────
function DocumentArt({ size, palette }: { size: number; palette: IsoPalette }) {
  const s = size / 4.8
  const pal = PALETTES[palette]

  // Composition footprint = 3 × 3 units. Iso-project the centroid of the
  // top face to place the slab visually anchored higher in the canvas.
  const centroidIso = project(0, 0, s, [1.5, 1.5, 0.6])
  const cx = size / 2 - centroidIso[0]
  const cy = size * 0.40 - centroidIso[1]     // was 0.5, shift up

  const q = p(cx, cy, s)
  const body = { pos: [0, 0, 0] as Vec, size: [3, 3, 0.6] as [number, number, number], face: pal[0] }

  const foldA: Vec = [0.4, 3,   0.6]
  const foldB: Vec = [0.4, 2.0, 0.6]
  const foldC: Vec = [1.4, 3,   0.6]
  const foldPath = `M ${q(foldA)} L ${q(foldB)} L ${q(foldC)} Z`

  const lineFor = (yFrac: number) => {
    const y0: Vec = [0.55, 3 - yFrac * 2.2, 0.6]
    const y1: Vec = [2.55, 3 - yFrac * 2.2, 0.6]
    return `M ${q(y0)} L ${q(y1)}`
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <GroundShadow cx={size / 2} cy={size * 0.72} s={s} w={2.2} h={0.55} />
      {cube(cx, cy, s, body.pos, body.size, body.face, 'body')}
      <Path d={foldPath}     fill={pal[3].top}    opacity={0.9} />
      <Path d={lineFor(0.72)} stroke={pal[3].right} strokeWidth={1.6} opacity={0.7} />
      <Path d={lineFor(0.55)} stroke={pal[3].right} strokeWidth={1.6} opacity={0.7} />
      <Path d={lineFor(0.35)} stroke={pal[3].right} strokeWidth={1.6} opacity={0.7} />
    </Svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Variant: 'coins' — stack of iso coins (three thick discs)
// ─────────────────────────────────────────────────────────────
function CoinsArt({ size, palette }: { size: number; palette: IsoPalette }) {
  const s = size / 5.2
  const cx = size / 2
  const pal = PALETTES[palette]

  const R  = s * 2.15
  const Ry = R * 0.42
  const t  = s * 0.62           // coin thickness
  const step = t

  // Bottom coin's TOP surface Y — everything else stacks above.
  const bottomTopY = size * 0.68 - t          // was 0.80, shift stack up
  const bottomBotY = bottomTopY + t

  function drawCoin(topY: number, face: FaceSet, key: string) {
    const botY = topY + t
    // Side wall — arc bottom + arc top, closed. Bottom half of the bottom ellipse
    // is what you actually see as the coin's edge.
    const sidePath =
      `M ${cx - R} ${topY} ` +
      `L ${cx - R} ${botY} ` +
      `A ${R} ${Ry} 0 0 0 ${cx + R} ${botY} ` +
      `L ${cx + R} ${topY} ` +
      `A ${R} ${Ry} 0 0 1 ${cx - R} ${topY} Z`
    return (
      <G key={key}>
        <Path d={sidePath} fill={face.right} />
        <Ellipse cx={cx} cy={topY} rx={R} ry={Ry} fill={face.top} />
        <Ellipse
          cx={cx} cy={topY} rx={R * 0.72} ry={Ry * 0.72}
          fill="none" stroke={face.left} strokeWidth={1.4} opacity={0.6}
        />
      </G>
    )
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <GroundShadow cx={cx} cy={bottomBotY + s * 0.4} s={s} w={2.4} h={0.6} />
      {drawCoin(bottomTopY,                pal[0], 'c0')}
      {drawCoin(bottomTopY - step,         pal[1], 'c1')}
      {drawCoin(bottomTopY - step * 2,     pal[2], 'c2')}
    </Svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export type IsoVariant = 'chart-up' | 'stack' | 'document' | 'coins'

interface Props {
  variant?: IsoVariant
  palette?: IsoPalette
  size?:    number
}

export function IsometricCubes({ variant = 'stack', palette = 'green', size = 72 }: Props) {
  switch (variant) {
    case 'chart-up': return <ChartUpArt size={size} palette={palette} />
    case 'document': return <DocumentArt size={size} palette={palette} />
    case 'coins':    return <CoinsArt    size={size} palette={palette} />
    case 'stack':
    default:         return <StackArt    size={size} palette={palette} />
  }
}
