import * as THREE from 'three'
import type { Panel, Point } from '../lib/types'

export type PanelSurface = 'outer' | 'inner' | 'edge'

export interface PanelBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface MaterialGroup {
  start: number
  count: number
  surface: PanelSurface
  materialIndex: number
}

export interface PanelMeshBuffers {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  materialGroups: MaterialGroup[]
  panelBounds: PanelBounds
  outerVertex: Uint8Array
}

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

const insetOutline = (pts: Point[], dist: number): Point[] => {
  if (dist <= 0 || pts.length < 3) return pts
  const c = centroid2d(pts)
  return pts.map((p) => {
    const dx = c.x - p.x
    const dy = c.y - p.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return p
    const t = Math.min(dist / len, 0.42)
    return { x: p.x + dx * t, y: p.y + dy * t }
  })
}

export const panelBoundsOf = (outline: Point[]): PanelBounds => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of outline) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

const outlineToShape = (outline: Point[], holes: Point[][] | undefined, dist: number): THREE.Shape | null => {
  const pts = insetOutline(outline, dist).map((p) => new THREE.Vector2(p.x, p.y))
  if (pts.length < 3) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first && last && first.distanceTo(last) < 1e-6) pts.pop()
  if (pts.length < 3) return null
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse()
  const shape = new THREE.Shape(pts)
  for (const hole of holes ?? []) {
    const hp = hole.map((p) => new THREE.Vector2(p.x, p.y))
    const hf = hp[0]
    const hl = hp[hp.length - 1]
    if (hf && hl && hf.distanceTo(hl) < 1e-6) hp.pop()
    if (hp.length < 3) continue
    if (!THREE.ShapeUtils.isClockWise(hp)) hp.reverse()
    shape.holes.push(new THREE.Path(hp))
  }
  return shape
}

const classifySurface = (ny: number): PanelSurface => {
  if (ny > 0.5) return 'outer'
  if (ny < -0.5) return 'inner'
  return 'edge'
}

const surfaceMaterialIndex = (surface: PanelSurface): number => {
  if (surface === 'outer') return 0
  if (surface === 'inner') return 1
  return 2
}

/** Extrude sonrası üç yüzey grubu: outer (baskı), inner (kraft), edge (yan). */
export const buildPanelMeshBuffers = (panel: Panel, thickness: number): PanelMeshBuffers | null => {
  const inset = Math.max(thickness * 0.22, 0.18)
  const shape = outlineToShape(panel.outline, panel.holes, inset) ?? outlineToShape(panel.outline, panel.holes, 0)
  if (!shape) return null
  let extruded: THREE.ExtrudeGeometry
  try {
    extruded = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 8 })
  } catch {
    return null
  }
  extruded.rotateX(-Math.PI / 2)
  extruded.computeVertexNormals()
  const geom = extruded.toNonIndexed()
  extruded.dispose()
  const posAttr = geom.getAttribute('position')
  const norAttr = geom.getAttribute('normal')
  const uvAttr = geom.getAttribute('uv')
  if (!posAttr || posAttr.count < 3) {
    geom.dispose()
    return null
  }

  const triCount = Math.floor(posAttr.count / 3)
  const buckets: Record<PanelSurface, number[]> = { outer: [], inner: [], edge: [] }
  const outerVertex = new Uint8Array(posAttr.count)

  for (let t = 0; t < triCount; t += 1) {
    const i0 = t * 3
    const i1 = i0 + 1
    const i2 = i0 + 2
    const ny = ((norAttr?.getY(i0) ?? 0) + (norAttr?.getY(i1) ?? 0) + (norAttr?.getY(i2) ?? 0)) / 3
    const surface = classifySurface(ny)
    buckets[surface].push(i0, i1, i2)
    if (surface === 'outer') {
      outerVertex[i0] = 1
      outerVertex[i1] = 1
      outerVertex[i2] = 1
    }
  }

  const order: PanelSurface[] = ['outer', 'inner', 'edge']
  const indices: number[] = []
  const materialGroups: MaterialGroup[] = []
  for (const surface of order) {
    const tri = buckets[surface]
    if (tri.length === 0) continue
    materialGroups.push({
      start: indices.length,
      count: tri.length,
      surface,
      materialIndex: surfaceMaterialIndex(surface),
    })
    indices.push(...tri)
  }

  geom.dispose()
  if (indices.length < 3) return null

  return {
    positions: new Float32Array(posAttr.array as Float32Array),
    normals: new Float32Array((norAttr?.array as Float32Array) ?? []),
    uvs: new Float32Array((uvAttr?.array as Float32Array) ?? new Float32Array(posAttr.count * 2)),
    indices: Uint32Array.from(indices),
    materialGroups,
    panelBounds: panelBoundsOf(panel.outline),
    outerVertex,
  }
}

export const sliceMeshBuffers = (
  buffers: PanelMeshBuffers,
  surface: PanelSurface,
): Pick<PanelMeshBuffers, 'positions' | 'normals' | 'uvs' | 'indices'> | null => {
  const group = buffers.materialGroups.find((g) => g.surface === surface)
  if (!group || group.count === 0) return null
  const slice = buffers.indices.subarray(group.start, group.start + group.count)
  return {
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: slice,
  }
}
