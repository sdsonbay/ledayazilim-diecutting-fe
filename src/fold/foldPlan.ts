import * as THREE from 'three'
import type { DielineResponse, Panel, Point } from '../lib/types'

/**
 * Katlama planı: gerçek karton gibi katlanan, parçaları iç içe geçmeyen 3D montaj.
 *
 * 1. Menteşe: her kırım kartonun İÇ yüzeyindeki çizgi etrafında döner (düz halde y=0 iç, y=t dış
 *    yüzey). 90°'de köşe kapanır, 180°'de parça tam bir kalınlık altına/üstüne oturur.
 * 2. Sıra: paneller rolüne ve dieline'daki konumuna göre aşamalara ayrılır — önce gövde,
 *    sonra alt toz kapakları → alt kapak/dil → üst toz kapakları → üst kapak/dil.
 * 3. Katmanlama: kapalı pozda her panel kendisinden önce yerleşenlerle sayısal olarak sınanır;
 *    çakışıyorsa menteşesi bir kalınlık dışarı kaydırılır (kapak toz kapaklarının üstüne biner).
 */

export interface PlanJoint {
  id: string
  parentId: string
  childId: string
  /** Birim kırım ekseni (3D, düz düzlemde). */
  axis: THREE.Vector3
  /** Eksen üzerinde bir nokta (y=0). */
  origin: THREE.Vector3
  /** Düzlem içinde eksenden çocuğa doğru birim yön. */
  inward: THREE.Vector3
  /** Kapalı halde dönüş açısı (derece, işaretli; dönüş = -angle). */
  angle: number
  /** Çocuk panel -y (iç yüz) tarafına mı döner. */
  down: boolean
  /** Montaj aşaması (küçük önce). */
  stage: number
  /** Çakışma çözücünün verdiği katman (0 = doğrudan iç yüzey menteşesi). */
  layer: number
  /** Zaman penceresi [0..1]. */
  start: number
  end: number
}

export interface FoldStep {
  /** Bu adımda katlanan panellerin baskın rolü. */
  kind: 'body' | 'glue' | 'dust' | 'closure' | 'lock'
  side: 'a' | 'b' | 'none'
  start: number
  end: number
}

export const toV = (p: Point, y = 0): THREE.Vector3 => new THREE.Vector3(p.x, y, -p.y)

const centroid2d = (pts: Point[]): Point => {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  const n = Math.max(pts.length, 1)
  return { x: x / n, y: y / n }
}

/** Referans motorla aynı işaret kuralı: çocuğun eksene göre tarafından dönüş yönü. */
const signedFoldAngle = (axis: [Point, Point], childOutline: Point[], angle: number): number => {
  const mag = Math.abs(angle)
  if (mag < 1e-6) return 0
  const [a, b] = axis
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-8) return angle
  const c = centroid2d(childOutline)
  const cross = dx * (c.y - a.y) - dy * (c.x - a.x)
  if (Math.abs(cross) < len * 0.15) return angle
  return cross < 0 ? mag : -mag
}

const closedAngle = (role: string, angle: number): number => {
  const mag = Math.abs(angle)
  if (mag < 1e-6) return 0
  const sign = angle < 0 ? -1 : 1
  // Kilit dilleri yuvaya girerken tam dik değil.
  if (role === 'lock') return sign * Math.min(mag, 88)
  return sign * Math.min(mag, 180)
}

const BODY = new Set(['wall', 'bottom'])

const ROLE_STAGE: Record<string, number> = {
  wall: 0,
  bottom: 0,
  glue: 0.45,
  gusset: 0.45,
  dust: 1,
  lid: 2,
  flap: 2,
  lock: 2.6,
}

const SIDE_SPAN = 2.4

/** Kırımın pivot noktası (ebeveyn yerel = düz koordinat). */
export const pivotOf = (j: PlanJoint, thickness: number): THREE.Vector3 => {
  const theta = THREE.MathUtils.degToRad(Math.abs(j.angle))
  const k = j.layer * thickness
  const along = k * Math.max(0, Math.sin(theta))
  const normal = k * 0.5 * Math.max(0, -Math.cos(theta))
  const p = j.origin.clone().addScaledVector(j.inward, along)
  p.y = j.down ? -normal : thickness + normal
  return p
}

const rotationOf = (j: PlanJoint, progress: number) =>
  new THREE.Quaternion().setFromAxisAngle(j.axis, THREE.MathUtils.degToRad(-j.angle * progress))

/** Kırımın ebeveyne göre dönüşümü: T(p) · R · T(-p). */
export const jointMatrix = (j: PlanJoint, thickness: number, progress: number): THREE.Matrix4 => {
  const p = pivotOf(j, thickness)
  return new THREE.Matrix4()
    .makeTranslation(p.x, p.y, p.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotationOf(j, progress)))
    .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z))
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10))

/** Genel zaman (0..1) → kırımın kendi ilerlemesi; aşama penceresi içinde yumuşak. */
export const jointProgress = (j: { start: number; end: number }, time: number): number =>
  smooth((time - j.start) / Math.max(1e-6, j.end - j.start))

// ───────────────────────── çakışma testi

const pointInPolygon = (x: number, y: number, poly: Point[]): boolean => {
  let inside = false
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i]!
    const b = poly[k]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside
  }
  return inside
}

const insetTowards = (p: Point, c: Point, d: number): Point => {
  const dx = c.x - p.x
  const dy = c.y - p.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return p
  const t = Math.min(d / len, 0.45)
  return { x: p.x + dx * t, y: p.y + dy * t }
}

/** Panelin iç kısmından örnek noktalar (kenarlardan uzak: köşede temas çakışma sayılmaz). */
const samplePanel = (panel: Panel, thickness: number): THREE.Vector3[] => {
  const c = centroid2d(panel.outline)
  const inset = Math.max(thickness * 2.2, 1.2)
  const ring = panel.outline.map((p) => insetTowards(p, c, inset))
  const flat: Point[] = [c, ...ring]
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    flat.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    flat.push({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 })
  }
  const inside = flat.filter((p) => pointInPolygon(p.x, p.y, panel.outline))
  const out: THREE.Vector3[] = []
  for (const p of inside) {
    out.push(toV(p, thickness * 0.3), toV(p, thickness * 0.7))
  }
  return out
}

interface Placed {
  panel: Panel
  world: THREE.Matrix4
  inverse: THREE.Matrix4
  samples: THREE.Vector3[]
}

const penetrates = (points: THREE.Vector3[], world: THREE.Matrix4, target: Placed, thickness: number): number => {
  let hits = 0
  const v = new THREE.Vector3()
  const lo = thickness * 0.06
  const hi = thickness * 0.94
  for (const p of points) {
    v.copy(p).applyMatrix4(world).applyMatrix4(target.inverse)
    if (v.y > lo && v.y < hi && pointInPolygon(v.x, -v.z, target.panel.outline)) hits += 1
  }
  return hits
}

// ───────────────────────── plan

export interface FoldPlan {
  joints: PlanJoint[]
  steps: FoldStep[]
  /** Kapalı pozda çözülemeyen çakışma sayısı (0 beklenir). */
  residual: number
}

export function planFold(dieline: DielineResponse, thickness: number): FoldPlan {
  const panels = new Map(dieline.panels.map((p) => [p.id, p]))
  const root = panels.get(dieline.rootPanel) ?? dieline.panels[0]
  const rootC = root ? centroid2d(root.outline) : { x: 0, y: 0 }

  // Ağaç: her çocuk tek bir ebeveyne bağlanır (ilk görülen).
  const byParent = new Map<string, typeof dieline.folds>()
  for (const f of dieline.folds) {
    const list = byParent.get(f.parent) ?? []
    list.push(f)
    byParent.set(f.parent, list)
  }
  const joints: PlanJoint[] = []
  const depthOf = new Map<string, number>()
  const seen = new Set<string>()
  const queue: { id: string; depth: number; stage: number }[] = root ? [{ id: root.id, depth: 0, stage: -1 }] : []
  if (root) seen.add(root.id)
  while (queue.length) {
    const { id, depth, stage: parentStage } = queue.shift()!
    depthOf.set(id, depth)
    const parent = panels.get(id)
    for (const f of byParent.get(id) ?? []) {
      if (seen.has(f.child)) continue
      const child = panels.get(f.child)
      if (!child) continue
      seen.add(f.child)
      const a = toV(f.axis[0])
      const b = toV(f.axis[1])
      const axis = b.clone().sub(a)
      if (axis.lengthSq() < 1e-8) continue
      axis.normalize()
      const cc = toV(centroid2d(child.outline))
      const toChild = cc.clone().sub(a)
      const inward = toChild.sub(axis.clone().multiplyScalar(toChild.dot(axis)))
      if (inward.lengthSq() < 1e-8) inward.set(0, 0, 1)
      inward.normalize()
      const oriented = signedFoldAngle(f.axis, child.outline, f.angle)
      const angle = closedAngle(child.role, f.reverse ? -oriented : oriented)

      // Yön: küçük bir dönüşte çocuğun merkezi aşağı mı iniyor?
      const mid = a.clone().setY(thickness / 2)
      const probe = cc.clone().setY(thickness / 2).sub(mid)
      probe.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(-angle * 0.1)))
      const down = probe.y < 0

      const closure = !BODY.has(child.role) && child.role !== 'glue' && child.role !== 'gusset'
      const side = closure ? (centroid2d(child.outline).y < rootC.y ? 0 : SIDE_SPAN) : 0
      const base = (ROLE_STAGE[child.role] ?? 1) + side
      const parentIsBody = parent ? BODY.has(parent.role) : true
      const stage = Math.max(base, parentStage < 0 ? base : parentStage + (parentIsBody ? 0 : 0.5))

      joints.push({
        id: f.id,
        parentId: id,
        childId: child.id,
        axis,
        origin: a,
        inward,
        angle,
        down,
        stage,
        layer: 0,
        start: 0,
        end: 1,
      })
      queue.push({ id: child.id, depth: depth + 1, stage })
    }
  }

  // Baskılı yüz (y=t) kutunun dışında kalmalı: gövde kırımlarının çoğu baskılı tarafa (+y)
  // katlanıyorsa montajı aynala — aksi halde kutu ters yüz kapanır (baskı içeride).
  const body = joints.filter((j) => BODY.has(panels.get(j.childId)?.role ?? '') && Math.abs(j.angle) > 1e-6)
  if (body.filter((j) => !j.down).length > body.length / 2) {
    for (const j of joints) {
      j.angle = -j.angle
      j.down = !j.down
    }
  }

  // Zaman pencereleri: aşamalar sırayla, %30 bindirmeli.
  const stages = [...new Set(joints.filter((j) => Math.abs(j.angle) > 1e-6).map((j) => j.stage))].sort((x, y) => x - y)
  const overlap = 0.3
  const n = Math.max(stages.length, 1)
  const span = 1 / (n - (n - 1) * overlap)
  const windowOf = new Map(stages.map((s, i) => [s, { start: i * span * (1 - overlap), end: i * span * (1 - overlap) + span }]))
  for (const j of joints) {
    const w = windowOf.get(j.stage) ?? { start: 0, end: 1 }
    j.start = Math.max(0, w.start)
    j.end = Math.min(1, w.end)
  }

  const steps: FoldStep[] = stages.map((s) => {
    const w = windowOf.get(s)!
    const roles = joints.filter((j) => j.stage === s).map((j) => panels.get(j.childId)?.role ?? 'wall')
    const has = (r: string) => roles.includes(r)
    const kind: FoldStep['kind'] = (has('wall') || has('bottom')) && s < 1 ? 'body' : has('glue') || has('gusset') ? 'glue' : has('lock') && !has('flap') && !has('lid') ? 'lock' : has('dust') ? 'dust' : 'closure'
    // Alt/üst ayrımı yalnızca dik duran (duvar kökenli) kutularda anlamlı: düz y ekseni yukarıyı gösterir.
    const sided = root?.role === 'wall' && kind !== 'body' && kind !== 'glue'
    const side: FoldStep['side'] = !sided ? 'none' : s >= SIDE_SPAN ? 'b' : 'a'
    return { kind, side, start: w.start, end: w.end }
  })

  // ── Katmanlama: kapalı pozda sırayla yerleştir, çakışan menteşeyi dışarı kaydır.
  const jointOfChild = new Map(joints.map((j) => [j.childId, j]))
  const worldCache = new Map<string, THREE.Matrix4>()
  const worldOf = (panelId: string): THREE.Matrix4 => {
    const cached = worldCache.get(panelId)
    if (cached) return cached
    const j = jointOfChild.get(panelId)
    const m = j ? worldOf(j.parentId).clone().multiply(jointMatrix(j, thickness, 1)) : new THREE.Matrix4()
    worldCache.set(panelId, m)
    return m
  }
  const sampleCache = new Map<string, THREE.Vector3[]>()
  const samplesOf = (panel: Panel) => {
    let s = sampleCache.get(panel.id)
    if (!s) {
      s = samplePanel(panel, thickness)
      sampleCache.set(panel.id, s)
    }
    return s
  }

  const placed: Placed[] = []
  if (root) {
    const w = worldOf(root.id)
    placed.push({ panel: root, world: w, inverse: w.clone().invert(), samples: samplesOf(root) })
  }
  const order = [...joints].sort((x, y) => x.stage - y.stage || (depthOf.get(x.childId) ?? 0) - (depthOf.get(y.childId) ?? 0))
  let residual = 0
  for (const j of order) {
    const panel = panels.get(j.childId)
    if (!panel) continue
    const others = placed.filter((p) => p.panel.id !== j.parentId)
    let best = { layer: 0, hits: Infinity }
    for (let layer = 0; layer <= 4; layer += 1) {
      j.layer = layer
      worldCache.delete(panel.id)
      const w = worldOf(panel.id)
      const inv = w.clone().invert()
      const me: Placed = { panel, world: w, inverse: inv, samples: samplesOf(panel) }
      let hits = 0
      for (const other of others) {
        hits += penetrates(me.samples, w, other, thickness)
        hits += penetrates(other.samples, other.world, me, thickness)
        if (hits > best.hits) break
      }
      if (hits < best.hits) best = { layer, hits }
      if (hits === 0) break
    }
    j.layer = best.layer
    worldCache.delete(panel.id)
    const w = worldOf(panel.id)
    placed.push({ panel, world: w, inverse: w.clone().invert(), samples: samplesOf(panel) })
    if (best.hits > 0) residual += 1
  }

  return { joints, steps, residual }
}

/** Kapalı pozdaki çakışan panel çifti sayısı (test / teşhis). */
export function countCollisions(dieline: DielineResponse, thickness: number, joints: PlanJoint[]): number {
  const panels = new Map(dieline.panels.map((p) => [p.id, p]))
  const jointOfChild = new Map(joints.map((j) => [j.childId, j]))
  const cache = new Map<string, THREE.Matrix4>()
  const worldOf = (id: string): THREE.Matrix4 => {
    const c = cache.get(id)
    if (c) return c
    const j = jointOfChild.get(id)
    const m = j ? worldOf(j.parentId).clone().multiply(jointMatrix(j, thickness, 1)) : new THREE.Matrix4()
    cache.set(id, m)
    return m
  }
  const list: Placed[] = dieline.panels.map((p) => {
    const w = worldOf(p.id)
    return { panel: p, world: w, inverse: w.clone().invert(), samples: samplePanel(p, thickness) }
  })
  let pairs = 0
  for (let i = 0; i < list.length; i += 1) {
    for (let k = i + 1; k < list.length; k += 1) {
      const a = list[i]!
      const b = list[k]!
      const ja = jointOfChild.get(a.panel.id)
      const jb = jointOfChild.get(b.panel.id)
      if (ja?.parentId === b.panel.id || jb?.parentId === a.panel.id) continue
      if (penetrates(a.samples, a.world, b, thickness) + penetrates(b.samples, b.world, a, thickness) > 0) pairs += 1
    }
  }
  void panels
  return pairs
}

/** Kapalı pozda baskılı (dış) yüzü kutunun içine bakan baskılı panel sayısı (0 beklenir). */
export function countInsideOut(dieline: DielineResponse, thickness: number, joints: PlanJoint[]): number {
  const jointOfChild = new Map(joints.map((j) => [j.childId, j]))
  const cache = new Map<string, THREE.Matrix4>()
  const worldOf = (id: string): THREE.Matrix4 => {
    const c = cache.get(id)
    if (c) return c
    const j = jointOfChild.get(id)
    const m = j ? worldOf(j.parentId).clone().multiply(jointMatrix(j, thickness, 1)) : new THREE.Matrix4()
    cache.set(id, m)
    return m
  }
  const walls = dieline.panels.filter((p) => p.printable && BODY.has(p.role))
  const centers = walls.map((p) => toV(centroid2d(p.outline), thickness / 2).applyMatrix4(worldOf(p.id)))
  const middle = centers.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, centers.length))
  let bad = 0
  walls.forEach((p, i) => {
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(worldOf(p.id))
    const out = centers[i]!.clone().sub(middle)
    if (out.lengthSq() > 1e-6 && normal.dot(out) < 0) bad += 1
  })
  return bad
}
