import type * as THREE from 'three'
import type { PrintFinish } from '../lib/types'

/**
 * Native'de 2D canvas yok: yaldız / gofre / lak maskeleri üretilmez,
 * yüzey efektleri yalnızca malzeme parametreleriyle (foldMaterials) gösterilir.
 */
export interface FinishMapTextures {
  foilMask: THREE.Texture | null
  embossNormal: THREE.Texture | null
  varnishMask: THREE.Texture | null
}

export const buildFinishMapsFromUrl = async (_artworkUrl: string, _finish: PrintFinish): Promise<FinishMapTextures> => ({
  foilMask: null,
  embossNormal: null,
  varnishMask: null,
})

export const disposeFinishMaps = (_maps: FinishMapTextures | null): void => undefined
