import type { DielinePath, DielineResponse, PathCommand, Point } from './types'

/**
 * Şablona bağlı olmayan (içe aktarılmış / çizilmiş) bıçak izlerinde düzenleme:
 * kırım ızgarasına göre bölge ölçüsü değiştirme (esnetme), kırım açısı ve malzeme kalınlığı.
 * Motor tarafı (3D, tabaka, dışa aktarma) aynı nesneyi kullanır; sunucuya `paths` gider.
 */

export type Axis = 'x' | 'y'

const CLUSTER = 0.6

const pointsOf = (commands: PathCommand[]): Point[] =>
  commands.flatMap((c) => (c.c === 'Z' ? [] : c.c === 'C' ? [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }] : [{ x: c.x, y: c.y }]))

/**
 * Esnetme bölgeleri: düşey (x) ve yatay (y) kırım hatlarının konumları + açık ölçü kenarları.
 * `stops[i]..stops[i+1]` bir bölgedir.
 */
export const stretchStops = (d: DielineResponse, axis: Axis): number[] => {
  const lo = axis === 'x' ? d.bounds.x : d.bounds.y
  const hi = lo + (axis === 'x' ? d.bounds.width : d.bounds.height)
  const found: { v: number; w: number }[] = []
  for (const p of d.paths ?? []) {
    if (p.layer !== 'crease' && p.layer !== 'perf') continue
    const pts = pointsOf(p.commands)
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!
      const b = pts[i]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 3) continue
      // x ekseninde esnetmek için düşey kırımlar gerekir.
      const across = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
      if (across > len * 0.02) continue
      found.push({ v: axis === 'x' ? (a.x + b.x) / 2 : (a.y + b.y) / 2, w: len })
    }
  }
  found.sort((p, q) => p.v - q.v)
  const merged: number[] = []
  for (const f of found) {
    const last = merged[merged.length - 1]
    if (last !== undefined && f.v - last <= CLUSTER) continue
    if (f.v - lo > CLUSTER && hi - f.v > CLUSTER) merged.push(Math.round(f.v * 100) / 100)
  }
  return [lo, ...merged, hi]
}

/** Parçalı doğrusal eşleme: eski bölge sınırları → yeni sınırlar. */
const mapper = (from: number[], to: number[]) => (v: number): number => {
  if (v <= from[0]!) return to[0]! + (v - from[0]!)
  for (let i = 1; i < from.length; i += 1) {
    if (v <= from[i]!) {
      const a = from[i - 1]!
      const b = from[i]!
      const t = b - a > 1e-9 ? (v - a) / (b - a) : 0
      return to[i - 1]! + t * (to[i]! - to[i - 1]!)
    }
  }
  return to[to.length - 1]! + (v - from[from.length - 1]!)
}

/** Kapalı ve küçük alt yollar (delik, oyuk, askı deliği) esnetilmez, yalnız kaydırılır. */
const subpaths = (commands: PathCommand[]): PathCommand[][] => {
  const out: PathCommand[][] = []
  for (const c of commands) {
    if (c.c === 'M' || out.length === 0) out.push([c])
    else out[out.length - 1]!.push(c)
  }
  return out
}

const isSmallClosed = (cmds: PathCommand[], zoneOf: (p: Point) => number): boolean => {
  const pts = pointsOf(cmds)
  if (pts.length < 3) return false
  const zone = zoneOf({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length })
  const closed = cmds.some((c) => c.c === 'Z') || Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y) < 0.2
  if (!closed) return false
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < zone * 0.45
}

const mapCommands = (cmds: PathCommand[], f: (p: Point) => Point): PathCommand[] =>
  cmds.map((c) => {
    if (c.c === 'Z') return c
    if (c.c === 'C') {
      const p1 = f({ x: c.x1, y: c.y1 })
      const p2 = f({ x: c.x2, y: c.y2 })
      const p = f({ x: c.x, y: c.y })
      return { ...c, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y }
    }
    const p = f({ x: c.x, y: c.y })
    return { ...c, x: p.x, y: p.y }
  })

const pathLength = (commands: PathCommand[]): number => {
  let len = 0
  let prev: Point | null = null
  let start: Point | null = null
  for (const c of commands) {
    if (c.c === 'Z') {
      if (prev && start) len += Math.hypot(start.x - prev.x, start.y - prev.y)
      prev = start
      continue
    }
    const p = { x: c.x, y: c.y }
    if (c.c === 'M') start = p
    else if (prev) len += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return len
}

/**
 * Bir eksende bölge ölçülerini değiştirir. `sizes` yeni bölge genişlikleri (mm),
 * `stretchStops` sırasıyla. Kırım, kesim, paneller ve kırım eksenleri birlikte esner.
 */
export const stretchDieline = (d: DielineResponse, axis: Axis, sizes: number[]): DielineResponse => {
  const from = stretchStops(d, axis)
  if (sizes.length !== from.length - 1) return d
  const to = [from[0]!]
  for (const s of sizes) to.push(to[to.length - 1]! + Math.max(0.5, s))
  const m = mapper(from, to)
  // Alt yolun merkezinin bulunduğu (eski) bölgenin genişliği.
  const zoneOf = (p: Point) => {
    const v = axis === 'x' ? p.x : p.y
    for (let i = 1; i < from.length; i += 1) if (v <= from[i]!) return from[i]! - from[i - 1]!
    return from[from.length - 1]! - from[from.length - 2]!
  }
  const f = (p: Point): Point => (axis === 'x' ? { x: m(p.x), y: p.y } : { x: p.x, y: m(p.y) })
  const shiftOnly = (cmds: PathCommand[]) => {
    const pts = pointsOf(cmds)
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
    const moved = f(c)
    return mapCommands(cmds, (p) => ({ x: p.x + moved.x - c.x, y: p.y + moved.y - c.y }))
  }
  const paths: DielinePath[] = (d.paths ?? []).map((p) => ({
    ...p,
    commands: subpaths(p.commands).flatMap((sub) => (isSmallClosed(sub, zoneOf) ? shiftOnly(sub) : mapCommands(sub, f))),
  }))
  const mapRing = (ring: Point[]) => ring.map(f)
  // Panel delikleri de çizimdeki gibi: küçükse yalnız kayar (3D'deki delik çizgiyle örtüşsün).
  const mapHole = (ring: Point[]) => {
    const cmds = ring.map((p, i) => ({ c: i === 0 ? 'M' : 'L', x: p.x, y: p.y }) as PathCommand)
    return isSmallClosed([...cmds, { c: 'Z' }], zoneOf) ? pointsOf(shiftOnly(cmds)) : mapRing(ring)
  }
  const panels = d.panels.map((p) => ({ ...p, outline: mapRing(p.outline), ...(p.holes ? { holes: p.holes.map(mapHole) } : {}) }))
  const folds = d.folds.map((fo) => ({ ...fo, axis: [f(fo.axis[0]), f(fo.axis[1])] as [Point, Point] }))
  const total = to[to.length - 1]! - to[0]!
  const bounds = axis === 'x' ? { ...d.bounds, width: total } : { ...d.bounds, height: total }
  const cut = paths.filter((p) => p.layer === 'cut').reduce((s, p) => s + pathLength(p.commands), 0)
  const crease = paths.filter((p) => p.layer === 'crease').reduce((s, p) => s + pathLength(p.commands), 0)
  return {
    ...d,
    paths,
    panels,
    folds,
    bounds,
    stats: {
      ...d.stats,
      flatWidth: bounds.width,
      flatHeight: bounds.height,
      boundingArea: bounds.width * bounds.height,
      cutLength: Math.round(cut * 100) / 100,
      creaseLength: Math.round(crease * 100) / 100,
    },
  }
}

/** Kırımın kapalı haldeki açısını değiştirir (işaret = katlanma yönü). */
export const setFoldAngle = (d: DielineResponse, foldId: string, angle: number): DielineResponse => ({
  ...d,
  folds: d.folds.map((f) => (f.id === foldId ? { ...f, angle: Math.max(-180, Math.min(180, angle)) } : f)),
})

/** Malzeme kalınlığı (mm) — 3D katman payı ve tabaka çıktısı. */
export const setCaliper = (d: DielineResponse, caliper: number): DielineResponse => ({
  ...d,
  meta: { ...d.meta, caliper: Math.max(0.1, Math.min(10, caliper)) },
})

/** Benzer ölçüdeki bölgeler (ör. ön/arka duvar) birlikte değişsin diye gruplar. */
export const linkedZones = (sizes: number[], index: number, tolerance = 0.5): number[] =>
  sizes.map((s, i) => (Math.abs(s - sizes[index]!) <= tolerance ? i : -1)).filter((i) => i >= 0)
