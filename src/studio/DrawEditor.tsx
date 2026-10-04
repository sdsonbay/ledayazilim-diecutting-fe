/* eslint-disable react-hooks/refs, react-hooks/immutability, react-hooks/purity --
 * Çizim etkileşimi (işaretçi/klavye) ref'lerde tutulur; yalnızca olay geri çağrılarında
 * (render dışında) okunur-yazılır. Görünür durum ayrıca state'e yansıtılır. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { Button, Icon, NumberBox, ScalePressable, Text, useFeedback, type IconName } from '../components/ui'
import { useI18n } from '../i18n/LocaleContext'
import type { MessageKey } from '../i18n/messages'
import { storage } from '../lib/storage'
import { useUnit } from '../lib/units'
import { useTheme } from '../theme/ThemeContext'
import { fonts, radius } from '../theme/tokens'
import {
  bboxOf,
  dOf,
  dragBox,
  duplicateSel,
  flipSel,
  hitShape,
  hitVertex,
  lineInfo,
  marqueeSelect,
  moveVertex,
  parseShapes,
  pathLength,
  r2,
  rotateSel,
  scaleSel,
  setLayerSel,
  setLine,
  shapeFromDrag,
  shapesToSvg,
  snapPoint,
  straighten,
  translateSel,
  uid,
  type Layer,
  type Pt,
  type Shape,
  type SnapResult,
  type Tool,
} from './drawDoc'

interface View2D {
  /** Piksel / mm. */
  k: number
  tx: number
  ty: number
}

type Op =
  | { kind: 'pan'; view: View2D; sx: number; sy: number }
  | { kind: 'pending'; start: Pt; sx: number; sy: number }
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'shape'; a: Pt; b: Pt }
  | { kind: 'move'; grab: Pt; raw: Pt; delta: Pt; ids: Set<string> }
  | { kind: 'vertex'; id: string; index: number; p: Pt }
  | { kind: 'marquee'; a: Pt; b: Pt; additive: boolean }

const TOOLS: { id: Tool; icon: IconName; label: MessageKey; key: string }[] = [
  { id: 'select', icon: 'mouse-pointer', label: 'draw.tool.select', key: 'V' },
  { id: 'line', icon: 'edit-2', label: 'draw.tool.line', key: 'L' },
  { id: 'rect', icon: 'square', label: 'draw.tool.rect', key: 'R' },
  { id: 'roundrect', icon: 'credit-card', label: 'draw.tool.roundrect', key: 'U' },
  { id: 'ellipse', icon: 'circle', label: 'draw.tool.ellipse', key: 'E' },
  { id: 'polygon', icon: 'hexagon', label: 'draw.tool.polygon', key: 'P' },
  { id: 'hole', icon: 'target', label: 'draw.tool.hole', key: 'H' },
]

const GRID_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500]
const MIN_K = 0.15
const MAX_K = 40
const HISTORY = 120

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
}

export interface DrawStarter {
  id: string
  label: string
  icon: IconName
  load: () => Promise<Shape[] | null>
}

/**
 * Bıçak izi çizim düzenleyicisi.
 * Fare / dokunma: çiz, seç, taşı, köşe düzenle; iki parmak / tekerlek / boşluk+sürükle: yakınlaş-kaydır.
 * Klavye kısayolları web'de; tüm komutların düğmesi de var.
 */
export const DrawEditor = ({
  onConvert,
  converting,
  starters,
  onInteract,
  height,
}: {
  onConvert: (svg: string) => void
  converting: boolean
  starters: DrawStarter[]
  onInteract?: (active: boolean) => void
  height: number
}) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const units = useUnit()
  const { confirm, toast } = useFeedback()

  const [shapes, setShapes] = useState<Shape[]>(() => parseShapes(storage.get('diecut.studioDraft')) ?? [])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [tool, setToolState] = useState<Tool>('line')
  const [layer, setLayer] = useState<Layer>('cut')
  const [snapOn, setSnapOn] = useState(true)
  const [gridOn, setGridOn] = useState(true)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View2D>({ k: 1.6, tx: 40, ty: 40 })
  const [cursor, setCursor] = useState<SnapResult | null>(null)
  const [draft, setDraft] = useState<Pt[] | null>(null)
  const [op, setOpState] = useState<Op | null>(null)
  const [help, setHelp] = useState(false)
  const [radiusMm, setRadiusMm] = useState(8)
  const [sides, setSides] = useState(6)
  const [, bump] = useState(0)

  const undo = useRef<Shape[][]>([])
  const redo = useRef<Shape[][]>([])
  const clipboard = useRef<Shape[]>([])
  const opRef = useRef<Op | null>(null)
  const keys = useRef({ shift: false, space: false })
  const lastClick = useRef({ at: 0, x: 0, y: 0 })
  const hostRef = useRef<View>(null)
  const fitted = useRef(false)

  // Güncel değerler: olay geri çağrıları (klavye, jest) her zaman en son durumu görsün.
  const live = useRef({ shapes, selection, tool, layer, snapOn, gridOn, view, draft, size, cursor })
  live.current = { shapes, selection, tool, layer, snapOn, gridOn, view, draft, size, cursor }

  const setOp = (next: Op | null) => {
    opRef.current = next
    setOpState(next)
  }

  // Taslak kalıcı: sayfa yenilense de çizim kaybolmaz.
  useEffect(() => {
    const handle = setTimeout(() => storage.set('diecut.studioDraft', shapes.length ? JSON.stringify(shapes) : null), 400)
    return () => clearTimeout(handle)
  }, [shapes])

  const commit = useCallback((next: Shape[], select?: string[]) => {
    undo.current.push(live.current.shapes)
    if (undo.current.length > HISTORY) undo.current.shift()
    redo.current = []
    setShapes(next)
    if (select) setSelection(new Set(select))
  }, [])

  const doUndo = () => {
    const prev = undo.current.pop()
    if (!prev) return
    redo.current.push(live.current.shapes)
    setShapes(prev)
    setSelection(new Set())
    bump((n) => n + 1)
  }
  const doRedo = () => {
    const next = redo.current.pop()
    if (!next) return
    undo.current.push(live.current.shapes)
    setShapes(next)
    setSelection(new Set())
    bump((n) => n + 1)
  }

  // ---------------------------------------------------------------- görünüm
  const gridStep = useMemo(() => GRID_STEPS.find((s) => s * view.k >= 12) ?? 500, [view.k])
  const toMM = (x: number, y: number, v = live.current.view): Pt => ({ x: (x - v.tx) / v.k, y: (y - v.ty) / v.k })
  const tolMM = (v = live.current.view) => 10 / v.k

  const fit = useCallback((list: Shape[] = live.current.shapes) => {
    const { width, height: h } = live.current.size
    if (!width || !h) return
    const box = bboxOf(list) ?? { x: 0, y: 0, w: 400, h: 280 }
    const pad = 36
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((width - pad * 2) / Math.max(box.w, 20), (h - pad * 2) / Math.max(box.h, 20))))
    setView({ k, tx: width / 2 - (box.x + box.w / 2) * k, ty: h / 2 - (box.y + box.h / 2) * k })
  }, [])

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
      const f = k / v.k
      return { k, tx: sx - (sx - v.tx) * f, ty: sy - (sy - v.ty) * f }
    })
  }, [])

  useEffect(() => {
    if (!fitted.current && size.width > 0) {
      fitted.current = true
      fit()
    }
  }, [size.width, fit])

  // ---------------------------------------------------------------- yakalama
  const snapAt = (raw: Pt, exclude?: Set<string>): SnapResult => {
    const L = live.current
    if (!L.snapOn) return { point: { x: r2(raw.x), y: r2(raw.y) }, kind: 'free', guides: [] }
    return snapPoint(raw, L.shapes, { tol: tolMM(), grid: L.gridOn ? gridStep : 0, objects: true, exclude })
  }

  // ---------------------------------------------------------------- komutlar
  const selectedIds = () => live.current.selection
  const selectedShapes = () => live.current.shapes.filter((s) => live.current.selection.has(s.id))
  const selBox = () => bboxOf(selectedShapes())
  const centerOf = () => {
    const b = selBox()
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 }
  }

  const finishDraft = useCallback(
    (close: boolean) => {
      const d = live.current.draft
      setDraft(null)
      if (!d || d.length < 2) return
      const closed = close && d.length >= 3
      const shape: Shape = { id: uid(), layer: live.current.layer, points: d, closed }
      commit([...live.current.shapes, shape])
    },
    [commit],
  )

  const deleteSelection = () => {
    if (live.current.draft) {
      const d = live.current.draft
      setDraft(d.length > 1 ? d.slice(0, -1) : null)
      return
    }
    const ids = selectedIds()
    if (ids.size === 0) return
    commit(live.current.shapes.filter((s) => !ids.has(s.id)), [])
  }

  const setTool = (next: Tool) => {
    if (live.current.draft) finishDraft(false)
    setToolState(next)
    if (next !== 'select') setSelection(new Set())
  }

  const changeLayer = (next: Layer) => {
    setLayer(next)
    const ids = selectedIds()
    if (ids.size) commit(setLayerSel(live.current.shapes, ids, next), [...ids])
  }

  const nudge = (dx: number, dy: number) => {
    const ids = selectedIds()
    if (ids.size) commit(translateSel(live.current.shapes, ids, dx, dy), [...ids])
  }

  const duplicate = () => {
    const ids = selectedIds()
    if (!ids.size) return
    const out = duplicateSel(live.current.shapes, ids, 10)
    commit(out.shapes, out.ids)
  }

  const copy = () => {
    clipboard.current = selectedShapes()
  }
  const paste = () => {
    if (!clipboard.current.length) return
    const copies = clipboard.current.map((s) => ({ ...s, id: uid(), points: s.points.map((p) => ({ x: p.x + 10, y: p.y + 10 })) }))
    clipboard.current = copies
    commit([...live.current.shapes, ...copies], copies.map((c) => c.id))
  }

  const clearAll = async () => {
    if (!live.current.shapes.length) return
    const ok = await confirm({ title: t('draw.clearConfirm'), confirmLabel: t('draw.clear'), cancelLabel: t('common.cancel'), destructive: true })
    if (ok) commit([], [])
  }

  const convert = () => {
    const list = live.current.shapes
    if (!list.some((s) => s.layer === 'cut')) {
      toast(t('draw.needCut'), 'error')
      return
    }
    onConvert(shapesToSvg(list))
  }

  // ---------------------------------------------------------------- işaretçi
  const pointerDown = (x: number, y: number) => {
    const L = live.current
    const raw = toMM(x, y)
    if (keys.current.space) {
      setOp({ kind: 'pan', view: L.view, sx: x, sy: y })
      return
    }
    if (L.tool === 'select') {
      const tol = tolMM()
      const sel = [...L.selection]
      if (sel.length === 1) {
        const shape = L.shapes.find((s) => s.id === sel[0])
        const idx = shape ? hitVertex(raw, shape, tol) : -1
        if (shape && idx >= 0) {
          setOp({ kind: 'vertex', id: shape.id, index: idx, p: shape.points[idx]! })
          return
        }
      }
      const hit = hitShape(raw, L.shapes, tol)
      if (hit) {
        let ids = L.selection
        if (keys.current.shift) {
          ids = new Set(ids)
          if (ids.has(hit)) ids.delete(hit)
          else ids.add(hit)
          setSelection(ids)
          return
        }
        if (!ids.has(hit)) {
          ids = new Set([hit])
          setSelection(ids)
        }
        const grab = snapAt(raw, ids).point
        setOp({ kind: 'move', grab, raw, delta: { x: 0, y: 0 }, ids })
        return
      }
      if (!keys.current.shift) setSelection(new Set())
      setOp({ kind: 'marquee', a: raw, b: raw, additive: keys.current.shift })
      return
    }
    const p = snapAt(raw).point
    if (L.tool === 'line') {
      setOp({ kind: 'pending', start: L.draft ? straighten(L.draft[L.draft.length - 1]!, p, keys.current.shift) : p, sx: x, sy: y })
      return
    }
    setOp({ kind: 'shape', a: p, b: p })
  }

  const pointerMove = (x: number, y: number) => {
    const L = live.current
    const raw = toMM(x, y)
    const o = opRef.current
    if (!o) {
      // Fare gezinmesi: yakalama işaretçisi ve lastik bant.
      setCursor(L.tool === 'select' ? { point: raw, kind: 'free', guides: [] } : snapAt(raw))
      return
    }
    if (o.kind === 'pan') {
      setView({ ...o.view, tx: o.view.tx + (x - o.sx), ty: o.view.ty + (y - o.sy) })
      return
    }
    if (o.kind === 'pending') {
      if (Math.hypot(x - o.sx, y - o.sy) > 5) setOp({ kind: 'line', a: o.start, b: o.start })
      return
    }
    if (o.kind === 'line') {
      const snap = snapAt(raw)
      const b = straighten(o.a, snap.point, keys.current.shift)
      setCursor({ ...snap, point: b })
      setOp({ ...o, b })
      return
    }
    if (o.kind === 'shape') {
      const snap = snapAt(raw)
      setCursor(snap)
      setOp({ ...o, b: snap.point })
      return
    }
    if (o.kind === 'move') {
      const target = snapAt({ x: o.grab.x + (raw.x - o.raw.x), y: o.grab.y + (raw.y - o.raw.y) }, o.ids)
      let delta = { x: target.point.x - o.grab.x, y: target.point.y - o.grab.y }
      if (keys.current.shift) delta = Math.abs(delta.x) > Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y }
      setCursor(target)
      setOp({ ...o, delta })
      return
    }
    if (o.kind === 'vertex') {
      const shape = L.shapes.find((s) => s.id === o.id)
      const snap = snapAt(raw)
      let p = snap.point
      const n = shape?.points.length ?? 0
      const prev = shape && (o.index > 0 ? shape.points[o.index - 1] : shape.closed ? shape.points[n - 1] : undefined)
      if (prev) p = straighten(prev, p, keys.current.shift)
      setCursor({ ...snap, point: p })
      setOp({ ...o, p })
      return
    }
    if (o.kind === 'marquee') setOp({ ...o, b: raw })
  }

  const click = (p: Pt, sx: number, sy: number) => {
    const L = live.current
    const now = Date.now()
    const dbl = now - lastClick.current.at < 350 && Math.hypot(sx - lastClick.current.x, sy - lastClick.current.y) < 8
    lastClick.current = { at: now, x: sx, y: sy }
    const d = L.draft
    if (!d) {
      setDraft([p])
      return
    }
    if (dbl) {
      finishDraft(false)
      return
    }
    const first = d[0]!
    const last = d[d.length - 1]!
    if (d.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= tolMM()) {
      finishDraft(true)
      return
    }
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return
    setDraft([...d, p])
  }

  const pointerUp = (x: number, y: number, ok: boolean) => {
    const L = live.current
    const o = opRef.current
    setOp(null)
    if (!o || !ok) return
    if (o.kind === 'pending') {
      click(o.start, x, y)
      return
    }
    if (o.kind === 'line') {
      if (Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) < 0.5) return
      if (L.draft) setDraft([...L.draft, o.b])
      else commit([...L.shapes, { id: uid(), layer: L.layer, points: [o.a, o.b], closed: false }])
      return
    }
    if (o.kind === 'shape') {
      const box = dragBox(o.a, o.b, keys.current.shift)
      if (box.w < 1 || box.h < 1) return
      const shape: Shape = {
        id: uid(),
        layer: L.tool === 'hole' ? 'cut' : L.layer,
        points: shapeFromDrag(L.tool, o.a, o.b, { radius: radiusMm, sides, square: keys.current.shift }),
        closed: true,
      }
      commit([...L.shapes, shape], [shape.id])
      return
    }
    if (o.kind === 'move') {
      if (o.delta.x || o.delta.y) commit(translateSel(L.shapes, o.ids, o.delta.x, o.delta.y), [...o.ids])
      return
    }
    if (o.kind === 'vertex') {
      commit(moveVertex(L.shapes, o.id, o.index, o.p), [o.id])
      return
    }
    if (o.kind === 'marquee') {
      if (Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) * L.view.k < 4) return
      const ids = marqueeSelect(L.shapes, o.a, o.b)
      setSelection(new Set(o.additive ? [...L.selection, ...ids] : ids))
    }
  }

  // ---------------------------------------------------------------- jestler
  const pinchStart = useRef<View2D | null>(null)
  const one = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      onInteract?.(true)
      pointerDown(e.x, e.y)
    })
    .onUpdate((e) => pointerMove(e.x, e.y))
    .onFinalize((e, success) => {
      pointerUp(e.x, e.y, success || opRef.current?.kind === 'pending')
      onInteract?.(false)
    })
  const two = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .onStart(() => {
      pinchStart.current = live.current.view
      if (opRef.current && opRef.current.kind !== 'pan') setOp(null)
    })
    .onUpdate((e) => {
      const v = pinchStart.current
      if (v) setView((cur) => ({ ...cur, tx: v.tx + e.translationX, ty: v.ty + e.translationY }))
    })
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchStart.current = live.current.view
    })
    .onUpdate((e) => {
      const v = pinchStart.current
      if (!v) return
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * e.scale))
      const f = k / v.k
      setView((cur) => ({ k, tx: e.focalX - (e.focalX - cur.tx) * (k / cur.k), ty: e.focalY - (e.focalY - cur.ty) * (k / cur.k) }))
      void f
    })
  const hover = Gesture.Hover()
    .runOnJS(true)
    .onUpdate((e) => {
      if (!opRef.current) pointerMove(e.x, e.y)
    })
    .onEnd(() => setCursor(null))
  const gesture = Gesture.Simultaneous(one, two, pinch, hover)

  // Web: tekerlekle imleç merkezli yakınlaşma; klavye kısayolları.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = hostRef.current as unknown as HTMLElement | null
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - rect.left, e.clientY - rect.top)
    }
    el?.addEventListener?.('wheel', onWheel, { passive: false })
    return () => el?.removeEventListener?.('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const down = (e: KeyboardEvent) => {
      keys.current.shift = e.shiftKey
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const handled = () => e.preventDefault()
      if (e.code === 'Space') {
        keys.current.space = true
        handled()
        return
      }
      if (mod && k === 'z') {
        handled()
        if (e.shiftKey) doRedo()
        else doUndo()
        return
      }
      if (mod && k === 'y') return handled(), doRedo()
      if (mod && k === 'd') return handled(), duplicate()
      if (mod && k === 'c') return copy()
      if (mod && k === 'v') return handled(), paste()
      if (mod && k === 'a') {
        handled()
        setToolState('select')
        setSelection(new Set(live.current.shapes.map((s) => s.id)))
        return
      }
      if (mod && e.key === 'Enter') return handled(), convert()
      if (mod) return
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          handled()
          deleteSelection()
          return
        case 'Escape':
          if (live.current.draft) finishDraft(false)
          else if (opRef.current) setOp(null)
          else setSelection(new Set())
          setHelp(false)
          return
        case 'Enter':
          if (live.current.draft) {
            handled()
            finishDraft(false)
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!live.current.selection.size) return
          handled()
          const step = e.shiftKey ? 10 : 1
          nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
          return
        }
        case '?':
          setHelp((v) => !v)
          return
        case '+':
        case '=':
          zoomAt(1.25, live.current.size.width / 2, live.current.size.height / 2)
          return
        case '-':
          zoomAt(0.8, live.current.size.width / 2, live.current.size.height / 2)
          return
        case '0':
          fit()
          return
      }
      const toolKey = TOOLS.find((tl) => tl.key.toLowerCase() === k)
      if (toolKey) return setTool(toolKey.id)
      if (k === 'c') return changeLayer('cut')
      if (k === 'k') return changeLayer('crease')
      if (k === 'x') return changeLayer(live.current.layer === 'cut' ? 'crease' : 'cut')
      if (k === 'g') return setGridOn((v) => !v)
      if (k === 's') return setSnapOn((v) => !v)
      if (k === 'f') return fit()
      if (k === 'd' && live.current.selection.size) return duplicate()
    }
    const up = (e: KeyboardEvent) => {
      keys.current.shift = e.shiftKey
      if (e.code === 'Space') keys.current.space = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  // ---------------------------------------------------------------- çizim
  const k = view.k
  const sw = 1.6 / k
  const stroke = (l: Layer) => (l === 'cut' ? colors.cut : colors.crease)
  const moving = op?.kind === 'move' ? op : null
  const editingVertex = op?.kind === 'vertex' ? op : null
  const rendered = shapes.map((s) => {
    if (moving && moving.ids.has(s.id)) return { ...s, points: s.points.map((p) => ({ x: p.x + moving.delta.x, y: p.y + moving.delta.y })) }
    if (editingVertex && editingVertex.id === s.id) return { ...s, points: s.points.map((p, i) => (i === editingVertex.index ? editingVertex.p : p)) }
    return s
  })
  const single = selection.size === 1 ? rendered.find((s) => selection.has(s.id)) : undefined
  const selBounds = bboxOf(rendered.filter((s) => selection.has(s.id)))

  const grid = useMemo(() => {
    if (!gridOn || !size.width) return null
    const x0 = Math.floor(-view.tx / view.k / gridStep) * gridStep
    const x1 = (size.width - view.tx) / view.k
    const y0 = Math.floor(-view.ty / view.k / gridStep) * gridStep
    const y1 = (size.height - view.ty) / view.k
    let minor = ''
    let major = ''
    const big = gridStep * 5
    for (let x = x0; x <= x1; x += gridStep) {
      const sx = r2(x * view.k + view.tx)
      const line = `M${sx} 0V${size.height}`
      if (Math.abs(x / big - Math.round(x / big)) < 1e-6) major += line
      else minor += line
    }
    for (let y = y0; y <= y1; y += gridStep) {
      const sy = r2(y * view.k + view.ty)
      const line = `M0 ${sy}H${size.width}`
      if (Math.abs(y / big - Math.round(y / big)) < 1e-6) major += line
      else minor += line
    }
    return { minor, major }
  }, [gridOn, size.width, size.height, view, gridStep])

  const S = (p: Pt) => ({ x: p.x * k + view.tx, y: p.y * k + view.ty })

  // Lastik bant (çoklu çizgi taslağı) ve canlı ölçü.
  const rubber = draft && cursor && tool === 'line' && !op ? straighten(draft[draft.length - 1]!, cursor.point, keys.current.shift) : null
  const measure: { at: Pt; text: string } | null = (() => {
    if (op?.kind === 'line') {
      const len = Math.hypot(op.b.x - op.a.x, op.b.y - op.a.y)
      const ang = (Math.atan2(-(op.b.y - op.a.y), op.b.x - op.a.x) * 180) / Math.PI
      return { at: op.b, text: `${units.format(len)}  ${Math.round(ang)}°` }
    }
    if (rubber && draft) {
      const a = draft[draft.length - 1]!
      const len = Math.hypot(rubber.x - a.x, rubber.y - a.y)
      const ang = (Math.atan2(-(rubber.y - a.y), rubber.x - a.x) * 180) / Math.PI
      return { at: rubber, text: `${units.format(len)}  ${Math.round(ang)}°` }
    }
    if (op?.kind === 'shape') {
      const b = dragBox(op.a, op.b, keys.current.shift)
      return { at: op.b, text: `${units.format(b.w)} × ${units.format(b.h)}` }
    }
    if (op?.kind === 'move') return { at: { x: op.grab.x + op.delta.x, y: op.grab.y + op.delta.y }, text: `Δ ${units.format(op.delta.x)}, ${units.format(op.delta.y)}` }
    return null
  })()

  const snapMarker = (() => {
    if (!cursor || cursor.kind === 'free' || tool === 'select' && !op) return null
    const p = S(cursor.point)
    const c = colors.accent
    const s = 6
    switch (cursor.kind) {
      case 'end':
        return <Rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} fill="none" stroke={c} strokeWidth={1.6} />
      case 'mid':
        return <Path d={`M${p.x} ${p.y - s - 1}L${p.x + s + 1} ${p.y + s}L${p.x - s - 1} ${p.y + s}Z`} fill="none" stroke={c} strokeWidth={1.6} />
      case 'inter':
        return <Path d={`M${p.x - s} ${p.y - s}L${p.x + s} ${p.y + s}M${p.x + s} ${p.y - s}L${p.x - s} ${p.y + s}`} stroke={c} strokeWidth={1.8} />
      case 'edge':
        return <Circle cx={p.x} cy={p.y} r={s} fill="none" stroke={c} strokeWidth={1.6} />
      default:
        return <Circle cx={p.x} cy={p.y} r={2.5} fill={c} />
    }
  })()

  const toolHint = draft
    ? t('draw.hint.drafting')
    : t(`draw.hint.${tool === 'select' ? 'select' : tool === 'line' ? 'line' : 'shape'}` as MessageKey)

  // ---------------------------------------------------------------- denetçi
  const info = single ? lineInfo(single) : null
  const selCount = selection.size
  const inspector = (
    <View style={[styles.inspector, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      {draft ? (
        <View style={styles.inspRow}>
          <Text variant="smallStrong" style={{ minWidth: 120 }}>
            {t('draw.drafting', { n: draft.length })}
          </Text>
          <NumberBox
            label={t('draw.nextLength')}
            unit={units.label}
            value={0}
            onCommit={(v) => {
              if (v <= 0) return
              const d = live.current.draft
              if (!d) return
              const a = d[d.length - 1]!
              const dir = cursor ? Math.atan2(cursor.point.y - a.y, cursor.point.x - a.x) : 0
              const mm = units.fromDisplay(v)
              setDraft([...d, { x: r2(a.x + mm * Math.cos(dir)), y: r2(a.y + mm * Math.sin(dir)) }])
            }}
            style={styles.inspField}
          />
          <Button label={t('draw.finish')} size="sm" variant="outline" icon="check" onPress={() => finishDraft(false)} />
          <Button label={t('draw.close')} size="sm" variant="outline" icon="refresh-cw" onPress={() => finishDraft(true)} disabled={draft.length < 3} />
          <Button label={t('draw.removePoint')} size="sm" variant="ghost" icon="delete" onPress={deleteSelection} />
        </View>
      ) : selCount ? (
        <View style={{ gap: 10 }}>
          <View style={styles.inspRow}>
            <Text variant="smallStrong">{t('draw.selected', { n: selCount })}</Text>
            <LayerSwitch layer={selectedShapes().every((s) => s.layer === 'crease') ? 'crease' : 'cut'} onChange={changeLayer} />
            <View style={{ flex: 1 }} />
            <MiniButton icon="rotate-cw" label={t('draw.rotate')} onPress={() => commit(rotateSel(shapes, selection, centerOf(), 90), [...selection])} />
            <MiniButton icon="columns" label={t('draw.flipH')} onPress={() => commit(flipSel(shapes, selection, centerOf(), 'h'), [...selection])} />
            <MiniButton icon="menu" label={t('draw.flipV')} onPress={() => commit(flipSel(shapes, selection, centerOf(), 'v'), [...selection])} />
            <MiniButton icon="copy" label={`${t('draw.duplicate')} (Ctrl+D)`} onPress={duplicate} />
            <MiniButton icon="trash-2" label={`${t('draw.delete')} (Del)`} onPress={deleteSelection} danger />
          </View>
          <View style={styles.inspRow}>
            {info && single ? (
              <>
                <NumberBox
                  label={t('draw.length')}
                  unit={units.label}
                  value={Number(units.toDisplay(info.length).toFixed(2))}
                  onCommit={(v) => {
                    if (v > 0) commit(setLine(shapes, single.id, units.fromDisplay(v), info.angle), [single.id])
                  }}
                  style={styles.inspField}
                />
                <NumberBox
                  label={t('draw.angle')}
                  unit="°"
                  value={Math.round(-info.angle * 10) / 10}
                  onCommit={(v) => commit(setLine(shapes, single.id, info.length, -v), [single.id])}
                  style={styles.inspField}
                />
              </>
            ) : selBounds ? (
              <>
                <NumberBox
                  label={t('draw.width')}
                  unit={units.label}
                  value={Number(units.toDisplay(selBounds.w).toFixed(2))}
                  onCommit={(v) => {
                    if (v > 0 && selBounds.w > 0) commit(scaleSel(shapes, selection, { x: selBounds.x, y: selBounds.y }, units.fromDisplay(v) / selBounds.w, 1), [...selection])
                  }}
                  style={styles.inspField}
                />
                <NumberBox
                  label={t('draw.height')}
                  unit={units.label}
                  value={Number(units.toDisplay(selBounds.h).toFixed(2))}
                  onCommit={(v) => {
                    if (v > 0 && selBounds.h > 0) commit(scaleSel(shapes, selection, { x: selBounds.x, y: selBounds.y }, 1, units.fromDisplay(v) / selBounds.h), [...selection])
                  }}
                  style={styles.inspField}
                />
              </>
            ) : null}
            {selBounds ? (
              <>
                <NumberBox
                  label="X"
                  unit={units.label}
                  value={Number(units.toDisplay(selBounds.x).toFixed(2))}
                  onCommit={(v) => commit(translateSel(shapes, selection, units.fromDisplay(v) - selBounds.x, 0), [...selection])}
                  style={styles.inspField}
                />
                <NumberBox
                  label="Y"
                  unit={units.label}
                  value={Number(units.toDisplay(selBounds.y).toFixed(2))}
                  onCommit={(v) => commit(translateSel(shapes, selection, 0, units.fromDisplay(v) - selBounds.y), [...selection])}
                  style={styles.inspField}
                />
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.inspRow}>
          <Text variant="small" tone="muted" style={{ flex: 1, minWidth: 200 }}>
            {toolHint}
          </Text>
          {tool === 'roundrect' ? (
            <NumberBox label={t('draw.radius')} unit="mm" value={radiusMm} onCommit={(v) => setRadiusMm(Math.max(0, v))} style={styles.inspField} />
          ) : null}
          {tool === 'polygon' ? (
            <NumberBox label={t('draw.sides')} unit="" value={sides} onCommit={(v) => setSides(Math.max(3, Math.min(16, Math.round(v))))} style={styles.inspField} />
          ) : null}
        </View>
      )}
    </View>
  )

  const totals = useMemo(() => {
    const sum = (l: Layer) => shapes.filter((s) => s.layer === l).reduce((acc, s) => acc + pathLength(s.points, s.closed), 0)
    return { cut: sum('cut'), crease: sum('crease') }
  }, [shapes])

  return (
    <View style={{ gap: 10 }}>
      {/* Araç çubuğu */}
      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.group}>
          {TOOLS.map((tl) => (
            <ToolButton key={tl.id} icon={tl.icon} label={t(tl.label)} shortcut={tl.key} active={tool === tl.id} onPress={() => setTool(tl.id)} />
          ))}
        </View>
        <Divider />
        <LayerSwitch layer={layer} onChange={changeLayer} withKeys />
        <Divider />
        <View style={styles.group}>
          <ToolButton icon="corner-up-left" label={t('draw.undo')} shortcut="Ctrl+Z" onPress={doUndo} disabled={!undo.current.length} />
          <ToolButton icon="corner-up-right" label={t('draw.redo')} shortcut="Ctrl+Y" onPress={doRedo} disabled={!redo.current.length} />
          <ToolButton icon="trash-2" label={t('draw.delete')} shortcut="Del" onPress={deleteSelection} disabled={!selCount && !draft} />
          <ToolButton icon="copy" label={t('draw.duplicate')} shortcut="Ctrl+D" onPress={duplicate} disabled={!selCount} />
        </View>
        <Divider />
        <View style={styles.group}>
          <ToolButton icon="crosshair" label={t('draw.snap')} toggle shortcut="S" active={snapOn} onPress={() => setSnapOn((v) => !v)} />
          <ToolButton icon="grid" label={t('draw.grid')} toggle shortcut="G" active={gridOn} onPress={() => setGridOn((v) => !v)} />
          <ToolButton icon="maximize" label={t('draw.fit')} shortcut="F" onPress={() => fit()} />
          <ToolButton icon="help-circle" label={t('draw.shortcuts')} toggle shortcut="?" active={help} onPress={() => setHelp((v) => !v)} />
        </View>
      </View>

      {/* Tuval */}
      <View style={[styles.canvas, { height, borderColor: colors.line, backgroundColor: colors.stage }]}>
        <GestureDetector gesture={gesture}>
          <View
            ref={hostRef}
            style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ cursor: keys.current.space ? 'grab' : tool === 'select' ? 'default' : 'crosshair' } as object) : null]}
            onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            collapsable={false}
          >
            {size.width > 0 ? (
              <Svg width={size.width} height={size.height}>
                {grid ? (
                  <>
                    <Path d={grid.minor} stroke={colors.line} strokeWidth={1} />
                    <Path d={grid.major} stroke={colors.lineStrong} strokeWidth={1} />
                  </>
                ) : null}
                {cursor?.guides.map((g, i) =>
                  g.axis === 'x' ? (
                    <Line key={i} x1={g.value * k + view.tx} y1={0} x2={g.value * k + view.tx} y2={size.height} stroke={colors.accent} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                  ) : (
                    <Line key={i} x1={0} y1={g.value * k + view.ty} x2={size.width} y2={g.value * k + view.ty} stroke={colors.accent} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                  ),
                )}
                <G transform={`translate(${view.tx} ${view.ty}) scale(${k})`}>
                  {rendered.map((s) =>
                    selection.has(s.id) ? (
                      <Path key={`h-${s.id}`} d={dOf(s.points, s.closed)} fill="none" stroke={colors.accent} strokeOpacity={0.22} strokeWidth={8 / k} strokeLinejoin="round" strokeLinecap="round" />
                    ) : null,
                  )}
                  {rendered.map((s) => (
                    <Path key={s.id} d={dOf(s.points, s.closed)} fill="none" stroke={stroke(s.layer)} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
                  ))}
                  {draft ? (
                    <>
                      <Path d={dOf(draft, false)} fill="none" stroke={stroke(layer)} strokeWidth={sw} strokeLinejoin="round" />
                      {rubber ? <Path d={dOf([draft[draft.length - 1]!, rubber], false)} fill="none" stroke={stroke(layer)} strokeWidth={sw} strokeDasharray={`${5 / k} ${4 / k}`} /> : null}
                    </>
                  ) : null}
                  {op?.kind === 'line' ? <Path d={dOf([op.a, op.b], false)} fill="none" stroke={stroke(layer)} strokeWidth={sw} /> : null}
                  {op?.kind === 'shape' ? (
                    <Path
                      d={dOf(shapeFromDrag(tool, op.a, op.b, { radius: radiusMm, sides, square: keys.current.shift }), true)}
                      fill="none"
                      stroke={stroke(tool === 'hole' ? 'cut' : layer)}
                      strokeWidth={sw}
                      strokeDasharray={`${5 / k} ${4 / k}`}
                    />
                  ) : null}
                </G>
                {/* Köşe tutamakları (tek seçim) ve çoklu seçim kutusu — ekran pikselinde. */}
                {single && tool === 'select'
                  ? single.points.map((p, i) => {
                      const q = S(p)
                      return <Rect key={i} x={q.x - 4} y={q.y - 4} width={8} height={8} fill={colors.surface} stroke={colors.accent} strokeWidth={1.5} />
                    })
                  : null}
                {selBounds && selCount > 1 ? (
                  <Rect x={S(selBounds).x - 6} y={S(selBounds).y - 6} width={selBounds.w * k + 12} height={selBounds.h * k + 12} fill="none" stroke={colors.accent} strokeWidth={1} strokeDasharray="4 3" />
                ) : null}
                {draft
                  ? draft.map((p, i) => {
                      const q = S(p)
                      const closable = i === 0 && draft.length >= 3
                      return <Circle key={i} cx={q.x} cy={q.y} r={closable ? 6 : 3} fill={closable ? colors.surface : stroke(layer)} stroke={stroke(layer)} strokeWidth={1.5} />
                    })
                  : null}
                {op?.kind === 'marquee' ? (
                  <Rect
                    x={Math.min(S(op.a).x, S(op.b).x)}
                    y={Math.min(S(op.a).y, S(op.b).y)}
                    width={Math.abs(S(op.b).x - S(op.a).x)}
                    height={Math.abs(S(op.b).y - S(op.a).y)}
                    fill={colors.accent}
                    fillOpacity={0.06}
                    stroke={colors.accent}
                    strokeWidth={1}
                    strokeDasharray={op.b.x < op.a.x ? '5 4' : undefined}
                  />
                ) : null}
                {snapMarker}
                {measure ? (
                  <G>
                    <Rect x={S(measure.at).x + 12} y={S(measure.at).y + 10} width={measure.text.length * 6.6 + 14} height={22} rx={6} fill={colors.ink} opacity={0.88} />
                    <SvgText x={S(measure.at).x + 19} y={S(measure.at).y + 25} fontSize={11.5} fill={colors.bg} fontFamily={fonts.semibold}>
                      {measure.text}
                    </SvgText>
                  </G>
                ) : null}
              </Svg>
            ) : null}
          </View>
        </GestureDetector>
        {shapes.length === 0 && !draft ? (
          <View pointerEvents="box-none" style={styles.emptyWrap}>
            <View style={[styles.empty, { backgroundColor: colors.glass, borderColor: colors.line }]}>
              <Text variant="heading" align="center">
                {t('draw.emptyTitle')}
              </Text>
              <Text variant="small" tone="muted" align="center">
                {t('draw.emptyBody')}
              </Text>
              <View style={styles.starters}>
                {starters.map((st) => (
                  <Button
                    key={st.id}
                    label={st.label}
                    icon={st.icon}
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      void st.load().then((list) => {
                        if (!list) return
                        commit(list, [])
                        setTimeout(() => fit(list), 0)
                      })
                    }
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}
        {help ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={[styles.help, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <ShortcutHelp onClose={() => setHelp(false)} />
          </Animated.View>
        ) : null}
        <View pointerEvents="none" style={[styles.status, { backgroundColor: colors.glass }]}>
          <Text variant="mono" tone="muted" style={{ fontSize: 11 }}>
            {cursor ? `${units.format(cursor.point.x)}, ${units.format(cursor.point.y)}` : '—'}  ·  {Math.round(view.k * 100 / 1.6)}%  ·  {t('draw.gridStep', { n: units.format(gridStep, 0) })}
          </Text>
        </View>
      </View>

      {inspector}

      <View style={styles.footer}>
        <Text variant="mono" tone="soft" style={{ flex: 1, minWidth: 180 }}>
          {t('draw.totals', { cut: units.format(totals.cut, 0), crease: units.format(totals.crease, 0) })}
        </Text>
        <Button label={t('draw.clear')} icon="x-square" variant="ghost" size="sm" onPress={() => void clearAll()} disabled={!shapes.length} />
        <Button label={converting ? t('studio.building') : t('draw.to3d')} icon="box" onPress={convert} loading={converting} disabled={!shapes.length} />
      </View>
    </View>
  )
}

const Divider = () => {
  const { colors } = useTheme()
  return <View style={{ width: StyleSheet.hairlineWidth * 2, alignSelf: 'stretch', marginVertical: 4, backgroundColor: colors.line }} />
}

const ToolButton = ({
  icon,
  label,
  shortcut,
  active,
  disabled,
  onPress,
  toggle,
}: {
  icon: IconName
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onPress: () => void
  /** Aç/kapa ayarı: etkin hali araç seçiminden daha hafif gösterilir. */
  toggle?: boolean
}) => {
  const { colors } = useTheme()
  const [hover, setHover] = useState(false)
  return (
    <View>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={shortcut ? `${label} (${shortcut})` : label}
        accessibilityState={{ selected: active, disabled }}
        onPress={onPress}
        disabled={disabled}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        scaleTo={0.9}
        style={[styles.toolBtn, { backgroundColor: active ? (toggle ? colors.accentSoft : colors.ink) : hover ? colors.surfaceAlt : 'transparent' }]}
      >
        <Icon name={icon} size={17} color={active ? (toggle ? colors.accent : colors.bg) : colors.ink} />
      </ScalePressable>
      {hover && Platform.OS === 'web' ? (
        <View pointerEvents="none" style={[styles.tip, { backgroundColor: colors.ink }]}>
          <Text variant="small" color={colors.bg} numberOfLines={1} style={{ fontSize: 11.5 }}>
            {label}
            {shortcut ? `  ${shortcut}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const MiniButton = ({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) => {
  const { colors } = useTheme()
  return <ToolButtonPlain icon={icon} label={label} onPress={onPress} color={danger ? colors.danger : colors.ink} />
}

const ToolButtonPlain = ({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color: string }) => {
  const { colors } = useTheme()
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.9} style={[styles.miniBtn, { backgroundColor: colors.surfaceAlt }]}>
      <Icon name={icon} size={15} color={color} />
    </ScalePressable>
  )
}

const LayerSwitch = ({ layer, onChange, withKeys }: { layer: Layer; onChange: (l: Layer) => void; withKeys?: boolean }) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const item = (l: Layer, key: string) => {
    const active = layer === l
    const c = l === 'cut' ? colors.cut : colors.crease
    return (
      <ScalePressable
        key={l}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${t(l === 'cut' ? 'draw.layerCut' : 'draw.layerCrease')} (${key})`}
        onPress={() => onChange(l)}
        scaleTo={0.94}
        style={[styles.layerBtn, { backgroundColor: active ? colors.surfaceAlt : 'transparent', borderColor: active ? c : 'transparent' }]}
      >
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: c }} />
        <Text variant="smallStrong" color={active ? colors.ink : colors.muted}>
          {t(l === 'cut' ? 'draw.layerCut' : 'draw.layerCrease')}
          {withKeys && Platform.OS === 'web' ? <Text variant="small" tone="faint">{`  ${key}`}</Text> : null}
        </Text>
      </ScalePressable>
    )
  }
  return (
    <View style={styles.group}>
      {item('cut', 'C')}
      {item('crease', 'K')}
    </View>
  )
}

const SHORTCUTS: [string, MessageKey][] = [
  ['V', 'draw.tool.select'],
  ['L', 'draw.tool.line'],
  ['R · U · E · P · H', 'draw.sc.shapes'],
  ['C / K / X', 'draw.sc.layer'],
  ['Shift', 'draw.sc.shift'],
  ['Enter / Esc', 'draw.sc.finish'],
  ['Del / ⌫', 'draw.sc.delete'],
  ['Ctrl+Z / Ctrl+Y', 'draw.sc.undo'],
  ['Ctrl+D · Ctrl+C / V', 'draw.sc.copy'],
  ['Ctrl+A', 'draw.sc.all'],
  ['← ↑ → ↓', 'draw.sc.nudge'],
  ['S / G', 'draw.sc.snap'],
  ['Space', 'draw.sc.pan'],
  ['F / 0 · + / −', 'draw.sc.view'],
  ['Ctrl+Enter', 'draw.to3d'],
]

const ShortcutHelp = ({ onClose }: { onClose: () => void }) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {t('draw.shortcuts')}
        </Text>
        <ScalePressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={{ padding: 4 }}>
          <Icon name="x" size={16} />
        </ScalePressable>
      </View>
      {SHORTCUTS.map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[styles.kbd, { backgroundColor: colors.surfaceAlt, borderColor: colors.line }]}>
            <Text variant="mono" style={{ fontSize: 11 }}>
              {k}
            </Text>
          </View>
          <Text variant="small" tone="soft" style={{ flex: 1 }}>
            {t(label)}
          </Text>
        </View>
      ))}
      <Text variant="small" tone="muted">
        {t('draw.sc.touch')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    zIndex: 5,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  toolBtn: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tip: { position: 'absolute', top: 40, left: -4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, zIndex: 20 },
  layerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: radius.md, borderWidth: 1.5 },
  canvas: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  status: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  help: { position: 'absolute', right: 10, top: 10, width: 290, padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  kbd: { minWidth: 92, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, alignItems: 'center' },
  inspector: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, padding: 12 },
  inspRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  inspField: { flexBasis: 110, flexGrow: 0 },
  miniBtn: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  emptyWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16 },
  empty: { maxWidth: 420, padding: 18, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth * 2, gap: 8, alignItems: 'center' },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
})
