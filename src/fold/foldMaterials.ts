import * as THREE from 'three'
import type { PrintFinish } from '../lib/types'
import { hexRgb } from './foldModel'
import type { FinishMapTextures } from './finishMaps'

export interface PanelMaterialSet {
  outer: THREE.MeshPhysicalMaterial
  inner: THREE.MeshStandardMaterial
  edge: THREE.MeshStandardMaterial
  dispose: () => void
}

const kraftStandard = (printable: boolean, layer: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: printable ? 0xf0e4d0 : 0xd9cbb3,
    roughness: printable ? 0.52 : 0.7,
    metalness: 0,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4 - layer * 2,
  })

export const createPanelMaterials = (opts: {
  printable: boolean
  layer: number
  printMap?: THREE.Texture | null
  finish?: PrintFinish
  finishMaps?: FinishMapTextures | null
  envMap?: THREE.Texture | null
}): PanelMaterialSet => {
  const inner = kraftStandard(false, opts.layer)
  const edge = kraftStandard(false, opts.layer + 1)

  const outer = new THREE.MeshPhysicalMaterial({
    color: opts.printable && opts.printMap ? 0xffffff : opts.printable ? 0xf0e4d0 : 0xd9cbb3,
    map: opts.printable ? (opts.printMap ?? null) : null,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.35,
    side: THREE.FrontSide,
    envMap: opts.envMap ?? null,
    envMapIntensity: opts.envMap ? 0.85 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6 - opts.layer * 2,
  })

  const finish = opts.finish
  const maps = opts.finishMaps
  if (finish && maps && opts.printable && opts.printMap) {
    if (finish.varnish.enabled && maps.varnishMask) {
      outer.clearcoat = 0.35 + finish.varnish.gloss * 0.55
      outer.clearcoatRoughness = 0.12
      outer.roughnessMap = maps.varnishMask
      outer.roughness = 0.45
    }
    if (finish.emboss.enabled && maps.embossNormal) {
      outer.normalMap = maps.embossNormal
      outer.normalScale.set(finish.emboss.depth * 2.5, finish.emboss.depth * 2.5)
    }
    if (finish.foil.enabled && maps.foilMask) {
      const [fr, fg, fb] = hexRgb(finish.foil.color)
      outer.metalnessMap = maps.foilMask
      outer.metalness = finish.foil.intensity
      outer.emissive = new THREE.Color(fr, fg, fb)
      outer.emissiveMap = maps.foilMask
      outer.emissiveIntensity = finish.foil.intensity * 0.4
      outer.roughness = Math.min(outer.roughness, 0.35)
    }
  }

  return {
    outer,
    inner,
    edge,
    dispose: () => {
      outer.dispose()
      inner.dispose()
      edge.dispose()
    },
  }
}

export const materialsForMesh = (set: PanelMaterialSet): THREE.Material[] => [set.outer, set.inner, set.edge]
