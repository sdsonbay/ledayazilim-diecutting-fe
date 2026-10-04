import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { ScalePressable } from './Pressable'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  disabled?: boolean
  full?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

const HEIGHT: Record<ButtonSize, number> = { sm: 34, md: 44, lg: 54 }
const PAD: Record<ButtonSize, number> = { sm: 12, md: 18, lg: 24 }
const FONT: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 }

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  full,
  style,
  accessibilityLabel,
}: ButtonProps) => {
  const { colors } = useTheme()
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    accent: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
    secondary: { bg: colors.surfaceAlt, fg: colors.ink, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.ink, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  }[variant]
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      haptic
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PAD[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Icon name={icon} size={FONT[size] + 2} color={palette.fg} />
        ) : null}
        <Text style={{ fontFamily: fonts.semibold, fontSize: FONT[size], letterSpacing: -0.2 }} color={palette.fg} numberOfLines={1}>
          {label}
        </Text>
        {iconRight && !loading ? <Icon name={iconRight} size={FONT[size] + 2} color={palette.fg} /> : null}
      </View>
    </ScalePressable>
  )
}

export const IconButton = ({
  icon,
  onPress,
  label,
  variant = 'secondary',
  size = 40,
  active,
}: {
  icon: IconName
  onPress?: () => void
  label: string
  variant?: 'secondary' | 'ghost' | 'primary'
  size?: number
  active?: boolean
}) => {
  const { colors } = useTheme()
  const bg = active ? colors.primary : variant === 'primary' ? colors.primary : variant === 'ghost' ? 'transparent' : colors.surfaceAlt
  const fg = active || variant === 'primary' ? colors.onPrimary : colors.ink
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      haptic
      scaleTo={0.9}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={fg} />
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
