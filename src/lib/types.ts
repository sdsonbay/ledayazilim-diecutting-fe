export interface I18nText {
  tr: string
  en: string
}

export interface ParamDef {
  key: string
  kind: 'number' | 'boolean' | 'enum'
  label: I18nText
  help?: I18nText
  group?: string
  advanced?: boolean
  min?: number
  max?: number
  step?: number
  default: number | string | boolean
  unit?: string
  autoWhenZero?: boolean
  options?: { value: string; label: I18nText }[]
}

export interface PreviewDims {
  a: number
  b: number
  c: number
  kind: 'box' | 'card' | 'tube'
}

export interface TemplateSummary {
  id: string
  familyId?: string
  code: string
  standard: string
  name: I18nText
  description: I18nText
  category: string
  categoryLabel: I18nText
  materials: string[]
  maturity: 'stable' | 'beta'
  keywords: string[]
  badges?: I18nText[]
  previewDims?: PreviewDims
  /** Karşılık gelen diecuttemplates.com kimlikleri (becf-…). */
  dct?: string[]
  /** diecuttemplates.com “+N Variations”. */
  variations?: number
}

export interface TemplateDetail extends TemplateSummary {
  params: ParamDef[]
}

export interface Point {
  x: number
  y: number
}

export interface Fold {
  id: string
  parent: string
  child: string
  axis: [Point, Point]
  angle: number
  kind: string
  reverse?: boolean
}

export interface Panel {
  id: string
  name: string
  label: I18nText
  outline: Point[]
  holes?: Point[][]
  role: string
  printable: boolean
}

export interface DielineResponse {
  id?: string
  templateId: string
  unit: string
  params: Record<string, number | string | boolean>
  meta: { name: I18nText; caliper: number }
  bounds: { x: number; y: number; width: number; height: number }
  stats: {
    cutLength: number
    creaseLength: number
    perfLength: number
    flatWidth: number
    flatHeight: number
    area: number
    boundingArea: number
    utilisation: number
  }
  warnings: { code: string; severity: string; message: I18nText }[]
  panels: Panel[]
  folds: Fold[]
  rootPanel: string
  svg: string
  paths?: DielinePath[]
}

export type PathCommand =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; rot: number; large: boolean; sweep: boolean; x: number; y: number }
  | { c: 'Z' }

export interface DielinePath {
  id: string
  layer: string
  commands: PathCommand[]
  note?: string
}

export interface SessionUser {
  id: string
  email: string
  name: string | null
  plan: string
}

export interface Session {
  user: SessionUser | null
  credits: number
  plan: string
  guest: boolean
}

export interface CatalogFacet {
  id: string
  label: I18nText
  count?: number
}

export interface CatalogBranch {
  id: string
  label: I18nText
  count: number
  groups: CatalogFacet[]
}

export interface PrintTransform {
  /** 1 = bıçak izine sığdırılmış boy. */
  scale: number
  /** Merkezden kaydırma (mm, y yukarı). */
  offsetX: number
  offsetY: number
  /** Derece, saat yönünde. */
  rotation: number
  /**
   * Görselin en/boy oranı. Varsa görsel oranı korunarak bıçak izinin içine sığdırılır;
   * yoksa (eski kayıtlar) bıçak izi sınırlarına gerilir.
   */
  aspect?: number
}

export interface PrintFinish {
  foil: { enabled: boolean; color: string; intensity: number }
  emboss: { enabled: boolean; depth: number }
  varnish: { enabled: boolean; gloss: number }
  masks?: { foil?: string; emboss?: string; varnish?: string }
}

export const defaultPrintFinish = (): PrintFinish => ({
  foil: { enabled: false, color: '#c9a227', intensity: 0.85 },
  emboss: { enabled: false, depth: 0.35 },
  varnish: { enabled: false, gloss: 0.7 },
})

export interface SavedDesign {
  id: string
  templateId: string
  name: string
  params: Record<string, number | string | boolean>
  printTransform: PrintTransform
  finishSettings?: PrintFinish
  hasArtwork: boolean
  createdAt: string
  updatedAt: string
}

/** GET /catalog/dct-coverage — diecuttemplates.com envanterine göre kapsam. */
export interface DctCoverage {
  total: number
  covered: number
  variations: number
  variationsCovered: number
  configurableTotal: number
  grandTotal: number
  grandCovered: number
}
