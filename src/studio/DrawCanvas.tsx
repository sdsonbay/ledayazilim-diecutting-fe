/* eslint-disable react-hooks/refs --
 * Çizim taslağı ref'i yalnızca jest geri çağrılarında (render dışında) okunur. */
import { useRef, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg'
import { useTheme } from '../theme/ThemeContext'
import { radius } from '../theme/tokens'
import {
  PAPER,
  dOf,
  hitStroke,
  isShapeTool,
  shapePoints,
  snapPoint,
  softStraighten,
  translateStroke,
  uid,
  type DrawTool,
  type Pt,
  type Stroke,
} from './drawGeometry'

interface Draft {
  tool: DrawTool
  start: Pt
  end: Pt
  moveId?: string
  last?: Pt
}

/**
 * Dokunmatik bıçak izi tuvali (420×300 mm kağıt).
 * Kesim/kırım: sürükleyerek düz çizgi (45° katlarına yumuşak hizalama).
 * Şekiller: sürükleyerek kutu. Seç: dokun seç, sürükle taşı.
 */
export const DrawCanvas = ({
  strokes,
  onCommit,
  tool,
  grid,
  cornerRadius,
  polySides,
  selectedId,
  onSelect,
  onInteract,
}: {
  strokes: Stroke[]
  onCommit: (next: Stroke[]) => void
  tool: DrawTool
  grid: boolean
  cornerRadius: number
  polySides: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Çizim sırasında sayfa kaydırmasını kapatmak için. */
  onInteract?: (active: boolean) => void
}) => {
  const { colors } = useTheme()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [moveDelta, setMoveDelta] = useState<Pt | null>(null)
  const draftRef = useRef<Draft | null>(null)

  const k = size.width > 0 ? Math.min(size.width / PAPER.width, size.height / PAPER.height) : 1
  const ox = (size.width - PAPER.width * k) / 2
  const oy = (size.height - PAPER.height * k) / 2
  const tolerance = 14 / k // ~14 piksel parmak toleransı
  const toPaper = (x: number, y: number): Pt => ({ x: (x - ox) / k, y: (y - oy) / k })
  const snapped = (x: number, y: number) => snapPoint(toPaper(x, y), strokes, grid, tolerance).point

  const begin = (x: number, y: number) => {
    const p = toPaper(x, y)
    if (tool === 'select') {
      const id = hitStroke(p, strokes, tolerance)
      onSelect(id)
      draftRef.current = id ? { tool, start: p, end: p, moveId: id } : null
      setDraft(draftRef.current)
      setMoveDelta(null)
      return
    }
    const start = snapped(x, y)
    draftRef.current = { tool, start, end: start }
    setDraft(draftRef.current)
  }

  const update = (x: number, y: number) => {
    const d = draftRef.current
    if (!d) return
    if (d.tool === 'select') {
      const p = toPaper(x, y)
      const step = grid ? 5 : 0.5
      setMoveDelta({ x: Math.round((p.x - d.start.x) / step) * step, y: Math.round((p.y - d.start.y) / step) * step })
      return
    }
    let end = snapped(x, y)
    if (d.tool === 'cut' || d.tool === 'crease') end = softStraighten(d.start, end)
    draftRef.current = { ...d, end }
    setDraft(draftRef.current)
  }

  const finish = () => {
    const d = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!d) return
    if (d.tool === 'select') {
      if (d.moveId && moveDelta && (moveDelta.x || moveDelta.y)) {
        onCommit(strokes.map((s) => (s.id === d.moveId ? translateStroke(s, moveDelta.x, moveDelta.y) : s)))
      }
      setMoveDelta(null)
      return
    }
    const len = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y)
    if (len < 2) return
    const stroke: Stroke =
      d.tool === 'cut' || d.tool === 'crease'
        ? { id: uid(), layer: d.tool, closed: false, points: [d.start, d.end] }
        : { id: uid(), layer: 'cut', closed: true, points: shapePoints(d.tool, d.start, d.end, cornerRadius, polySides) }
    onCommit([...strokes, stroke])
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      onInteract?.(true)
      begin(e.x, e.y)
    })
    .onUpdate((e) => update(e.x, e.y))
    .onFinalize(() => {
      finish()
      onInteract?.(false)
    })

  const preview: { d: string; layer: 'cut' | 'crease' } | null = draft && draft.tool !== 'select'
    ? draft.tool === 'cut' || draft.tool === 'crease'
      ? { d: dOf([draft.start, draft.end], false), layer: draft.tool }
      : isShapeTool(draft.tool)
        ? { d: dOf(shapePoints(draft.tool, draft.start, draft.end, cornerRadius, polySides), true), layer: 'cut' }
        : null
    : null

  const stroke = (layer: 'cut' | 'crease') => (layer === 'cut' ? colors.accent : colors.crease)
  const w = 1.8 / k

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.host, { backgroundColor: colors.stage }]}
        onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        collapsable={false}
      >
        {size.width > 0 ? (
          <Svg width={size.width} height={size.height}>
            <Defs>
              <Pattern id="grid" width={10 * k} height={10 * k} patternUnits="userSpaceOnUse" x={ox} y={oy}>
                <Path d={`M ${10 * k} 0 L 0 0 0 ${10 * k}`} fill="none" stroke={colors.line} strokeWidth={1} />
              </Pattern>
            </Defs>
            <Rect x={ox} y={oy} width={PAPER.width * k} height={PAPER.height * k} fill={colors.surface} rx={4} />
            {grid ? <Rect x={ox} y={oy} width={PAPER.width * k} height={PAPER.height * k} fill="url(#grid)" /> : null}
            <G transform={`translate(${ox} ${oy}) scale(${k})`}>
              {strokes.map((s) => {
                const moving = draft?.moveId === s.id && moveDelta
                const shown = moving ? translateStroke(s, moveDelta.x, moveDelta.y) : s
                const selected = s.id === selectedId
                return (
                  <G key={s.id}>
                    {selected ? <Path d={dOf(shown.points, shown.closed)} fill="none" stroke={colors.ink} strokeOpacity={0.15} strokeWidth={w * 5} strokeLinejoin="round" strokeLinecap="round" /> : null}
                    <Path
                      d={dOf(shown.points, shown.closed)}
                      fill="none"
                      stroke={stroke(s.layer)}
                      strokeWidth={w}
                      strokeDasharray={s.layer === 'crease' ? [6 / k, 4 / k] : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </G>
                )
              })}
              {preview ? (
                <Path d={preview.d} fill="none" stroke={stroke(preview.layer)} strokeWidth={w} strokeOpacity={0.8} strokeDasharray={[4 / k, 3 / k]} />
              ) : null}
              {draft && draft.tool !== 'select' ? (
                <>
                  <Circle cx={draft.start.x} cy={draft.start.y} r={3.5 / k} fill={colors.ink} />
                  <Circle cx={draft.end.x} cy={draft.end.y} r={5 / k} fill="none" stroke={colors.ink} strokeWidth={1.5 / k} />
                </>
              ) : null}
            </G>
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
})
