import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { ScalePressable } from './Pressable'

export const Card = ({
  children,
  style,
  onPress,
  padded = true,
  accessibilityLabel,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  padded?: boolean
  accessibilityLabel?: string
}) => {
  const { colors } = useTheme()
  const base = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.line, padding: padded ? 18 : 0 },
    style,
  ]
  if (!onPress) return <View style={base}>{children}</View>
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.985} hoverLift style={base}>
      {children}
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
})
