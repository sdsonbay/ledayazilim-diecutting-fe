import { StyleSheet, View } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { motion } from '../../theme/tokens'
import { ScalePressable } from './Pressable'
import { Text } from './Text'

export const Toggle = ({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) => {
  const { colors } = useTheme()
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, motion.spring))
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.lineStrong, colors.ink]),
  }))
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 18 }] }))
  return (
    <ScalePressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      haptic
      scaleTo={0.98}
      style={styles.row}
    >
      {label ? (
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{label}</Text>
          {hint ? (
            <Text variant="small" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, { backgroundColor: colors.surface }, knob]} />
      </Animated.View>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10 },
})
