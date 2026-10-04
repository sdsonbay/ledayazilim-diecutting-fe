import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { wheelZooms } from '../../lib/wheel'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

const MAX_ZOOM = 10

/**
 * Yakınlaştırılabilir vektör yüzeyi.
 * Hareket sırasında ucuz bir transform uygulanır; hareket bitince sonuç viewBox'a işlenip
 * transform sıfırlanır — böylece SVG her yakınlaşmada keskin yeniden çizilir.
 */
export const ZoomSurface = ({
  content,
  children,
  resetKey,
  interactive = true,
  gestures = true,
}: {
  /** İçeriğin tam görünümü (birim cinsinden). */
  content: ViewBox
  /** Ekrana sığdırılmış viewBox'ı alır, çizimi döndürür. */
  children: (viewBox: ViewBox, size: { width: number; height: number }) => ReactNode
  /** Değişince görünüm tam boy'a döner. */
  resetKey?: string
  interactive?: boolean
  /** false: dokunma/sürükleme içeriğe bırakılır (ör. baskı düzenleme); tekerlekle yakınlaşma sürer. */
  gestures?: boolean
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const contentKey = `${resetKey ?? ''}|${content.x}|${content.y}|${content.w}|${content.h}`
  // Kullanıcı görünümü yalnızca aynı içerik için geçerli; içerik değişince tam boy'a döner.
  const [zoomed, setZoomed] = useState<{ key: string; box: ViewBox } | null>(null)
  const view = zoomed?.key === contentKey ? zoomed.box : null
  const setView = (box: ViewBox | null) => setZoomed(box ? { key: contentKey, box } : null)
  const hostRef = useRef<View>(null)
  const scale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const saved = useSharedValue({ s: 1, x: 0, y: 0 })

  const fitted = (): ViewBox => {
    const { width: W, height: H } = size
    if (!W || !H) return content
    const k = Math.min(W / content.w, H / content.h) * 0.92
    const w = W / k
    const h = H / k
    return { x: content.x - (w - content.w) / 2, y: content.y - (h - content.h) / 2, w, h }
  }

  const current = view ?? fitted()
  const fullW = fitted().w

  const commit = (s: number, x: number, y: number) => {
    const { width: W, height: H } = size
    if (!W || !H) return
    const k = W / current.w
    // Yeni ekran dikdörtgeninin eski ekran koordinatlarındaki karşılığı → birim.
    const ox = (0 - W / 2 - x) / s + W / 2
    const oy = (0 - H / 2 - y) / s + H / 2
    let w = W / (s * k)
    w = Math.min(fullW, Math.max(fullW / MAX_ZOOM, w))
    const h = (w * H) / W
    const next = { x: current.x + ox / k, y: current.y + oy / k, w, h }
    setView(Math.abs(w - fullW) < 1e-6 && s <= 1 ? null : next)
  }

  const reset = () => setView(null)

  const finish = () => {
    'worklet'
    const s = scale.value
    const x = tx.value
    const y = ty.value
    scale.value = 1
    tx.value = 0
    ty.value = 0
    runOnJS(commit)(s, x, y)
  }

  const touch = interactive && gestures
  const pinch = Gesture.Pinch()
    .enabled(touch)
    .onStart(() => {
      saved.value = { s: scale.value, x: tx.value, y: ty.value }
    })
    .onUpdate((e) => {
      const s = saved.value.s * e.scale
      const fx = e.focalX - size.width / 2
      const fy = e.focalY - size.height / 2
      scale.value = s
      tx.value = fx - (fx - saved.value.x) * e.scale
      ty.value = fy - (fy - saved.value.y) * e.scale
    })
    .onEnd(finish)

  const pan = Gesture.Pan()
    .enabled(touch)
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      saved.value = { s: scale.value, x: tx.value, y: ty.value }
    })
    .onUpdate((e) => {
      tx.value = saved.value.x + e.translationX
      ty.value = saved.value.y + e.translationY
    })
    .onEnd(finish)

  const doubleTap = Gesture.Tap()
    .enabled(touch)
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(reset)()
    })

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap)

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }))

  // Web: tekerlek / trackpad ile imleç merkezli yakınlaştırma.
  useEffect(() => {
    if (Platform.OS !== 'web' || !interactive) return
    const el = hostRef.current as unknown as HTMLElement | null
    if (!el?.addEventListener) return
    const onWheel = (e: WheelEvent) => {
      if (!wheelZooms(e, el)) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
      const fx = e.clientX - rect.left - rect.width / 2
      const fy = e.clientY - rect.top - rect.height / 2
      commit(factor, fx - fx * factor, fy - fy * factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={hostRef}
        style={styles.host}
        onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        collapsable={false}
      >
        {size.width > 0 ? (
          <Animated.View style={[StyleSheet.absoluteFill, animated]}>{children(current, size)}</Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: 'hidden' },
})
