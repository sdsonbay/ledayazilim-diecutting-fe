import * as THREE from 'three'
import type { PrintFinish } from '../lib/types'

const FINISH_MAX = 1024

export interface FinishMapTextures {
  foilMask: THREE.Texture | null
  embossNormal: THREE.Texture | null
  varnishMask: THREE.Texture | null
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })

const resizeCanvas = (w: number, h: number, max: number): { width: number; height: number; scale: number } => {
  const scale = Math.min(1, max / Math.max(w, h, 1))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale }
}

const luminanceAt = (data: Uint8ClampedArray, w: number, x: number, y: number): number => {
  const i = (y * w + x) * 4
  const r = data[i] ?? 0
  const g = data[i + 1] ?? 0
  const b = data[i + 2] ?? 0
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

const canvasTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.flipY = true
  tex.needsUpdate = true
  return tex
}

export const buildFinishMapsFromUrl = async (
  artworkUrl: string,
  finish: PrintFinish,
): Promise<FinishMapTextures> => {
  const empty: FinishMapTextures = { foilMask: null, embossNormal: null, varnishMask: null }
  if (!finish.foil.enabled && !finish.emboss.enabled && !finish.varnish.enabled) return empty

  const img = await loadImage(artworkUrl)
  const { width, height } = resizeCanvas(img.width, img.height, FINISH_MAX)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return empty
  ctx.drawImage(img, 0, 0, width, height)
  const base = ctx.getImageData(0, 0, width, height)
  const w = width
  const h = height

  const loadMask = async (url: string | undefined, auto: (l: number) => number): Promise<Uint8ClampedArray> => {
    const out = new Uint8ClampedArray(w * h)
    if (url) {
      const maskImg = await loadImage(url)
      const mc = document.createElement('canvas')
      mc.width = w
      mc.height = h
      const mctx = mc.getContext('2d')
      if (!mctx) return out
      mctx.drawImage(maskImg, 0, 0, w, h)
      const md = mctx.getImageData(0, 0, w, h).data
      for (let i = 0; i < w * h; i += 1) out[i] = md[i * 4] ?? 0
      return out
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const l = luminanceAt(base.data, w, x, y)
        out[y * w + x] = Math.round(auto(l) * 255)
      }
    }
    return out
  }

  let foilMask: THREE.Texture | null = null
  let embossNormal: THREE.Texture | null = null
  let varnishMask: THREE.Texture | null = null

  if (finish.foil.enabled) {
    const foilData = await loadMask(finish.masks?.foil, (l) => (l > 0.72 ? Math.min(1, (l - 0.72) / 0.28) : 0))
    const fc = document.createElement('canvas')
    fc.width = w
    fc.height = h
    const fctx = fc.getContext('2d')
    if (fctx) {
      const imgData = fctx.createImageData(w, h)
      for (let i = 0; i < w * h; i += 1) {
        const v = foilData[i] ?? 0
        imgData.data[i * 4] = v
        imgData.data[i * 4 + 1] = v
        imgData.data[i * 4 + 2] = v
        imgData.data[i * 4 + 3] = 255
      }
      fctx.putImageData(imgData, 0, 0)
      foilMask = canvasTexture(fc)
    }
  }

  if (finish.emboss.enabled) {
    const strength = Math.max(0.02, finish.emboss.depth)
    const ec = document.createElement('canvas')
    ec.width = w
    ec.height = h
    const ectx = ec.getContext('2d')
    if (ectx) {
      const imgData = ectx.createImageData(w, h)
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const lx = luminanceAt(base.data, w, Math.min(w - 1, x + 1), y) - luminanceAt(base.data, w, Math.max(0, x - 1), y)
          const ly = luminanceAt(base.data, w, x, Math.min(h - 1, y + 1)) - luminanceAt(base.data, w, x, Math.max(0, y - 1))
          const nx = -lx * strength * 4
          const ny = -ly * strength * 4
          const nz = Math.sqrt(Math.max(0.01, 1 - nx * nx - ny * ny))
          const i = (y * w + x) * 4
          imgData.data[i] = Math.round((nx * 0.5 + 0.5) * 255)
          imgData.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
          imgData.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
          imgData.data[i + 3] = 255
        }
      }
      ectx.putImageData(imgData, 0, 0)
      embossNormal = canvasTexture(ec)
    }
  }

  if (finish.varnish.enabled) {
    const varnishData = await loadMask(finish.masks?.varnish, (l) => Math.max(0, 1 - l * 0.85))
    const vc = document.createElement('canvas')
    vc.width = w
    vc.height = h
    const vctx = vc.getContext('2d')
    if (vctx) {
      const imgData = vctx.createImageData(w, h)
      for (let i = 0; i < w * h; i += 1) {
        const v = Math.round((varnishData[i] ?? 0) * finish.varnish.gloss)
        imgData.data[i * 4] = v
        imgData.data[i * 4 + 1] = v
        imgData.data[i * 4 + 2] = v
        imgData.data[i * 4 + 3] = 255
      }
      vctx.putImageData(imgData, 0, 0)
      varnishMask = canvasTexture(vc)
    }
  }

  return { foilMask, embossNormal, varnishMask }
}

export const disposeFinishMaps = (maps: FinishMapTextures): void => {
  maps.foilMask?.dispose()
  maps.embossNormal?.dispose()
  maps.varnishMask?.dispose()
}
