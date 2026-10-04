import { useEffect, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { motion } from '../../theme/tokens'

const THUMB = 22

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Sürükleme bitince (ağır işler için). */
  onCommit?: (value: number) => void
  accessibilityLabel?: string
}

const quantize = (v: number, min: number, max: number, step: number) => {
  'worklet'
  const clamped = Math.min(max, Math.max(min, v))
  const q = Math.round((clamped - min) / step) * step + min
  return Math.round(q * 1e6) / 1e6
}

export const Slider = ({ value, min, max, step = 0.01, onChange, onCommit, accessibilityLabel }: SliderProps) => {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const x = useSharedValue(0)
  const active = useSharedValue(0)
  const span = Math.max(max - min, 1e-9)

  useEffect(() => {
    if (active.get() === 0 && width > 0) x.set(withSpring(((value - min) / span) * width, motion.spring))
  }, [value, min, span, width, x, active])

  const emit = (v: number) => onChange(v)
  const commit = (v: number) => onCommit?.(v)

  const update = (px: number) => {
    'worklet'
    const clampedPx = Math.min(width, Math.max(0, px))
    x.set(clampedPx)
    const v = quantize(min + (clampedPx / Math.max(width, 1)) * span, min, max, step)
    runOnJS(emit)(v)
    return v
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      active.set(withSpring(1, motion.spring))
      update(e.x)
    })
    .onUpdate((e) => {
      update(e.x)
    })
    .onFinalize((e) => {
      const v = update(e.x)
      active.set(withSpring(0, motion.spring))
      runOnJS(commit)(v)
    })

  const fill = useAnimatedStyle(() => ({ width: x.value }))
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - THUMB / 2 }, { scale: 1 + active.value * 0.18 }],
  }))

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.hit}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1
          const next = quantize(value + dir * Math.max(step, span / 20), min, max, step)
          onChange(next)
          onCommit?.(next)
        }}
      >
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.ink }, fill]} />
        </View>
        <Animated.View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.ink, shadowColor: colors.shadow }, thumb]} />
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
})
