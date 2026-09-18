// Beams — Skia reimplementation.
//
// The original React Bits <Beams/> ran three.js on @react-three/fiber/native
// backed by expo-gl. That GL path is unreliable on iOS (especially under the
// New Architecture), so the beams silently failed to render there. This version
// draws the same look — animated gold light-beams over a near-black card with
// brand-green valleys — with a react-native-skia runtime shader (SkSL), which
// renders reliably on iOS + Android and needs no GL context.
//
// Props are kept identical to the old component so callers don't change.

import { FC, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia'
import { useSharedValue, useFrameCallback, useDerivedValue } from 'react-native-reanimated'

interface BeamsProps {
  beamWidth?: number
  beamHeight?: number
  beamNumber?: number
  lightColor?: string
  beamColor?: string
  backgroundColor?: string
  ambientColor?: string
  ambientIntensity?: number
  speed?: number
  noiseIntensity?: number
  scale?: number
  rotation?: number
  style?: object
}

const hexToRgb = (hex: string): [number, number, number] => {
  const c = hex.replace('#', '')
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ]
}

// SkSL: flowing vertical beams, rotated, coloured bg -> green -> gold by brightness.
const source = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float  iTime;
uniform float  uSpeed;
uniform float  uBeams;
uniform float  uRotation;
uniform float  uNoiseIntensity;
uniform float3 uBg;
uniform float3 uGreen;
uniform float3 uGold;

float hash(float2 p){ return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float vnoise(float2 p){
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(float2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.0; a = a * 0.5; }
  return v;
}

half4 main(float2 fragCoord){
  float2 uv = fragCoord / iResolution;
  float2 p = uv - 0.5;
  p.x = p.x * (iResolution.x / iResolution.y);
  float c = cos(uRotation);
  float s = sin(uRotation);
  p = float2(p.x * c - p.y * s, p.x * s + p.y * c);

  float band = p.x * uBeams;
  float bi = floor(band);
  float bf = fract(band);

  float flow = fbm(float2(bi * 1.7, p.y * 2.5 - iTime * uSpeed * 0.3));
  float across = smoothstep(0.06, 0.5, bf) * smoothstep(0.94, 0.5, bf);
  float bright = across * (0.30 + 0.85 * flow);

  float grain = (hash(fragCoord * 0.7 + iTime) - 0.5) * uNoiseIntensity * 0.12;
  bright = clamp(bright + grain, 0.0, 1.0);

  float3 col = mix(uBg, uGreen, smoothstep(0.0, 0.55, bright));
  col = mix(col, uGold, smoothstep(0.55, 1.0, bright));
  return half4(col.r, col.g, col.b, 1.0);
}
`)!

const Beams: FC<BeamsProps> = ({
  beamNumber = 12,
  lightColor = '#ffffff',
  backgroundColor = '#000000',
  ambientColor = '#ffffff',
  speed = 2,
  noiseIntensity = 1.75,
  rotation = 0,
  style,
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const time = useSharedValue(0)
  useFrameCallback((info) => {
    "worklet"
    time.value = info.timeSinceFirstFrame / 1000
  })

  // Precompute everything on the JS thread. `useDerivedValue` runs its body as a
  // Reanimated WORKLET on the UI runtime, where calling a plain JS function like
  // hexToRgb() (or touching any non-shareable value) throws on iOS/JSI — that's
  // what made the beams silently fall back to the gradient on iOS. The worklet
  // now only reads plain numbers/arrays + the shared `time`.
  const uBg = useMemo(() => hexToRgb(backgroundColor), [backgroundColor])
  const uGreen = useMemo(() => hexToRgb(ambientColor), [ambientColor])
  const uGold = useMemo(() => hexToRgb(lightColor), [lightColor])
  const uBeams = Math.max(1, beamNumber / 2)
  const uRotation = (rotation * Math.PI) / 180

  const uniforms = useDerivedValue(() => ({
    iResolution: [size.width || 1, size.height || 1],
    iTime: time.value,
    uSpeed: speed,
    uBeams,
    uRotation,
    uNoiseIntensity: noiseIntensity,
    uBg,
    uGreen,
    uGold,
  }))

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
      }}
    >
      {size.width > 0 && source ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={source} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  )
}

export default Beams
