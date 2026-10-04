import * as Haptics from 'expo-haptics'
import { forwardRef, useState } from 'react'
import { Platform, Pressable as RNPressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { motion } from '../../theme/tokens'

const APressable = Animated.createAnimatedComponent(RNPressable)

type StyleInput = StyleProp<ViewStyle> | ((state: PressableStateCallbackType & { hovered?: boolean }) => StyleProp<ViewStyle>)

export interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleInput
  /** Basılınca küçülme oranı. */
  scaleTo?: number
  haptic?: boolean
  /** Web'de fare üzerindeyken hafif yükselme. */
  hoverLift?: boolean
}

/**
 * Tüm dokunulabilir yüzeylerin ortak hissi: yaylı küçülme + hafif dokunsal geri bildirim.
 * Not: Animated bileşen fonksiyon stilini desteklemez; durum burada izlenip stil çözülerek verilir.
 */
export const ScalePressable = forwardRef<View, ScalePressableProps>(
  ({ scaleTo = 0.97, haptic = false, hoverLift = false, onPressIn, onPressOut, onPress, onHoverIn, onHoverOut, style, disabled, ...rest }, ref) => {
    const scale = useSharedValue(1)
    const lift = useSharedValue(0)
    const [hovered, setHovered] = useState(false)
    const [pressed, setPressed] = useState(false)
    const animated = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }, { translateY: lift.value }],
    }))
    const resolved = typeof style === 'function' ? style({ pressed, hovered }) : style
    return (
      <APressable
        ref={ref}
        {...rest}
        disabled={disabled}
        onPressIn={(e) => {
          setPressed(true)
          scale.value = withSpring(scaleTo, motion.spring)
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          setPressed(false)
          scale.value = withSpring(1, motion.spring)
          onPressOut?.(e)
        }}
        onPress={(e) => {
          if (haptic && Platform.OS !== 'web') void Haptics.selectionAsync()
          onPress?.(e)
        }}
        onHoverIn={(e) => {
          setHovered(true)
          if (hoverLift) lift.value = withSpring(-3, motion.springSoft)
          onHoverIn?.(e)
        }}
        onHoverOut={(e) => {
          setHovered(false)
          if (hoverLift) lift.value = withSpring(0, motion.springSoft)
          onHoverOut?.(e)
        }}
        style={[
          resolved,
          animated,
          disabled ? { opacity: 0.45 } : null,
          Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as ViewStyle) : null,
        ]}
      />
    )
  },
)
ScalePressable.displayName = 'ScalePressable'
