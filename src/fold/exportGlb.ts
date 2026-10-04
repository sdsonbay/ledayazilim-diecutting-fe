import * as THREE from 'three'
import { SUBSTRATES, type Substrate } from './foldMaterials'
import { bakeFoldMeshes, buildFoldGraph, layoutFold } from './foldModel'
import type { DielineResponse } from '../lib/types'

/**
 * Kapalı kutunun GLB (glTF ikili) modeli — 3D yazılımlar, AR ve web görüntüleyiciler için.
 * Yalnızca web'de çağrılır (GLTFExporter tarayıcı Blob/FileReader kullanır).
 */
export async function exportFoldGlb(dieline: DielineResponse, substrate: Substrate, fold = 1): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const graph = buildFoldGraph(dieline)
  const rootRole = dieline.panels.find((p) => p.id === dieline.rootPanel)?.role ?? 'wall'
  const layout = layoutFold(graph.root, rootRole, graph.thickness)
  const colors = SUBSTRATES[substrate]
  const group = new THREE.Group()
  group.quaternion.set(...layout.quaternion)
  group.position.set(...layout.offset)
  const mats = {
    outer: new THREE.MeshStandardMaterial({ color: colors.outer, roughness: colors.roughness, name: 'outer' }),
    inner: new THREE.MeshStandardMaterial({ color: colors.inner, roughness: colors.roughness, name: 'inner' }),
    edge: new THREE.MeshStandardMaterial({ color: colors.edge, roughness: colors.roughness, name: 'edge' }),
  }
  for (const part of bakeFoldMeshes(graph.root, fold)) {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
    if (part.normals.length) geom.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
    if (part.uvs.length) geom.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
    geom.setIndex(new THREE.BufferAttribute(part.indices, 1))
    group.add(new THREE.Mesh(geom, mats[part.surface]))
  }
  const scene = new THREE.Scene()
  scene.add(group)
  const result = await new GLTFExporter().parseAsync(scene, { binary: true })
  return new Uint8Array(result as ArrayBuffer)
}
