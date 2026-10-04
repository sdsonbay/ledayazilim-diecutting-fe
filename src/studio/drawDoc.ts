/**
 * Stüdyo çizim belgesi — platformdan bağımsız saf fonksiyonlar. Birim mm, y aşağı (ekran gibi).
 * Şekil: kesim ya da kırım katmanında açık/kapalı çoklu çizgi.
 */
import type { DielineResponse, PathCommand } from '../lib/types'

export type Layer = 'cut' | 'crease'

export interface Pt {
  x: number
  y: number
}

export interface Shape {
  id: string
  layer: Layer
  points: Pt[]
  closed: boolean
}

export type Tool = 'select' | 'line' | 'rect' | 'roundrect' | 'ellipse' | 'polygon' | 'hole'

export const SHAPE_TOOLS: Tool[] = ['rect', 'roundrect', 'ellipse', 'polygon', 'hole']

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Geometri yardımcıları
// ---------------------------------------------------------------------------

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const segmentsOf = (s: Shape): [Pt, Pt][] => {
  const out: [Pt, Pt][] = []
  const n = s.closed ? s.points.length : s.points.length - 1
  for (let i = 0; i < n; i += 1) out.push([s.points[i]!, s.points[(i + 1) % s.points.length]!])
  return out
}

export const bboxOf = (shapes: Shape[]): Box | null => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of shapes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

export const projectOnSegment = (p: Pt, a: Pt, b: Pt): { q: Pt; d: number; t: number } => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const q = { x: a.x + dx * t, y: a.y + dy * t }
  return { q, d: Math.hypot(p.x - q.x, p.y - q.y), t }
}

const segIntersection = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return { x: a.x + rx * t, y: a.y + ry * t }
}

export const pointInPolygon = (p: Pt, poly: Pt[]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** En üstteki (son çizilen) şekil önce. Kapalı şekillerin içi de tıklanabilir (delik/pencere). */
export const hitShape = (p: Pt, shapes: Shape[], tol: number): string | null => {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const s = shapes[i]!
    for (const [a, b] of segmentsOf(s)) if (projectOnSegment(p, a, b).d <= tol) return s.id
  }
  return null
}

export const hitVertex = (p: Pt, s: Shape, tol: number): number => {
  let best = -1
  let bestD = tol
  s.points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Seçim kutusu: soldan sağa çekilince tamamen içeride kalanlar, sağdan sola çekilince değenler. */
export const marqueeSelect = (shapes: Shape[], a: Pt, b: Pt): string[] => {
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
  const inside = (p: Pt) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
  const crossing = b.x < a.x
  const edges: [Pt, Pt][] = [
    [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }],
    [{ x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }],
    [{ x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }],
    [{ x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }],
  ]
  return shapes
    .filter((s) =>
      crossing
        ? s.points.some(inside) || segmentsOf(s).some(([p, q]) => edges.some(([c, d]) => segIntersection(p, q, c, d)))
        : s.points.every(inside),
    )
    .map((s) => s.id)
}

// ---------------------------------------------------------------------------
// Yakalama
// ---------------------------------------------------------------------------

export type SnapKind = 'end' | 'mid' | 'inter' | 'edge' | 'align' | 'grid' | 'free'

export interface SnapResult {
  point: Pt
  kind: SnapKind
  /** Hizalama kılavuzu (x ya da y sabit) — ekranda kesikli çizgi. */
  guides: { axis: 'x' | 'y'; value: number }[]
}

export interface SnapOptions {
  /** Yakalama mesafesi (mm). */
  tol: number
  /** Izgara adımı (mm); 0 kapalı. */
  grid: number
  /** Nesnelere yakalama (köşe, orta nokta, kesişim, kenar, hizalama). */
  objects: boolean
  exclude?: Set<string>
}

export const snapPoint = (raw: Pt, shapes: Shape[], opts: SnapOptions): SnapResult => {
  const free: SnapResult = { point: { x: r2(raw.x), y: r2(raw.y) }, kind: 'free', guides: [] }
  const list = opts.exclude ? shapes.filter((s) => !opts.exclude!.has(s.id)) : shapes
  if (opts.objects) {
    let best: SnapResult | null = null
    let bestD = opts.tol
    const consider = (q: Pt, kind: SnapKind, weight = 1) => {
      const d = Math.hypot(q.x - raw.x, q.y - raw.y) * weight
      if (d <= bestD) {
        bestD = d
        best = { point: q, kind, guides: [] }
      }
    }
    const near: [Pt, Pt][] = []
    for (const s of list) {
      for (const p of s.points) consider(p, 'end', 0.8)
      for (const [a, b] of segmentsOf(s)) {
        if (projectOnSegment(raw, a, b).d > opts.tol * 3) continue
        near.push([a, b])
        consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'mid', 0.9)
      }
    }
    for (let i = 0; i < near.length; i += 1) {
      for (let j = i + 1; j < near.length; j += 1) {
        const x = segIntersection(near[i]![0], near[i]![1], near[j]![0], near[j]![1])
        if (x) consider(x, 'inter', 0.85)
      }
    }
    if (best) return best
    let edge: SnapResult | null = null
    let edgeD = opts.tol * 0.7
    for (const [a, b] of near) {
      const hit = projectOnSegment(raw, a, b)
      if (hit.d < edgeD) {
        edgeD = hit.d
        edge = { point: hit.q, kind: 'edge', guides: [] }
      }
    }
    if (edge) return edge
    // Hizalama: başka bir köşeyle aynı x / y.
    let ax: number | null = null
    let ay: number | null = null
    let dx = opts.tol * 0.6
    let dy = opts.tol * 0.6
    for (const s of list) {
      for (const p of s.points) {
        if (Math.abs(p.x - raw.x) < dx) {
          dx = Math.abs(p.x - raw.x)
          ax = p.x
        }
        if (Math.abs(p.y - raw.y) < dy) {
          dy = Math.abs(p.y - raw.y)
          ay = p.y
        }
      }
    }
    if (ax !== null || ay !== null) {
      const g = opts.grid > 0 ? (v: number) => Math.round(v / opts.grid) * opts.grid : r2
      return {
        point: { x: ax ?? g(raw.x), y: ay ?? g(raw.y) },
        kind: 'align',
        guides: [...(ax !== null ? [{ axis: 'x' as const, value: ax }] : []), ...(ay !== null ? [{ axis: 'y' as const, value: ay }] : [])],
      }
    }
  }
  if (opts.grid > 0) {
    return { point: { x: Math.round(raw.x / opts.grid) * opts.grid, y: Math.round(raw.y / opts.grid) * opts.grid }, kind: 'grid', guides: [] }
  }
  return free
}

/**
 * Doğrultma: `force` (Shift) ile en yakın 15° katı; değilse yatay/dikey/45°'ye
 * 6° içinde yaklaşan çizgi kendiliğinden düzelir (dokunmatikte Shift yok).
 */
export const straighten = (from: Pt, to: Pt, force: boolean): Pt => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return to
  const angle = Math.atan2(dy, dx)
  const step = force ? Math.PI / 12 : Math.PI / 4
  const snapped = Math.round(angle / step) * step
  if (!force && Math.abs(snapped - angle) > (6 * Math.PI) / 180) return to
  return { x: r2(from.x + len * Math.cos(snapped)), y: r2(from.y + len * Math.sin(snapped)) }
}

// ---------------------------------------------------------------------------
// Şekil üreticiler
// ---------------------------------------------------------------------------

const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const roundedRectPts = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (rr < 0.4) return rectPts(x, y, w, h)
  const segs = Math.max(6, Math.min(16, Math.round(rr / 1.2)))
  const arc = (cx: number, cy: number, a0: number, a1: number): Pt[] =>
    Array.from({ length: segs + 1 }, (_, i) => {
      const t = a0 + ((a1 - a0) * i) / segs
      return { x: r2(cx + rr * Math.cos(t)), y: r2(cy + rr * Math.sin(t)) }
    })
  return [
    ...arc(x + rr, y + rr, Math.PI, Math.PI * 1.5),
    ...arc(x + w - rr, y + rr, -Math.PI / 2, 0),
    ...arc(x + w - rr, y + h - rr, 0, Math.PI / 2),
    ...arc(x + rr, y + h - rr, Math.PI / 2, Math.PI),
  ]
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number): Pt[] => {
  const count = Math.max(32, Math.min(96, Math.round((rx + ry) * 0.8)))
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 2
    return { x: r2(cx + Math.max(rx, 0.5) * Math.cos(t)), y: r2(cy + Math.max(ry, 0.5) * Math.sin(t)) }
  })
}

const polygonPts = (cx: number, cy: number, rx: number, ry: number, sides: number): Pt[] => {
  const n = Math.max(3, Math.min(16, Math.round(sides)))
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: r2(cx + Math.max(rx, 0.5) * Math.cos(t)), y: r2(cy + Math.max(ry, 0.5) * Math.sin(t)) }
  })
}

export interface ShapeOptions {
  radius: number
  sides: number
  /** Kare / daire (Shift). */
  square: boolean
}

export const dragBox = (a: Pt, b: Pt, square: boolean): Box => {
  let w = b.x - a.x
  let h = b.y - a.y
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * m
    h = Math.sign(h || 1) * m
  }
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) }
}

export const shapeFromDrag = (tool: Tool, a: Pt, b: Pt, opts: ShapeOptions): Pt[] => {
  const { x, y, w, h } = dragBox(a, b, opts.square)
  if (tool === 'rect') return rectPts(x, y, w, h)
  if (tool === 'roundrect') return roundedRectPts(x, y, w, h, opts.radius)
  if (tool === 'hole') return roundedRectPts(x, y, w, h, Math.min(w, h) / 2)
  if (tool === 'polygon') return polygonPts(x + w / 2, y + h / 2, w / 2, h / 2, opts.sides)
  return ellipsePts(x + w / 2, y + h / 2, w / 2, h / 2)
}

// ---------------------------------------------------------------------------
// Dönüşümler (seçili şekiller)
// ---------------------------------------------------------------------------

const mapSel = (shapes: Shape[], ids: Set<string>, f: (p: Pt) => Pt): Shape[] =>
  shapes.map((s) => (ids.has(s.id) ? { ...s, points: s.points.map((p) => { const q = f(p); return { x: r2(q.x), y: r2(q.y) } }) } : s))

export const translateSel = (shapes: Shape[], ids: Set<string>, dx: number, dy: number) => mapSel(shapes, ids, (p) => ({ x: p.x + dx, y: p.y + dy }))

export const scaleSel = (shapes: Shape[], ids: Set<string>, origin: Pt, sx: number, sy: number) =>
  mapSel(shapes, ids, (p) => ({ x: origin.x + (p.x - origin.x) * sx, y: origin.y + (p.y - origin.y) * sy }))

export const rotateSel = (shapes: Shape[], ids: Set<string>, origin: Pt, degrees: number) => {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return mapSel(shapes, ids, (p) => ({ x: origin.x + (p.x - origin.x) * c - (p.y - origin.y) * s, y: origin.y + (p.x - origin.x) * s + (p.y - origin.y) * c }))
}

export const flipSel = (shapes: Shape[], ids: Set<string>, origin: Pt, axis: 'h' | 'v') =>
  mapSel(shapes, ids, (p) => (axis === 'h' ? { x: 2 * origin.x - p.x, y: p.y } : { x: p.x, y: 2 * origin.y - p.y }))

export const duplicateSel = (shapes: Shape[], ids: Set<string>, offset: number): { shapes: Shape[]; ids: string[] } => {
  const copies = shapes.filter((s) => ids.has(s.id)).map((s) => ({ ...s, id: uid(), points: s.points.map((p) => ({ x: p.x + offset, y: p.y + offset })) }))
  return { shapes: [...shapes, ...copies], ids: copies.map((c) => c.id) }
}

export const setLayerSel = (shapes: Shape[], ids: Set<string>, layer: Layer) => shapes.map((s) => (ids.has(s.id) ? { ...s, layer } : s))

export const moveVertex = (shapes: Shape[], id: string, index: number, p: Pt) =>
  shapes.map((s) => (s.id === id ? { ...s, points: s.points.map((q, i) => (i === index ? { x: r2(p.x), y: r2(p.y) } : q)) } : s))

/** İki noktalı çizgi: başlangıç sabit, uzunluk / açı değişir. */
export const setLine = (shapes: Shape[], id: string, length: number, degrees: number) =>
  shapes.map((s) => {
    if (s.id !== id || s.points.length !== 2) return s
    const a = s.points[0]!
    const t = (degrees * Math.PI) / 180
    return { ...s, points: [a, { x: r2(a.x + length * Math.cos(t)), y: r2(a.y + length * Math.sin(t)) }] }
  })

export const lineInfo = (s: Shape): { length: number; angle: number } | null => {
  if (s.points.length !== 2 || s.closed) return null
  const [a, b] = s.points as [Pt, Pt]
  return { length: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

export const pathLength = (pts: Pt[], closed: boolean): number => {
  let len = 0
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  if (closed && pts.length > 2) len += Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y)
  return len
}

// ---------------------------------------------------------------------------
// Giriş / çıkış
// ---------------------------------------------------------------------------

export const dOf = (points: Pt[], closed: boolean): string => {
  const [first, ...rest] = points
  if (!first) return ''
  let d = `M${r2(first.x)} ${r2(first.y)}`
  for (const p of rest) d += `L${r2(p.x)} ${r2(p.y)}`
  return closed ? `${d}Z` : d
}

/** İçe aktarıcının tanıdığı katman adları ve renkleriyle SVG (kesim kırmızı, kırım yeşil). */
export const shapesToSvg = (shapes: Shape[]): string => {
  const box = bboxOf(shapes) ?? { x: 0, y: 0, w: 100, h: 100 }
  const m = 5
  const vb = `${r2(box.x - m)} ${r2(box.y - m)} ${r2(box.w + 2 * m)} ${r2(box.h + 2 * m)}`
  const layer = (l: Layer) => shapes.filter((s) => s.layer === l && s.points.length > 1).map((s) => `<path d="${dOf(s.points, s.closed)}"/>`)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(box.w + 2 * m)}mm" height="${r2(box.h + 2 * m)}mm" viewBox="${vb}">`,
    `<g id="layer-cut" data-layer="CUT" fill="none" stroke="#E4002B" stroke-width="0.5">`,
    ...layer('cut'),
    `</g>`,
    `<g id="layer-crease" data-layer="CREASE" fill="none" stroke="#00A651" stroke-width="0.4">`,
    ...layer('crease'),
    `</g>`,
    `</svg>`,
  ].join('')
}

/** SVG yay → nokta dizisi (merkez parametrelemesi). */
const arcPoints = (from: Pt, c: Extract<PathCommand, { c: 'A' }>): Pt[] => {
  const to = { x: c.x, y: c.y }
  let rx = Math.abs(c.rx)
  let ry = Math.abs(c.ry)
  if (rx < 1e-9 || ry < 1e-9) return [to]
  const phi = (c.rot * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const k = (c.large === c.sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx1 = (k * rx * y1) / ry
  const cy1 = (-k * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!c.sweep && dt > 0) dt -= Math.PI * 2
  if (c.sweep && dt < 0) dt += Math.PI * 2
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 18)))
  return Array.from({ length: n }, (_, i) => {
    const t = t1 + (dt * (i + 1)) / n
    return { x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos }
  })
}

/** Bıçak izinden (motor koordinatı, y yukarı) düzenlenebilir şekillere. */
export const shapesFromDieline = (d: DielineResponse): Shape[] => {
  const top = d.bounds.y + d.bounds.height
  const flip = (p: Pt): Pt => ({ x: r2(p.x - d.bounds.x), y: r2(top - p.y) })
  const out: Shape[] = []
  for (const path of d.paths ?? []) {
    const layer: Layer | null = path.layer === 'cut' ? 'cut' : path.layer === 'crease' || path.layer === 'perf' ? 'crease' : null
    if (!layer) continue
    let pts: Pt[] = []
    let start: Pt | null = null
    const flush = (closed: boolean) => {
      if (pts.length > 1) out.push({ id: uid(), layer, points: pts.map(flip), closed })
      pts = []
    }
    for (const c of path.commands) {
      if (c.c === 'M') {
        flush(false)
        start = { x: c.x, y: c.y }
        pts = [start]
      } else if (c.c === 'L') pts.push({ x: c.x, y: c.y })
      else if (c.c === 'C') {
        const p0 = pts[pts.length - 1] ?? { x: c.x1, y: c.y1 }
        for (let i = 1; i <= 8; i += 1) {
          const t = i / 8
          const u = 1 - t
          pts.push({
            x: u * u * u * p0.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            y: u * u * u * p0.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          })
        }
      } else if (c.c === 'A') pts.push(...arcPoints(pts[pts.length - 1] ?? { x: c.x, y: c.y }, c))
      else if (c.c === 'Z') {
        if (start && pts.length > 1 && Math.hypot(pts[pts.length - 1]!.x - start.x, pts[pts.length - 1]!.y - start.y) < 0.01) pts.pop()
        flush(true)
      }
    }
    flush(false)
  }
  return out
}

/** Başlangıç için açık tepsi (taban + 4 duvar). */
export const openTray = (length: number, width: number, height: number, at: Pt = { x: 0, y: 0 }): Shape[] => {
  const L = Math.max(30, length)
  const W = Math.max(30, width)
  const H = Math.max(10, height)
  const ox = at.x + H
  const oy = at.y + H
  const line = (a: Pt, b: Pt): Shape => ({ id: uid(), layer: 'crease', closed: false, points: [a, b] })
  return [
    {
      id: uid(),
      layer: 'cut',
      closed: true,
      points: [
        { x: ox, y: oy - H },
        { x: ox + L, y: oy - H },
        { x: ox + L, y: oy },
        { x: ox + L + H, y: oy },
        { x: ox + L + H, y: oy + W },
        { x: ox + L, y: oy + W },
        { x: ox + L, y: oy + W + H },
        { x: ox, y: oy + W + H },
        { x: ox, y: oy + W },
        { x: ox - H, y: oy + W },
        { x: ox - H, y: oy },
        { x: ox, y: oy },
      ],
    },
    line({ x: ox, y: oy }, { x: ox + L, y: oy }),
    line({ x: ox + L, y: oy }, { x: ox + L, y: oy + W }),
    line({ x: ox + L, y: oy + W }, { x: ox, y: oy + W }),
    line({ x: ox, y: oy + W }, { x: ox, y: oy }),
  ]
}

/** Belgeyi doğrular (kalıcı taslaktan okurken bozuk veri uygulamayı düşürmesin). */
export const parseShapes = (raw: string | null): Shape[] | null => {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return null
    const out: Shape[] = []
    for (const s of value as Partial<Shape>[]) {
      if (!s || (s.layer !== 'cut' && s.layer !== 'crease') || !Array.isArray(s.points)) continue
      const points = s.points.filter((p): p is Pt => Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y))
      if (points.length < 2) continue
      out.push({ id: typeof s.id === 'string' ? s.id : uid(), layer: s.layer, points, closed: Boolean(s.closed) })
    }
    return out
  } catch {
    return null
  }
}
