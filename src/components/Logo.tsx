import { View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { useTheme } from '../theme/ThemeContext'
import { fonts } from '../theme/tokens'
import { Text } from './ui/Text'

/** Marka işareti: kartondan kesilmiş "L" — üst köşesi kırımdan katlanmış, gövdede kırım çizgisi. Kaynak: assets/brand/mark.svg */
export const LogoMark = ({ size = 28 }: { size?: number }) => {
  const { colors } = useTheme()
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Leda Diecutting">
      <Rect x={0} y={0} width={1024} height={1024} rx={288} fill={colors.primary} />
      <Path d="M312 232H372L492 352V622H712V792H312Z" fill={colors.accent} stroke={colors.accent} strokeWidth={10} strokeLinejoin="round" />
      <Path d="M372 232L492 352H372Z" fill={colors.onPrimary} stroke={colors.onPrimary} strokeWidth={10} strokeLinejoin="round" />
      <Path d="M492 640V774" stroke={colors.onPrimary} strokeWidth={16} strokeLinecap="round" strokeDasharray="26 30" opacity={0.85} />
    </Svg>
  )
}

export const Logo = ({ compact = false }: { compact?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <LogoMark />
    {compact ? null : (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.4 }}>Leda</Text>
        <Text style={{ fontFamily: fonts.displayItalic, fontSize: 19, letterSpacing: -0.2 }} tone="soft">
          Diecutting
        </Text>
      </View>
    )}
  </View>
)
