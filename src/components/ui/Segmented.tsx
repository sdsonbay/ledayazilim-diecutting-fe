import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, motion, radius } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { ScalePressable } from './Pressable'
import { Text } from './Text'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: IconName
  badge?: string
}

/** Kayan göstergeli segment kontrolü. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const segment = width / Math.max(options.length, 1)
  const indicator = useAnimatedStyle(() => ({
    width: segment - 6,
    transform: [{ translateX: withSpring(index * segment + 3, motion.spring) }],
  }))
  const height = size === 'sm' ? 34 : 40
  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.surfaceAlt, height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {width > 0 ? <Animated.View style={[styles.indicator, { backgroundColor: colors.surface, height: height - 6, shadowColor: colors.shadow }, indicator]} /> : null}
      {options.map((option) => {
        const selected = option.value === value
        return (
          <ScalePressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            haptic
            scaleTo={0.95}
            style={styles.item}
          >
            <View style={styles.row}>
              {option.icon ? <Icon name={option.icon} size={14} color={selected ? colors.ink : colors.muted} /> : null}
              <Text
                style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: size === 'sm' ? 12 : 13 }}
                color={selected ? colors.ink : colors.muted}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {option.badge ? (
                <Text style={{ fontFamily: fonts.semibold, fontSize: 10 }} color={colors.accent}>
                  {option.badge}
                </Text>
              ) : null}
            </View>
          </ScalePressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: radius.pill, padding: 0, alignItems: 'center' },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 3,
    borderRadius: radius.pill,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
