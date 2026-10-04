import { Text as RNText, type TextProps } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { type as typeScale, type Palette, type TypeVariant } from '../../theme/tokens'

export type TextTone = 'ink' | 'soft' | 'muted' | 'accent' | 'danger' | 'success' | 'onPrimary' | 'faint'

const toneColor = (tone: TextTone, c: Palette): string =>
  ({
    ink: c.ink,
    soft: c.inkSoft,
    muted: c.muted,
    faint: c.faint,
    accent: c.accent,
    danger: c.danger,
    success: c.success,
    onPrimary: c.onPrimary,
  })[tone]

export interface AppTextProps extends TextProps {
  variant?: TypeVariant
  tone?: TextTone
  align?: 'left' | 'center' | 'right'
  color?: string
}

export const Text = ({ variant = 'body', tone = 'ink', align, color, style, ...rest }: AppTextProps) => {
  const { colors } = useTheme()
  return (
    <RNText
      {...rest}
      style={[typeScale[variant], { color: color ?? toneColor(tone, colors) }, align ? { textAlign: align } : null, style]}
    />
  )
}
