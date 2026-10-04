import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useAssetUri } from '../hooks/useAssetUri'
import { api } from '../lib/api'
import { useTheme } from '../theme/ThemeContext'
import { DielineHero } from './DielineHero'
import { FoldView } from './fold/FoldView'

const HERO_TEMPLATE = 'ecma-a20-20'
const HERO_VALUES = { length: 100, width: 50, height: 150 }

/**
 * Ana sayfa vitrini: markalı bir kutu düz bıçak izinden adım adım katlanır,
 * bekler, açılır — döngüde. 3D yüklenemezse çizilen bıçak izine düşer.
 */
export const HeroFold = ({ height }: { height: number }) => {
  const { colors } = useTheme()
  const artwork = useAssetUri(require('../../assets/hero-artwork.jpg'))
  const dieline = useQuery({
    queryKey: ['hero-dieline', HERO_TEMPLATE],
    queryFn: () => api.generate(HERO_TEMPLATE, HERO_VALUES),
    staleTime: Infinity,
  })
  const [target, setTarget] = useState(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hedefe varınca bekle ve yön değiştir: kapalıyken daha uzun dur.
  const onProgress = useCallback(
    (v: number) => {
      if (Math.abs(v - target) > 1e-3 || timer.current) return
      timer.current = setTimeout(
        () => {
          timer.current = null
          setTarget((t) => (t > 0.5 ? 0 : 1))
        },
        target > 0.5 ? 3200 : 1100,
      )
    },
    [target],
  )
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  if (dieline.isError) return <DielineHero height={height * 0.8} />
  return (
    <View style={[styles.host, { height }]}>
      {dieline.data && artwork ? (
        <Animated.View entering={FadeIn.duration(600)} style={StyleSheet.absoluteFill}>
          <FoldView
            dieline={dieline.data}
            fold={target}
            speed={0.3}
            substrate="white"
            background={colors.bg}
            printUri={artwork}
            light={1.15}
            onProgress={onProgress}
          />
        </Animated.View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { width: '100%', overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
