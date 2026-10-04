import { View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { useTheme } from '../theme/ThemeContext'
import { fonts } from '../theme/tokens'
import { Text } from './ui/Text'

/** Marka işareti: ters kapaklı kutu açılımı — kırmızı kesim, kesikli kırımlar. */
export const LogoMark = ({ size = 28 }: { size?: number }) => {
  const { colors } = useTheme()
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Leda Diecutting">
      <Rect x={0} y={0} width={32} height={32} rx={9} fill={colors.primary} />
      <Path d="M10 12V22M16 12V22M22 12V22M10 12H22M22 22H28M4 22H10" stroke={colors.onPrimary} strokeWidth={1} strokeDasharray="1.3 1" strokeLinecap="round" opacity={0.75} transform="translate(0 -1)" />
      <Path d="M4 12H10V7L11 6H15L16 7V9.5H21L22 10.5V12H28V27L27 28H23L22 27V22H10V24.5L9 25.5H5L4 24.5Z" fill="none" stroke={colors.accent} strokeWidth={1.6} strokeLinejoin="round" transform="translate(0 -1)" />
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
