import * as THREE from 'three'
import type { DielineResponse, PrintFinish, PrintTransform } from '../lib/types'
import type { FinishMapTextures } from './finishMaps'
import { createPanelMaterials, materialsForMesh, type PanelMaterialSet } from './foldMaterials'
import {
  buildFoldGraph,
  foldThickness,
  type FoldJoint,
  type FoldMeshData,
  type FoldNode,
} from './foldModel'
import { applyPrintToMeshData } from './printAtlas'

export type { PrintTransform }
export { defaultPrintTransform } from './printDefaults'

export interface FoldPivot {
  obj: THREE.Group
  axis: THREE.Vector3
  angle: number
}

export interface FoldStack {
  mesh: THREE.Mesh
  lift: number
}

export interface FoldSceneOptions {
  dieline: DielineResponse
  printMap?: THREE.Texture | null
  printTransform?: PrintTransform
  printFinish?: PrintFinish
  finishMaps?: FinishMapTextures | null
  envMap?: THREE.Texture | null
}

export const geometryFromMeshData = (data: FoldMeshData): THREE.BufferGeometry => {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  if (data.normals.length) geom.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
  if (data.uvs.length) geom.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
  geom.setIndex(new THREE.BufferAttribute(data.indices, 1))
  for (const group of data.materialGroups) {
    geom.addGroup(group.start, group.count, group.materialIndex)
  }
  return geom
}

export const meshFromFoldData = (
  data: FoldMeshData,
  materials: PanelMaterialSet,
  layer: number,
): THREE.Mesh => {
  const geom = geometryFromMeshData(data)
  const mesh = new THREE.Mesh(geom, materialsForMesh(materials))
  mesh.name = data.id
  mesh.renderOrder = layer
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.printable = data.printable
  mesh.userData.materialSet = materials
  mesh.userData.meshData = data
  return mesh
}

const attachNode = (
  node: FoldNode,
  parent: THREE.Object3D,
  pivots: FoldPivot[],
  stacks: FoldStack[],
  nextLayer: () => number,
  sceneOpts: FoldSceneOptions,
): void => {
  for (const meshData of node.meshes) {
    const layer = nextLayer()
    if (sceneOpts.printTransform) {
      applyPrintToMeshData(meshData, sceneOpts.dieline.bounds, sceneOpts.printTransform)
    }
    const materials = createPanelMaterials({
      printable: meshData.printable,
      layer,
      printMap: meshData.printable ? sceneOpts.printMap : null,
      finish: sceneOpts.printFinish,
      finishMaps: sceneOpts.finishMaps,
      envMap: sceneOpts.envMap,
    })
    const mesh = meshFromFoldData(meshData, materials, layer)
    parent.add(mesh)
    stacks.push({ mesh, lift: meshData.lift })
  }
  for (const joint of node.joints) {
    addJoint(joint, parent, pivots, stacks, nextLayer, sceneOpts)
  }
}

const addJoint = (
  joint: FoldJoint,
  parent: THREE.Object3D,
  pivots: FoldPivot[],
  stacks: FoldStack[],
  nextLayer: () => number,
  sceneOpts: FoldSceneOptions,
): void => {
  const pivot = new THREE.Group()
  pivot.name = `fold:${joint.id}`
  pivot.position.set(...joint.hinge)
  parent.add(pivot)
  const childSpace = new THREE.Group()
  childSpace.position.set(...joint.childShift)
  pivot.add(childSpace)
  pivots.push({
    obj: pivot,
    axis: new THREE.Vector3(...joint.axis),
    angle: joint.angle,
  })
  attachNode(joint.node, childSpace, pivots, stacks, nextLayer, sceneOpts)
}

export const buildThreeFoldScene = (opts: FoldSceneOptions): {
  root: THREE.Group
  graph: FoldNode
  pivots: FoldPivot[]
  stacks: FoldStack[]
  thickness: number
} => {
  const { root: graphRoot } = buildFoldGraph(opts.dieline)
  const thickness = foldThickness(opts.dieline)
  const pivots: FoldPivot[] = []
  const stacks: FoldStack[] = []
  let layer = 0
  const nextLayer = () => {
    layer += 1
    return layer
  }
  const root = new THREE.Group()
  attachNode(graphRoot, root, pivots, stacks, nextLayer, opts)
  return { root, graph: graphRoot, pivots, stacks, thickness }
}

export const applyFoldPose = (pivots: FoldPivot[], stacks: FoldStack[], t: number): void => {
  const clamped = Math.min(1, Math.max(0, t))
  for (const pivot of pivots) {
    pivot.obj.quaternion.setFromAxisAngle(pivot.axis, THREE.MathUtils.degToRad(-pivot.angle * clamped))
  }
  for (const stacked of stacks) {
    stacked.mesh.position.y = stacked.lift * clamped
  }
}

export const updateFoldPrint = (
  root: THREE.Group,
  opts: Pick<FoldSceneOptions, 'dieline' | 'printMap' | 'printTransform' | 'printFinish' | 'finishMaps' | 'envMap'>,
): void => {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const meshData = obj.userData.meshData as FoldMeshData | undefined
    if (!meshData) return
    const oldSet = obj.userData.materialSet as PanelMaterialSet | undefined
    oldSet?.dispose()
    if (opts.printTransform) {
      applyPrintToMeshData(meshData, opts.dieline.bounds, opts.printTransform)
      obj.geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs.slice(), 2))
    }
    const layer = obj.renderOrder
    const materials = createPanelMaterials({
      printable: meshData.printable,
      layer,
      printMap: meshData.printable ? opts.printMap : null,
      finish: opts.printFinish,
      finishMaps: opts.finishMaps,
      envMap: opts.envMap,
    })
    obj.material = materialsForMesh(materials)
    obj.userData.materialSet = materials
  })
}

export const disposeFoldScene = (root: THREE.Group): void => {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const set = obj.userData.materialSet as PanelMaterialSet | undefined
      set?.dispose()
      obj.geometry.dispose()
    }
  })
}
