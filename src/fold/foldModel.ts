import * as THREE from 'three'
import type { DielineResponse, Panel } from '../lib/types'
import { jointProgress, pivotOf, planFold, type FoldStep, type PlanJoint } from './foldPlan'
import { buildPanelMeshBuffers, type MaterialGroup, type PanelBounds, type PanelSurface } from './panelGeometry'

export type { FoldStep }

export type { MaterialGroup, PanelBounds, PanelSurface }

export type FoldEngineId = 'three' | 'r3f' | 'babylon' | 'playcanvas' | 'filament' | 'model-viewer'

export const FOLD_ENGINES: { id: FoldEngineId; label: string }[] = [
  { id: 'three', label: 'Three.js' },
  { id: 'r3f', label: 'React Three Fiber' },
  { id: 'babylon', label: 'Babylon.js' },
  { id: 'playcanvas', label: 'PlayCanvas' },
  { id: 'filament', label: 'Filament' },
  { id: 'model-viewer', label: 'model-viewer' },
]

export const FOLD_ENGINE_KEY = 'diecut.foldEngine'

export const isFoldEngine = (value: string | null): value is FoldEngineId =>
  FOLD_ENGINES.some((e) => e.id === value)

export interface FoldMeshData {
  id: string
  printable: boolean
  lift: number
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  materialGroups: MaterialGroup[]
  panelBounds: PanelBounds
  outerVertex: Uint8Array
}

export interface FoldJoint {
  id: string
  hinge: [number, number, number]
  axis: [number, number, number]
  angle: number
  childShift: [number, number, number]
  /** Montaj sırasındaki zaman penceresi (genel katlanma 0..1 içinde). */
  start: number
  end: number
  node: FoldNode
}

export interface FoldNode {
  meshes: FoldMeshData[]
  joints: FoldJoint[]
}

const panelMeshData = (panel: Panel, thickness: number): FoldMeshData | null => {
  const buffers = buildPanelMeshBuffers(panel, thickness)
  if (!buffers) return null
  return {
    id: panel.id,
    printable: panel.printable,
    lift: 0,
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: buffers.indices,
    materialGroups: buffers.materialGroups,
    panelBounds: buffers.panelBounds,
    outerVertex: buffers.outerVertex,
  }
}

export const foldThickness = (dieline: DielineResponse): number =>
  Math.min(8, Math.max(0.6, dieline.meta.caliper || 0.4))

export function buildFoldGraph(dieline: DielineResponse): { root: FoldNode; thickness: number; steps: FoldStep[]; residual: number } {
  const thickness = foldThickness(dieline)
  const plan = planFold(dieline, thickness)
  const panels = new Map(dieline.panels.map((p) => [p.id, p]))
  const jointsOf = new Map<string, PlanJoint[]>()
  for (const j of plan.joints) {
    const list = jointsOf.get(j.parentId) ?? []
    list.push(j)
    jointsOf.set(j.parentId, list)
  }
  const attach = (panelId: string, seen: Set<string>): FoldNode => {
    const node: FoldNode = { meshes: [], joints: [] }
    if (seen.has(panelId)) return node
    seen.add(panelId)
    const panel = panels.get(panelId)
    if (!panel) return node
    const mesh = panelMeshData(panel, thickness)
    if (mesh) node.meshes.push(mesh)
    for (const j of jointsOf.get(panelId) ?? []) {
      const p = pivotOf(j, thickness)
      node.joints.push({
        id: j.id,
        hinge: [p.x, p.y, p.z],
        axis: [j.axis.x, j.axis.y, j.axis.z],
        angle: j.angle,
        childShift: [-p.x, -p.y, -p.z],
        start: j.start,
        end: j.end,
        node: attach(j.childId, seen),
      })
    }
    return node
  }
  const seen = new Set<string>()
  const root = attach(dieline.rootPanel, seen)
  for (const panel of dieline.panels) {
    if (seen.has(panel.id)) continue
    const extra = attach(panel.id, seen)
    root.meshes.push(...extra.meshes)
    root.joints.push(...extra.joints)
  }
  return { root, thickness, steps: plan.steps, residual: plan.residual }
}

export const kraftColor = (printable: boolean): [number, number, number] =>
  printable ? [0.94, 0.89, 0.82] : [0.85, 0.8, 0.7]

export interface BakedFoldMesh {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  materialGroups: MaterialGroup[]
  color: [number, number, number]
  surface: PanelSurface
}

const transformPoints = (src: Float32Array, matrix: THREE.Matrix4): Float32Array => {
  const out = new Float32Array(src.length)
  const v = new THREE.Vector3()
  for (let i = 0; i < src.length; i += 3) {
    v.set(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0).applyMatrix4(matrix)
    out[i] = v.x
    out[i + 1] = v.y
    out[i + 2] = v.z
  }
  return out
}

const transformNormals = (src: Float32Array, matrix: THREE.Matrix4): Float32Array => {
  const out = new Float32Array(src.length)
  const n = new THREE.Vector3()
  const normalMat = new THREE.Matrix3().getNormalMatrix(matrix)
  for (let i = 0; i < src.length; i += 3) {
    n.set(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0).applyMatrix3(normalMat).normalize()
    out[i] = n.x
    out[i + 1] = n.y
    out[i + 2] = n.z
  }
  return out
}

const walkBake = (node: FoldNode, parent: THREE.Matrix4, t: number, out: BakedFoldMesh[]) => {
  for (const mesh of node.meshes) {
    const local = new THREE.Matrix4().makeTranslation(0, mesh.lift * t, 0)
    const world = parent.clone().multiply(local)
    for (const group of mesh.materialGroups) {
      out.push({
        positions: transformPoints(mesh.positions, world),
        normals: mesh.normals.length ? transformNormals(mesh.normals, world) : new Float32Array(),
        uvs: mesh.uvs.slice(),
        indices: mesh.indices.subarray(group.start, group.start + group.count),
        materialGroups: [group],
        color: kraftColor(mesh.printable && group.surface === 'outer'),
        surface: group.surface,
      })
    }
  }
  for (const joint of node.joints) {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(...joint.axis),
      THREE.MathUtils.degToRad(-joint.angle * jointProgress(joint, t)),
    )
    const pivot = new THREE.Matrix4().compose(
      new THREE.Vector3(...joint.hinge),
      q,
      new THREE.Vector3(1, 1, 1),
    )
    const child = new THREE.Matrix4().makeTranslation(...joint.childShift)
    walkBake(joint.node, parent.clone().multiply(pivot).multiply(child), t, out)
  }
}

export const bakeFoldMeshes = (root: FoldNode, t: number): BakedFoldMesh[] => {
  const out: BakedFoldMesh[] = []
  walkBake(root, new THREE.Matrix4(), Math.min(1, Math.max(0, t)), out)
  return out
}

export interface FoldFrame {
  center: [number, number, number]
  span: number
}

export const measureFold = (root: FoldNode): FoldFrame => {
  const parts = [...bakeFoldMeshes(root, 0), ...bakeFoldMeshes(root, 1)]
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const part of parts) {
    const p = part.positions
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] ?? 0
      const y = p[i + 1] ?? 0
      const z = p[i + 2] ?? 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
  }
  if (!Number.isFinite(minX)) return { center: [0, 20, 0], span: 80 }
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 80),
  }
}

export const cameraFromFrame = (frame: FoldFrame) => {
  const { center, span } = frame
  const position: [number, number, number] = [center[0] + span * 1.15, span * 0.82, center[2] + span * 1.05]
  const dx = position[0] - center[0]
  const dy = position[1] - center[1]
  const dz = position[2] - center[2]
  const radius = Math.hypot(dx, dy, dz)
  return {
    position,
    target: center,
    near: Math.max(0.2, span / 250),
    far: Math.max(2000, span * 12),
    radius,
    yaw: Math.atan2(dx, dz),
    pitch: Math.acos(Math.min(1, Math.max(-1, dy / radius))),
  }
}

export const lightRig = (light = 1) => {
  const level = Math.min(1.6, Math.max(0.35, light))
  return {
    level,
    hemi: 0.7 + level * 0.65,
    key: 0.45 + level * 0.55,
    fill: 0.18 + level * 0.28,
    exposure: 0.75 + level * 0.45,
  }
}

export const foldAmount = (fold: number) => Math.min(1, Math.max(0, fold))

export const foldClipTime = (fold: number, duration = 1) => {
  const t = foldAmount(fold)
  const dur = Math.max(duration, 1e-4)
  return t >= 1 ? dur * (1 - 1e-4) : t * dur
}

export const hexRgb = (hex: string): [number, number, number] => {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0')
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0.96, 0.96, 0.97]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const groupIndexForSurface = (surface: PanelSurface): number => {
  if (surface === 'outer') return 0
  if (surface === 'inner') return 1
  return 2
}

export interface FoldLayout {
  /** Modeli dik/zemine oturtan dönüş. */
  quaternion: [number, number, number, number]
  /** Dönüşten sonra uygulanan öteleme: kapalı kutu zemin (y=0) üzerinde, merkezde. */
  offset: [number, number, number]
  /** Açık + kapalı pozu kapsayan çerçeve. */
  frame: FoldFrame
  /** Düz ve kapalı pozların ayrı çerçeveleri: kamera katlanmayla birlikte yaklaşır. */
  openFrame: FoldFrame
  closedFrame: FoldFrame
  /** Katlanma boyunca (eşit aralıklı örnekler) kutuyu zeminde tutan dikey düzeltme. */
  rest: number[]
}

/** Katlanma t'sinde zemine oturma payı (örnekler arası doğrusal). */
export const restAt = (rest: number[], t: number): number => {
  if (rest.length === 0) return 0
  const x = Math.min(1, Math.max(0, t)) * (rest.length - 1)
  const i = Math.floor(x)
  const a = rest[i] ?? 0
  const b = rest[Math.min(rest.length - 1, i + 1)] ?? a
  return a + (b - a) * (x - i)
}

/**
 * Sunum yönü: duvar kökenli kutular (tuck end, koli) dik durur, ön yüz kameraya bakar;
 * taban kökenli olanlar (tepsi) tabanı zeminde açılır.
 */
export const layoutFold = (root: FoldNode, rootRole: string, thickness: number): FoldLayout => {
  const closed = bakeFoldMeshes(root, 1)
  let sum = 0
  let count = 0
  for (const part of closed) {
    for (let i = 1; i < part.positions.length; i += 3) {
      sum += part.positions[i] ?? 0
      count += 1
    }
  }
  const bodyBelow = count > 0 ? sum / count < thickness / 2 : true
  const q = new THREE.Quaternion()
  if (rootRole === 'bottom') {
    if (bodyBelow) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
  } else {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    if (!bodyBelow) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  }
  const v = new THREE.Vector3()
  const box = (parts: BakedFoldMesh[]) => {
    const b = new THREE.Box3()
    for (const part of parts) {
      for (let i = 0; i < part.positions.length; i += 3) {
        v.set(part.positions[i] ?? 0, part.positions[i + 1] ?? 0, part.positions[i + 2] ?? 0).applyQuaternion(q)
        b.expandByPoint(v)
      }
    }
    return b
  }
  const closedBox = box(closed)
  const openBox = box(bakeFoldMeshes(root, 0))
  const offset = new THREE.Vector3(
    -(closedBox.min.x + closedBox.max.x) / 2,
    -closedBox.min.y,
    -(closedBox.min.z + closedBox.max.z) / 2,
  )
  const frameOf = (b: THREE.Box3): FoldFrame => {
    const moved = b.clone().translate(offset)
    const size = moved.getSize(new THREE.Vector3())
    const c = moved.getCenter(new THREE.Vector3())
    return { center: [c.x, c.y, c.z], span: Math.max(size.x, size.y, size.z, 30) }
  }
  // Montaj masada yapılıyormuş gibi: her an en alt nokta zeminde.
  const rest: number[] = []
  for (let i = 0; i <= 24; i += 1) {
    const b = box(bakeFoldMeshes(root, i / 24))
    rest.push(-(b.min.y + offset.y))
  }
  return {
    rest,
    quaternion: [q.x, q.y, q.z, q.w],
    offset: [offset.x, offset.y, offset.z],
    frame: frameOf(closedBox.clone().union(openBox)),
    openFrame: frameOf(openBox),
    closedFrame: frameOf(closedBox),
  }
}
