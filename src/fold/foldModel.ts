import * as THREE from 'three'
import type { DielineResponse, Panel, Point } from '../lib/types'
import { buildPanelMeshBuffers, type MaterialGroup, type PanelBounds, type PanelSurface } from './panelGeometry'

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
  node: FoldNode
}

export interface FoldNode {
  meshes: FoldMeshData[]
  joints: FoldJoint[]
}

const toV = (p: Point): THREE.Vector3 => new THREE.Vector3(p.x, 0, -p.y)

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

const hingeTowardChild = (
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  childOutline: Point[],
  dist: number,
): THREE.Vector3 => {
  if (dist <= 0 || childOutline.length < 1) return origin.clone()
  const c = centroid2d(childOutline)
  const toChild = toV(c).sub(origin)
  const along = axis.clone().multiplyScalar(toChild.dot(axis))
  const perp = toChild.sub(along)
  if (perp.lengthSq() < 1e-8) return origin.clone()
  return origin.clone().add(perp.normalize().multiplyScalar(dist))
}

const closedFoldAngle = (role: string, angle: number): number => {
  const mag = Math.abs(angle)
  if (mag < 1e-6) return 0
  const sign = angle < 0 ? -1 : 1
  if (mag > 120) return sign * Math.min(mag, 178)
  if (role === 'lock') return sign * Math.min(mag, 88)
  return sign * mag
}

const stackLift = (role: string, layer: number, thickness: number): number => {
  const step = thickness * 0.16
  switch (role) {
    case 'glue':
      return -thickness * 1.05 - layer * step
    case 'dust':
      return thickness * 0.7 + layer * step
    case 'flap':
    case 'lid':
      return thickness * 1.15 + layer * step
    case 'lock':
      return thickness * 1.7 + layer * step
    default:
      return layer * thickness * 0.03
  }
}

const panelMeshData = (panel: Panel, thickness: number, layer: number): FoldMeshData | null => {
  const buffers = buildPanelMeshBuffers(panel, thickness)
  if (!buffers) return null
  return {
    id: panel.id,
    printable: panel.printable,
    lift: stackLift(panel.role, layer, thickness),
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

export function buildFoldGraph(dieline: DielineResponse): { root: FoldNode; thickness: number } {
  const thickness = foldThickness(dieline)
  const panels = new Map(dieline.panels.map((p) => [p.id, p]))
  const children = new Map<string, typeof dieline.folds>()
  for (const fold of dieline.folds) {
    const list = children.get(fold.parent) ?? []
    list.push(fold)
    children.set(fold.parent, list)
  }
  let layer = 0
  const attach = (panelId: string, seen: Set<string>): FoldNode => {
    const node: FoldNode = { meshes: [], joints: [] }
    if (seen.has(panelId)) return node
    seen.add(panelId)
    const panel = panels.get(panelId)
    if (!panel) return node
    layer += 1
    const mesh = panelMeshData(panel, thickness, layer)
    if (mesh) node.meshes.push(mesh)
    for (const fold of children.get(panelId) ?? []) {
      const childPanel = panels.get(fold.child)
      const [a, b] = fold.axis
      const axis = toV(b).sub(toV(a))
      if (axis.lengthSq() < 1e-8) {
        node.joints.push({
          id: fold.id,
          hinge: [0, thickness * 0.5, 0],
          axis: [0, 1, 0],
          angle: 0,
          childShift: [0, -thickness * 0.5, 0],
          node: attach(fold.child, seen),
        })
        continue
      }
      axis.normalize()
      const hinge = hingeTowardChild(toV(a), axis, childPanel?.outline ?? [], thickness * 0.18)
      const oriented = childPanel?.outline?.length
        ? signedFoldAngle(fold.axis, childPanel.outline, fold.angle)
        : fold.angle
      const rawAngle = fold.reverse ? -oriented : oriented
      node.joints.push({
        id: fold.id,
        hinge: [hinge.x, thickness * 0.5, hinge.z],
        axis: [axis.x, axis.y, axis.z],
        angle: closedFoldAngle(childPanel?.role ?? 'wall', rawAngle),
        childShift: [-hinge.x, -thickness * 0.5, -hinge.z],
        node: attach(fold.child, seen),
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
  return { root, thickness }
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
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...joint.axis), THREE.MathUtils.degToRad(-joint.angle * t))
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
