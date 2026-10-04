import type { I18nText, PrintTransform } from './types'

export const SVG_MARGIN_MM = 5

export interface Size {
  width: number
  height: number
}

export const SCALE_MIN = 0.05
export const SCALE_MAX = 8

/**
 * Ölçek 1'deki baskı boyutu (mm): oran biliniyorsa bıçak izinin içine oran korunarak sığar,
 * bilinmiyorsa (eski kayıtlar) bıçak izi sınırlarına gerilir.
 */
export const printBaseSize = (bounds: Size, transform: PrintTransform): Size => {
  const bw = Math.max(bounds.width, 1e-6)
  const bh = Math.max(bounds.height, 1e-6)
  const a = transform.aspect
  if (!a || !Number.isFinite(a) || a <= 0) return { width: bw, height: bh }
  return a > bw / bh ? { width: bw, height: bw / a } : { width: bh * a, height: bh }
}

/** Ekrandaki (ölçekli) baskı boyutu, mm. */
export const printSize = (bounds: Size, transform: PrintTransform): Size => {
  const base = printBaseSize(bounds, transform)
  return { width: base.width * transform.scale, height: base.height * transform.scale }
}

const clampScale = (s: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))

/** Döndürülmüş görselin eksen hizalı kutusu (ölçek 1 için) — sığdır / kapla açıyı korur. */
const rotatedExtent = (rotation: number): { c: number; s: number } => {
  const rad = (rotation * Math.PI) / 180
  return { c: Math.abs(Math.cos(rad)), s: Math.abs(Math.sin(rad)) }
}

/** Bıçak izinin içine sığar (açı korunur, ortalanır). */
export const fitPrint = (bounds: Size, transform: PrintTransform): PrintTransform => {
  const base = printBaseSize(bounds, transform)
  const { c, s } = rotatedExtent(transform.rotation)
  const scale = Math.min(bounds.width / (base.width * c + base.height * s), bounds.height / (base.width * s + base.height * c))
  return { ...transform, scale: clampScale(scale), offsetX: 0, offsetY: 0 }
}

/** Bıçak izini tamamen kaplar (taşan kısım kesilir; açı korunur, ortalanır). */
export const coverPrint = (bounds: Size, transform: PrintTransform): PrintTransform => {
  const base = printBaseSize(bounds, transform)
  const { c, s } = rotatedExtent(transform.rotation)
  // Bıçak izi dikdörtgeni, görselin yerel eksenlerinde görselin içinde kalmalı.
  const scale = Math.max((bounds.width * c + bounds.height * s) / base.width, (bounds.width * s + bounds.height * c) / base.height)
  return { ...transform, scale: clampScale(scale), offsetX: 0, offsetY: 0 }
}

/** Varsayılana döner: açı 0, sığdırılmış, ortada. */
export const resetPrint = (transform: PrintTransform): PrintTransform => ({ ...transform, scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })

export const centerPrint = (transform: PrintTransform): PrintTransform => ({ ...transform, offsetX: 0, offsetY: 0 })

/** Verilen genişliğe (mm) göre ölçek; oran korunur. */
export const withPrintWidth = (bounds: Size, transform: PrintTransform, widthMm: number): PrintTransform => ({
  ...transform,
  scale: clampScale(widthMm / printBaseSize(bounds, transform).width),
})

export const withScale = (transform: PrintTransform, scale: number): PrintTransform => ({ ...transform, scale: clampScale(scale) })

/** -180..180 arasına indirger. */
export const normalizeAngle = (deg: number): number => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180
  return Math.abs(a + 180) < 1e-9 ? 180 : a
}

/** 2D SVG overlay — viewBox y aşağı; 3D UV ile aynı dönüşüm. */
export const printImageSvgTransform = (bounds: Size, transform: PrintTransform, margin = SVG_MARGIN_MM): string => {
  const cx = margin + bounds.width / 2
  const cy = margin + bounds.height / 2
  return `translate(${cx + transform.offsetX} ${cy - transform.offsetY}) rotate(${transform.rotation}) scale(${transform.scale}) translate(${-cx} ${-cy})`
}

/** SVG'de görselin ölçek 1'deki dikdörtgeni (dönüşüm `printImageSvgTransform` ile uygulanır). */
export const printImageSvgRect = (bounds: Size, transform: PrintTransform, margin = SVG_MARGIN_MM) => {
  const base = printBaseSize(bounds, transform)
  return {
    x: margin + (bounds.width - base.width) / 2,
    y: margin + (bounds.height - base.height) / 2,
    width: base.width,
    height: base.height,
  }
}

/**
 * Baskı çerçevesinin SVG (y aşağı) koordinatlarında merkezi, yarı boyları ve köşeleri —
 * tuval üzerindeki tutamaklar için.
 */
export const printFrameSvg = (bounds: Size, transform: PrintTransform, margin = SVG_MARGIN_MM) => {
  const size = printSize(bounds, transform)
  const cx = margin + bounds.width / 2 + transform.offsetX
  const cy = margin + bounds.height / 2 - transform.offsetY
  const rad = (transform.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const at = (lx: number, ly: number) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos })
  const hw = size.width / 2
  const hh = size.height / 2
  return {
    center: { x: cx, y: cy },
    hw,
    hh,
    corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)],
    /** Üst kenarın ortası (döndürme tutamağının bağlandığı yer). */
    topMid: at(0, -hh),
    at,
  }
}

export const catalogLabel = (text: I18nText, locale: 'tr' | 'en'): string => text[locale] || text.tr
