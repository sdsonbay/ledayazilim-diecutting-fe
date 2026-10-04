import * as THREE from 'three'
import type { DielineResponse, PrintFinish, PrintTransform } from '../lib/types'
import { defaultPrintFinish } from '../lib/types'
import { buildFinishMapsFromUrl, disposeFinishMaps, type FinishMapTextures } from './finishMaps'
import { createPanelMaterials, materialsForMesh } from './foldMaterials'
import { geometryFromMeshData } from './foldThree'
import type { FoldMeshData } from './foldModel'

export interface LoadedPrintAssets {
  texture: THREE.Texture | null
  finishMaps: FinishMapTextures | null
  dispose: () => void
}

export const loadPrintAssets = async (
  printUrl: string | null | undefined,
  printFinish: PrintFinish = defaultPrintFinish(),
): Promise<LoadedPrintAssets> => {
  if (!printUrl) {
    return { texture: null, finishMaps: null, dispose: () => undefined }
  }
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(
      printUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.flipY = true
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
  const finishMaps = await buildFinishMapsFromUrl(printUrl, printFinish)
  return {
    texture,
    finishMaps,
    dispose: () => {
      texture.dispose()
      disposeFinishMaps(finishMaps)
    },
  }
}

export const buildPrintedMesh = (
  data: FoldMeshData,
  _dieline: DielineResponse,
  layer: number,
  assets: LoadedPrintAssets,
  _printTransform: PrintTransform,
  printFinish: PrintFinish = defaultPrintFinish(),
): THREE.Mesh => {
  const materials = createPanelMaterials({
    printable: data.printable,
    layer,
    printMap: data.printable ? assets.texture : null,
    finish: printFinish,
    finishMaps: assets.finishMaps,
  })
  const mesh = new THREE.Mesh(geometryFromMeshData(data), materialsForMesh(materials))
  mesh.name = data.id
  mesh.renderOrder = layer
  mesh.userData.meshData = data
  mesh.userData.materialSet = materials
  return mesh
}
