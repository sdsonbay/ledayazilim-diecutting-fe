/* eslint-disable react-hooks/refs --
 * Jest durumu ref'lerde; RNGH geri çağrıları (render dışında, JS iş parçacığında) okur-yazar. */
import { useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg'
import { normalizeAngle, printFrameSvg, withScale, type Size } from '../../lib/printMap'
import type { PrintTransform } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import type { ViewBox } from './ZoomSurface'

type Mode = 'move' | 'resize' | 'rotate'

interface DragState {
  mode: Mode
  start: PrintTransform
  /** Başlangıç noktası (SVG birimi). */
  x: number
  y: number
  /** Çerçeve merkezi ve merkeze uzaklık / açı (boyutlandırma ve döndürme için). */
  cx: number
  cy: number
  dist: number
  angle: number
}

/** Tutamak boyutları ekran pikseli cinsinden (yakınlaştırmada sabit kalır). */
const HANDLE_PX = 7
const HIT_PX = 18
const ROTATE_ARM_PX = 28
const SNAP_PX = 6
const SNAP_DEG = 4

/**
 * Baskı görselini tuval üzerinde düzenler: içinden sürükle → taşı, köşe → oranı koruyarak
 * boyutlandır, üstteki tutamak → döndür; dokunmatikte iki parmakla büyüt / döndür.
 * Merkez çizgilerine ve 15°'lik açılara yapışır.
 */
export const PrintEditLayer = ({
  view,
  size,
  bounds,
  transform,
  onChange,
}: {
  view: ViewBox
  size: Size
  bounds: Size
  transform: PrintTransform
  onChange: (next: PrintTransform) => void
}) => {
  const { colors } = useTheme()
  const drag = useRef<DragState | null>(null)
  const pinchStart = useRef<PrintTransform | null>(null)
  const rotateStart = useRef<PrintTransform | null>(null)
  // Jest geri çağrıları her zaman en güncel dönüşümü görsün.
  const live = useRef(transform)
  live.current = transform

  const upp = view.w / size.width
  const frame = printFrameSvg(bounds, transform)
  const rotateKnob = frame.at(0, -frame.hh - ROTATE_ARM_PX * upp)

  const toSvg = (px: number, py: number) => ({ x: view.x + px * upp, y: view.y + py * upp })

  const hitTest = (x: number, y: number): Mode | null => {
    const f = printFrameSvg(bounds, live.current)
    const knob = f.at(0, -f.hh - ROTATE_ARM_PX * upp)
    const r = HIT_PX * upp
    const near = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y) <= r
    if (near(knob)) return 'rotate'
    if (f.corners.some(near)) return 'resize'
    // Döndürülmüş dikdörtgenin içi mi?
    const rad = (-live.current.rotation * Math.PI) / 180
    const dx = x - f.center.x
    const dy = y - f.center.y
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
    return Math.abs(lx) <= f.hw && Math.abs(ly) <= f.hh ? 'move' : null
  }

  const snapAngle = (deg: number) => {
    const n = Math.round(deg / 15) * 15
    return normalizeAngle(Math.abs(deg - n) <= SNAP_DEG ? n : deg)
  }

  // Elle etkinleştirme: dokunuş görselin ya da bir tutamağın üstünde değilse jest hemen
  // vazgeçer; böylece telefonda sayfa kaydırması ve iki parmak jestleri engellenmez.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .manualActivation(true)
    .onTouchesDown((e, manager) => {
      const touch = e.allTouches[0]
      if (e.numberOfTouches !== 1 || !touch) {
        drag.current = null
        manager.fail()
        return
      }
      const p = toSvg(touch.x, touch.y)
      const mode = hitTest(p.x, p.y)
      if (!mode) {
        drag.current = null
        manager.fail()
        return
      }
      const f = printFrameSvg(bounds, live.current)
      drag.current = {
        mode,
        start: live.current,
        x: p.x,
        y: p.y,
        cx: f.center.x,
        cy: f.center.y,
        dist: Math.max(1e-6, Math.hypot(p.x - f.center.x, p.y - f.center.y)),
        angle: Math.atan2(p.y - f.center.y, p.x - f.center.x),
      }
      manager.activate()
    })
    .onUpdate((e) => {
      const d = drag.current
      if (!d) return
      const p = toSvg(e.x, e.y)
      const s = d.start
      if (d.mode === 'move') {
        const snap = SNAP_PX * upp
        let ox = s.offsetX + (p.x - d.x)
        let oy = s.offsetY - (p.y - d.y)
        if (Math.abs(ox) < snap) ox = 0
        if (Math.abs(oy) < snap) oy = 0
        onChange({ ...s, offsetX: ox, offsetY: oy })
        return
      }
      const { cx, cy } = d
      if (d.mode === 'resize') {
        const dist = Math.hypot(p.x - cx, p.y - cy)
        onChange(withScale(s, (s.scale * dist) / d.dist))
        return
      }
      const angle = Math.atan2(p.y - cy, p.x - cx)
      onChange({ ...s, rotation: snapAngle(s.rotation + ((angle - d.angle) * 180) / Math.PI) })
    })
    .onFinalize(() => {
      drag.current = null
    })


  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchStart.current = live.current
    })
    .onUpdate((e) => {
      const s = pinchStart.current
      if (!s) return
      // Döndürme jesti aynı anda dönüşümü güncelliyor olabilir; yalnız ölçeği değiştir.
      onChange(withScale(live.current, s.scale * e.scale))
    })
  const rotation = Gesture.Rotation()
    .runOnJS(true)
    .onStart(() => {
      rotateStart.current = live.current
    })
    .onUpdate((e) => {
      const s = rotateStart.current
      if (!s) return
      onChange({ ...live.current, rotation: snapAngle(s.rotation + (e.rotation * 180) / Math.PI) })
    })

  const gesture = Gesture.Simultaneous(pan, pinch, rotation)
  const sw = 1.5 * upp
  const corners = frame.corners.map((c) => `${c.x},${c.y}`).join(' ')
  const centered = transform.offsetX === 0 && transform.offsetY === 0
  const guide = colors.accent

  return (
    <GestureDetector gesture={gesture}>
      <View style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ cursor: 'move' } as object) : null]} collapsable={false}>
        <Svg width={size.width} height={size.height} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} pointerEvents="none">
          {centered ? (
            <Path
              d={`M${frame.center.x} ${view.y}V${view.y + view.h}M${view.x} ${frame.center.y}H${view.x + view.w}`}
              stroke={guide}
              strokeWidth={upp}
              strokeDasharray={`${4 * upp} ${4 * upp}`}
              opacity={0.45}
            />
          ) : null}
          <Polygon points={corners} fill="none" stroke={guide} strokeWidth={sw} />
          <Line x1={frame.topMid.x} y1={frame.topMid.y} x2={rotateKnob.x} y2={rotateKnob.y} stroke={guide} strokeWidth={sw} />
          {frame.corners.map((c, i) => (
            <Circle key={i} cx={c.x} cy={c.y} r={HANDLE_PX * upp} fill={colors.surface} stroke={guide} strokeWidth={sw * 1.3} />
          ))}
          <Circle cx={rotateKnob.x} cy={rotateKnob.y} r={HANDLE_PX * upp} fill={guide} stroke={colors.surface} strokeWidth={sw} />
        </Svg>
      </View>
    </GestureDetector>
  )
}
