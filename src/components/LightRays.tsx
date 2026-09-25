import { useEffect, useState, type FC } from 'react'
import { AppState, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia'
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated'

// LightRays — React Bits <LightRays/> ported to React Native.
//
// The original draws with ogl into a DOM <canvas>; there is no DOM here, so the
// same fragment shader is translated to SkSL and drawn with Skia. Skia renders
// through Metal on iOS (not OpenGL), so there is no "GPU work while inactive"
// kill like the old three.js Beams — and we still pause whenever the app is
// inactive or the host screen is hidden. Mouse-follow is dropped (no cursor).
//
// iOS worklet rule: the frame callback + uniforms below only touch plain
// numbers / arrays captured as constants — never the `colors` proxy or plain JS
// functions.

export type RaysOrigin = 'top-center' | 'top-left' | 'top-right' | 'left' | 'right' | 'bottom-center' | 'bottom-left' | 'bottom-right'

interface Props {
  raysOrigin?: RaysOrigin
  raysColor?: string
  raysSpeed?: number
  lightSpread?: number
  rayLength?: number
  fadeDistance?: number
  saturation?: number
  noiseAmount?: number
  distortion?: number
  /** Stop animating (e.g. host screen not focused). */
  paused?: boolean
}

const SKSL = `
uniform float  iTime;
uniform float2 iResolution;
uniform float2 rayPos;
uniform float2 rayDir;
uniform float3 raysColor;
uniform float  raysSpeed;
uniform float  lightSpread;
uniform float  rayLength;
uniform float  fadeDistance;
uniform float  saturation;
uniform float  noiseAmount;
uniform float  distortion;

float noise(float2 st) {
  return fract(sin(dot(st, float2(12.9898, 78.233))) * 43758.5453123);
}

float rayStrength(float2 raySource, float2 rayRefDirection, float2 coord,
                  float seedA, float seedB, float speed) {
  float2 sourceToCoord = coord - raySource;
  float2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float dist = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - dist) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - dist) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0);
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor;
}

half4 main(float2 fragCoord) {
  // Skia's origin is top-left, which is what the original computes by flipping
  // GL's bottom-left y — so fragCoord is used directly.
  float2 coord = fragCoord;
  float r1 = rayStrength(rayPos, rayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  float r2 = rayStrength(rayPos, rayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
  float3 c = float3(r1 * 0.5 + r2 * 0.4);

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    c *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  c.r *= 0.1 + brightness * 0.8;
  c.g *= 0.3 + brightness * 0.6;
  c.b *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(c, float3(0.299, 0.587, 0.114));
    c = mix(float3(gray), c, saturation);
  }

  c *= raysColor;
  // Drawn over a black header: premultiplied output over black == rgb.
  return half4(half3(c), 1.0);
}
`

// Compiled once. Null if the device's Skia can't compile it → render nothing
// (the header stays plain black) instead of crashing.
const effect = Skia.RuntimeEffect.Make(SKSL)

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1]
}

const anchorAndDir = (origin: RaysOrigin, w: number, h: number): { anchor: [number, number]; dir: [number, number] } => {
  const outside = 0.2
  switch (origin) {
    case 'top-left': return { anchor: [0, -outside * h], dir: [0, 1] }
    case 'top-right': return { anchor: [w, -outside * h], dir: [0, 1] }
    case 'left': return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] }
    case 'right': return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] }
    case 'bottom-left': return { anchor: [0, (1 + outside) * h], dir: [0, -1] }
    case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] }
    case 'bottom-right': return { anchor: [w, (1 + outside) * h], dir: [0, -1] }
    default: return { anchor: [0.5 * w, -outside * h], dir: [0, 1] }
  }
}

const LightRays: FC<Props> = ({
  raysOrigin = 'top-center',
  raysColor = '#ffffff',
  raysSpeed = 1,
  lightSpread = 1,
  rayLength = 2,
  fadeDistance = 1,
  saturation = 1,
  noiseAmount = 0,
  distortion = 0,
  paused = false,
}) => {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height })
  }

  // Pause whenever the app isn't in the foreground (screenshots, app switcher,
  // calls, Control Centre) or the host asked us to.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'))
    return () => sub.remove()
  }, [])
  const running = !paused && appActive && size.w > 0

  // Time advances only while running (frame callback on the UI thread).
  const time = useSharedValue(0)
  const frame = useFrameCallback((info) => {
    'worklet'
    time.value += (info.timeSincePreviousFrame ?? 16) / 1000
  }, false)
  useEffect(() => { frame.setActive(running) }, [running, frame])

  // Constant uniforms computed on the JS side, captured by value below.
  const { anchor, dir } = anchorAndDir(raysOrigin, size.w, size.h)
  const res: [number, number] = [size.w || 1, size.h || 1]
  const color = hexToRgb(raysColor)
  const uniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: res,
    rayPos: anchor,
    rayDir: dir,
    raysColor: color,
    raysSpeed,
    lightSpread,
    rayLength,
    fadeDistance,
    saturation,
    noiseAmount,
    distortion,
  }))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {effect && size.w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  )
}

export default LightRays
