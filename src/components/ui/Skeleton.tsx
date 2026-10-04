import { useEffect } from 'react'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

export const Skeleton = ({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue
  height?: DimensionValue
  rounded?: number
  style?: StyleProp<ViewStyle>
}) => {
  const { colors } = useTheme()
  const pulse = useSharedValue(0.5)
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [pulse])
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }))
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.skeleton }, animated, style]} />
}
