import { printBaseSize } from '../lib/printMap'
import type { DielineResponse, PrintTransform } from '../lib/types'
import type { FoldMeshData } from './foldModel'

/** Dieline mm (y yukarı) → UV [0,1]. 2D `printImageSvgTransform` ile hizalı. */
export const dielineUvFromPosition = (
  x: number,
  z: number,
  bounds: DielineResponse['bounds'],
  transform: PrintTransform,
): [number, number] => {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const base = printBaseSize(bounds, transform)
  const bw = base.width
  const bh = base.height
  const scale = Math.max(transform.scale, 0.05)
  const rad = (-transform.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const x2 = x - cx - transform.offsetX
  const y2 = -z - cy - transform.offsetY
  const rx = (x2 * cos - y2 * sin) / (bw * scale)
  const ry = (x2 * sin + y2 * cos) / (bh * scale)
  return [rx + 0.5, ry + 0.5]
}

/** Yalnızca outer cap vertex'lerine baskı UV'si yazar. */
export const applyOuterPrintUvs = (
  positions: Float32Array,
  uvs: Float32Array,
  outerVertex: Uint8Array,
  bounds: DielineResponse['bounds'],
  transform: PrintTransform,
): void => {
  const count = positions.length / 3
  for (let i = 0; i < count; i += 1) {
    if (!outerVertex[i]) continue
    const x = positions[i * 3] ?? 0
    const z = positions[i * 3 + 2] ?? 0
    const [u, v] = dielineUvFromPosition(x, z, bounds, transform)
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }
}

export const applyPrintToMeshData = (
  mesh: FoldMeshData,
  bounds: DielineResponse['bounds'],
  transform: PrintTransform,
): void => {
  applyOuterPrintUvs(mesh.positions, mesh.uvs, mesh.outerVertex, bounds, transform)
}
