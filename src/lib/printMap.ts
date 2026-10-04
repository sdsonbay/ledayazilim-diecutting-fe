import type { I18nText, PrintTransform } from './types'

export const SVG_MARGIN_MM = 5

/** 2D SVG overlay — viewBox y aşağı; 3D UV ile aynı dönüşüm. */
export const printImageSvgTransform = (
  bounds: { width: number; height: number },
  transform: PrintTransform,
  margin = SVG_MARGIN_MM,
): string => {
  const cx = margin + bounds.width / 2
  const cy = margin + bounds.height / 2
  return `translate(${cx + transform.offsetX} ${cy - transform.offsetY}) rotate(${transform.rotation}) scale(${transform.scale}) translate(${-cx} ${-cy})`
}

export const catalogLabel = (text: I18nText, locale: 'tr' | 'en'): string => text[locale] || text.tr
