/** Stüdyo çizim geometrisi — platformdan bağımsız (referans DiecutCanvas'tan). Birimler mm. */

export type DrawTool = 'select' | 'cut' | 'crease' | 'rect' | 'roundrect' | 'oval' | 'hole' | 'poly'

export interface Pt {
  x: number
  y: number
}

export interface Stroke {
  id: string
  layer: 'cut' | 'crease'
  points: Pt[]
  closed: boolean
}

interface Seg {
  a: Pt
  b: Pt
}

export const PAPER = { width: 420, height: 300 }
const SNAP = 5
const HIT = 4

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export const clampPaper = (p: Pt): Pt => ({
  x: Math.min(PAPER.width, Math.max(0, p.x)),
  y: Math.min(PAPER.height, Math.max(0, p.y)),
})

export const dOf = (points: Pt[], closed: boolean): string => {
  const [first, ...rest] = points
  if (!first) return ''
  let d = `M${r1(first.x)} ${r1(first.y)}`
  for (const p of rest) d += `L${r1(p.x)} ${r1(p.y)}`
  return closed ? `${d}Z` : d
}

const r1 = (n: number) => Math.round(n * 100) / 100

/** İçe aktarıcının tanıdığı katman adları ve renkleriyle SVG. */
export const strokesToSvg = (strokes: Stroke[]): string => {
  const cut = strokes.filter((s) => s.layer === 'cut' && s.points.length > 1)
  const crease = strokes.filter((s) => s.layer === 'crease' && s.points.length > 1)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.width}mm" height="${PAPER.height}mm" viewBox="0 0 ${PAPER.width} ${PAPER.height}">`,
    `<g id="layer-cut" data-layer="CUT" fill="none" stroke="#ff2d2d" stroke-width="0.5">`,
    ...cut.map((s) => `<path d="${dOf(s.points, s.closed)}"/>`),
    `</g>`,
    `<g id="layer-crease" data-layer="CREASE" fill="none" stroke="#00a651" stroke-width="0.4">`,
    ...crease.map((s) => `<path d="${dOf(s.points, s.closed)}"/>`),
    `</g>`,
    `</svg>`,
  ].join('')
}

/** Başlangıç için açık tepsi (taban + 4 duvar). */
export const openTrayStrokes = (length: number, width: number, height: number): Stroke[] => {
  const L = Math.max(30, length)
  const W = Math.max(30, width)
  const H = Math.max(10, height)
  const ox = H + 20
  const oy = H + 20
  const line = (a: Pt, b: Pt): Stroke => ({ id: uid(), layer: 'crease', closed: false, points: [a, b] })
  return [
    {
      id: uid(),
      layer: 'cut',
      closed: true,
      points: [
        { x: ox, y: oy },
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
      ],
    },
    line({ x: ox, y: oy }, { x: ox + L, y: oy }),
    line({ x: ox + L, y: oy }, { x: ox + L, y: oy + W }),
    line({ x: ox + L, y: oy + W }, { x: ox, y: oy + W }),
    line({ x: ox, y: oy + W }, { x: ox, y: oy }),
  ]
}

const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return { dist: Math.hypot(p.x - a.x, p.y - a.y), q: a }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const q = { x: a.x + dx * t, y: a.y + dy * t }
  return { dist: Math.hypot(p.x - q.x, p.y - q.y), q }
}

const segmentsOf = (strokes: Stroke[]): Seg[] => {
  const segs: Seg[] = []
  for (const s of strokes) {
    const n = s.closed ? s.points.length : Math.max(s.points.length - 1, 0)
    for (let i = 0; i < n; i += 1) {
      const a = s.points[i]
      const b = s.points[(i + 1) % s.points.length]
      if (a && b) segs.push({ a, b })
    }
  }
  return segs
}

export interface SnapHit {
  point: Pt
  kind: 'vertex' | 'edge' | 'grid' | 'free'
}

/**
 * Parmak ucu fareden kaba: yakalama yarıçapları ekrandaki ölçeğe göre verilir.
 * Öncelik: köşe → kenar → ızgara.
 */
export const snapPoint = (raw: Pt, strokes: Stroke[], grid: boolean, tolerance: number): SnapHit => {
  let best: Pt | null = null
  let bestD = tolerance * 1.4
  for (const s of strokes) {
    for (const q of s.points.length > 24 ? [s.points[0]!, s.points[s.points.length - 1]!] : s.points) {
      const d = Math.hypot(q.x - raw.x, q.y - raw.y)
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
  }
  if (best) return { point: best, kind: 'vertex' }
  let edge: Pt | null = null
  let edgeD = tolerance * 0.8
  for (const seg of segmentsOf(strokes)) {
    const hit = distToSeg(raw, seg.a, seg.b)
    if (hit.dist < edgeD) {
      edgeD = hit.dist
      edge = hit.q
    }
  }
  if (edge) return { point: clampPaper(edge), kind: 'edge' }
  if (grid) return { point: clampPaper({ x: Math.round(raw.x / SNAP) * SNAP, y: Math.round(raw.y / SNAP) * SNAP }), kind: 'grid' }
  return { point: clampPaper({ x: Math.round(raw.x * 10) / 10, y: Math.round(raw.y * 10) / 10 }), kind: 'free' }
}

/** Dokunmatikte Shift yok: 45° katlarına 7° içinde yaklaşan çizgi kendiliğinden düzelir. */
export const softStraighten = (from: Pt, to: Pt): Pt => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return to
  const angle = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snapped = Math.round(angle / step) * step
  if (Math.abs(snapped - angle) > (7 * Math.PI) / 180) return to
  return clampPaper({ x: from.x + len * Math.cos(snapped), y: from.y + len * Math.sin(snapped) })
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number): Pt[] => {
  const count = Math.max(28, Math.min(72, Math.round((rx + ry) * 0.9)))
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 2
    return { x: cx + Math.max(rx, 0.5) * Math.cos(t), y: cy + Math.max(ry, 0.5) * Math.sin(t) }
  })
}

const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const roundedRectPts = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (rr < 0.4) return rectPts(x, y, w, h)
  const segs = Math.max(6, Math.min(14, Math.round(rr / 1.6)))
  const arc = (cx: number, cy: number, a0: number, a1: number): Pt[] =>
    Array.from({ length: segs + 1 }, (_, i) => {
      const t = a0 + ((a1 - a0) * i) / segs
      return { x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) }
    })
  return [
    ...arc(x + rr, y + rr, Math.PI, Math.PI * 1.5),
    ...arc(x + w - rr, y + rr, -Math.PI / 2, 0),
    ...arc(x + w - rr, y + h - rr, 0, Math.PI / 2),
    ...arc(x + rr, y + h - rr, Math.PI / 2, Math.PI),
  ]
}

const regularPolyPts = (cx: number, cy: number, rx: number, ry: number, sides: number): Pt[] => {
  const n = Math.max(3, Math.min(16, Math.round(sides)))
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: cx + Math.max(rx, 0.5) * Math.cos(t), y: cy + Math.max(ry, 0.5) * Math.sin(t) }
  })
}

export const isShapeTool = (tool: DrawTool) => tool === 'rect' || tool === 'roundrect' || tool === 'oval' || tool === 'hole' || tool === 'poly'

export const shapePoints = (tool: DrawTool, a: Pt, b: Pt, radius: number, polySides: number): Pt[] => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  if (tool === 'rect') return rectPts(x, y, w, h)
  if (tool === 'roundrect' || tool === 'hole') return roundedRectPts(x, y, w, h, tool === 'hole' ? Math.min(radius, w / 2, h / 2) : radius)
  if (tool === 'poly') return regularPolyPts(x + w / 2, y + h / 2, w / 2, h / 2, polySides)
  return ellipsePts(x + w / 2, y + h / 2, w / 2, h / 2)
}

export const hitStroke = (p: Pt, strokes: Stroke[], tolerance = HIT): string | null => {
  let bestId: string | null = null
  let best = tolerance
  for (const s of strokes) {
    const n = s.closed ? s.points.length : Math.max(s.points.length - 1, 0)
    for (let i = 0; i < n; i += 1) {
      const a = s.points[i]
      const b = s.points[(i + 1) % s.points.length]
      if (!a || !b) continue
      const d = distToSeg(p, a, b).dist
      if (d < best) {
        best = d
        bestId = s.id
      }
    }
  }
  return bestId
}

export const translateStroke = (s: Stroke, dx: number, dy: number): Stroke => ({
  ...s,
  points: s.points.map((p) => clampPaper({ x: p.x + dx, y: p.y + dy })),
})
