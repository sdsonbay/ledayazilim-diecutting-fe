import type { PrintTransform } from '../lib/types'

export type { PrintTransform }

export const defaultPrintTransform = (): PrintTransform => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
})
