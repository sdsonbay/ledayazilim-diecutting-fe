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

/** Kutu malzemesi: dış (baskı) / iç / kesit renkleri ve yüzey pürüzü. */
export type Substrate = 'white' | 'kraft' | 'corrugated' | 'black'

export const SUBSTRATES: Record<Substrate, { outer: number; inner: number; edge: number; roughness: number; swatch: string }> = {
  white: { outer: 0xf7f5f0, inner: 0xe8e3d9, edge: 0xd8d1c3, roughness: 0.55, swatch: '#F4F1EA' },
  kraft: { outer: 0xd6b48a, inner: 0xc9a476, edge: 0xb08a5c, roughness: 0.82, swatch: '#C49B6A' },
  corrugated: { outer: 0xcda36c, inner: 0xbf9560, edge: 0x9d7848, roughness: 0.88, swatch: '#C99E66' },
  black: { outer: 0x202022, inner: 0x2b2b2e, edge: 0x3c3c40, roughness: 0.6, swatch: '#232325' },
}

// Not: katmanlar artık geometride (foldPlan) çözülüyor; polygonOffset hilesi kullanılmaz —
// derinliğe göre değişen offset arka yüzlerin öndekilerin üstüne çizilmesine yol açıyordu.
const surface = (color: number, roughness: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side: THREE.FrontSide })

export const createPanelMaterials = (opts: {
  printable: boolean
  layer: number
  printMap?: THREE.Texture | null
  finish?: PrintFinish
  finishMaps?: FinishMapTextures | null
  envMap?: THREE.Texture | null
  substrate?: Substrate
}): PanelMaterialSet => {
  const sub = SUBSTRATES[opts.substrate ?? 'white']
  const inner = surface(sub.inner, Math.min(1, sub.roughness + 0.08))
  const edge = surface(sub.edge, Math.min(1, sub.roughness + 0.1))
  const printed = opts.printable && opts.printMap

  const outer = new THREE.MeshPhysicalMaterial({
    color: printed ? 0xffffff : opts.printable ? sub.outer : sub.inner,
    map: printed ? (opts.printMap ?? null) : null,
    roughness: sub.roughness,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.35,
    side: THREE.FrontSide,
    envMap: opts.envMap ?? null,
    envMapIntensity: opts.envMap ? 0.85 : 0,
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
