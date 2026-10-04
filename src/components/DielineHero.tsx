import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { G, Path } from 'react-native-svg'
import { useTheme } from '../theme/ThemeContext'

const APath = Animated.createAnimatedComponent(Path)

// Ters kapaklı (reverse tuck) kutunun açılımı — 400×300 görünüm kutusu.
const CUT =
  'M60 110 L60 190 L84 196 L84 214 L100 214 L100 266 Q100 280 114 280 L156 280 Q170 280 170 266 L170 214 L176 214 L176 196 L250 196 L250 214 L262 214 L262 238 Q262 250 274 250 L316 250 Q328 250 328 238 L328 214 L340 214 L340 110 L328 110 L328 86 Q328 74 316 74 L274 74 Q262 74 262 86 L262 110 L250 110 L250 92 L176 92 L176 110 L170 110 L170 58 Q170 44 156 44 L114 44 Q100 44 100 58 L100 110 L84 110 L84 92 L60 104 Z'
const CREASE = [
  'M84 110 L84 196',
  'M100 110 L340 110',
  'M100 196 L340 196',
  'M170 110 L170 196',
  'M250 110 L250 196',
  'M100 110 L100 196',
  'M100 214 L170 214',
  'M262 110 L328 110',
  'M262 214 L328 214',
  'M176 196 L250 196',
]
const CUT_LEN = 1500
const CREASE_LEN = 260

/** Kendini çizen bıçak izi: önce kesim, ardından kırımlar; döngüde yavaşça yeniden çizilir. */
export const DielineHero = ({ height = 260 }: { height?: number }) => {
  const { colors } = useTheme()
  const cut = useSharedValue(CUT_LEN)
  const crease = useSharedValue(CREASE_LEN)

  useEffect(() => {
    const ease = Easing.bezier(0.65, 0, 0.35, 1)
    cut.value = withRepeat(
      withSequence(withTiming(0, { duration: 2600, easing: ease }), withDelay(5200, withTiming(0, { duration: 1 })), withTiming(CUT_LEN, { duration: 900, easing: ease })),
      -1,
    )
    crease.value = withRepeat(
      withSequence(
        withDelay(1700, withTiming(0, { duration: 1600, easing: ease })),
        withDelay(3600, withTiming(0, { duration: 1 })),
        withTiming(CREASE_LEN, { duration: 700, easing: ease }),
      ),
      -1,
    )
  }, [cut, crease])

  const cutProps = useAnimatedProps(() => ({ strokeDashoffset: cut.value }))
  const creaseProps = useAnimatedProps(() => ({ strokeDashoffset: crease.value }))

  return (
    <View style={{ height, aspectRatio: 400 / 300 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 400 300">
        <G opacity={0.9}>
          {CREASE.map((d) => (
            <APath
              key={d}
              d={d}
              stroke={colors.crease}
              strokeWidth={1.4}
              strokeDasharray={`${CREASE_LEN}`}
              animatedProps={creaseProps}
              strokeLinecap="round"
            />
          ))}
        </G>
        <APath
          d={CUT}
          fill="none"
          stroke={colors.cut}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeDasharray={`${CUT_LEN}`}
          animatedProps={cutProps}
        />
      </Svg>
    </View>
  )
}
