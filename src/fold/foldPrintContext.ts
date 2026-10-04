import type { DielineResponse, PrintFinish, PrintTransform } from '../lib/types'
import { applyPrintToMeshData } from './printAtlas'
import type { FoldMeshData, FoldNode } from './foldModel'

export interface FoldPrintContext {
  bounds: DielineResponse['bounds']
  printTransform: PrintTransform
  printFinish?: PrintFinish
  printUrl?: string | null
}

export const prepareFoldGraphPrint = (node: FoldNode, ctx: FoldPrintContext): void => {
  for (const mesh of node.meshes) {
    applyPrintToMeshData(mesh, ctx.bounds, ctx.printTransform)
  }
  for (const joint of node.joints) {
    prepareFoldGraphPrint(joint.node, ctx)
  }
}

export const cloneMeshDataWithPrint = (mesh: FoldMeshData, ctx: FoldPrintContext): FoldMeshData => {
  const copy: FoldMeshData = {
    ...mesh,
    positions: mesh.positions,
    normals: mesh.normals,
    uvs: mesh.uvs.slice(),
    indices: mesh.indices,
    outerVertex: mesh.outerVertex,
    materialGroups: mesh.materialGroups,
    panelBounds: mesh.panelBounds,
  }
  applyPrintToMeshData(copy, ctx.bounds, ctx.printTransform)
  return copy
}

export const outerGroupOf = (mesh: FoldMeshData) =>
  mesh.materialGroups.find((g) => g.surface === 'outer')
