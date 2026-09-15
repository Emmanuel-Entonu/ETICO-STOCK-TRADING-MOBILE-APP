import Svg, { Path } from 'react-native-svg'
import { generateSparklinePath } from '@/lib/sparkline'
import { colors } from '@/theme'

export function MiniSparkline({
  symbol,
  isUp,
  width = 68,
  height = 26,
}: {
  symbol: string
  isUp: boolean
  width?: number
  height?: number
}) {
  const d = generateSparklinePath(symbol, isUp, width, height)
  const stroke = isUp ? colors.positive : colors.negative
  return (
    <Svg width={width} height={height}>
      <Path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
