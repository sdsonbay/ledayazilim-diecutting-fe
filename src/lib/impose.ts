import type { DielineResponse, I18nText } from './types'

export interface SheetPreset {
  id: string
  width: number
  height: number
  label: I18nText
}

export interface ImposePayload {
  sheetId: string
  sheetWidth: number
  sheetHeight: number
  marginGripper: number
  marginTail: number
  marginSide: number
  gapX: number
  gapY: number
  fullSheet: boolean
  copies: number
  rotation: 'auto' | 0 | 90
  dimensionLines: boolean
}

export interface ImposeCandidate {
  rotation: 0 | 90
  cols: number
  rows: number
  copies: number
  pieceWidth: number
  pieceHeight: number
}

export interface ImposePlacement {
  x: number
  y: number
  rotation: 0 | 90
  width: number
  height: number
}

export interface ImposeLayout {
  cols: number
  rows: number
  copies: number
  maxCopies: number
  rotation: 0 | 90
  pieceWidth: number
  pieceHeight: number
  nestedWidth: number
  nestedHeight: number
  usable: { x: number; y: number; width: number; height: number }
  sheet: { width: number; height: number }
  wasteRatio: number
  sheetFill: number
  cutLength: number
  creaseLength: number
  perfLength: number
  alternatives: ImposeCandidate[]
  sheetId?: string
  sheetAdjusted?: boolean
  placements: ImposePlacement[]
  mixedCopies: number
}

export interface ImposeResponse {
  svg: string
  layout: ImposeLayout
  presets: SheetPreset[]
}

export const DEFAULT_SHEETS: SheetPreset[] = [
  { id: 'b0', width: 1000, height: 1414, label: { tr: 'B0 1000×1414 mm', en: 'B0 1000×1414 mm' } },
  { id: 'b1', width: 707, height: 1000, label: { tr: 'B1 707×1000 mm', en: 'B1 707×1000 mm' } },
  { id: 'b2', width: 500, height: 707, label: { tr: 'B2 500×707 mm', en: 'B2 500×707 mm' } },
  { id: 'a0', width: 841, height: 1189, label: { tr: 'A0 841×1189 mm', en: 'A0 841×1189 mm' } },
  { id: 'a1', width: 594, height: 841, label: { tr: 'A1 594×841 mm', en: 'A1 594×841 mm' } },
  { id: 'a2', width: 420, height: 594, label: { tr: 'A2 420×594 mm', en: 'A2 420×594 mm' } },
  { id: 'a3', width: 297, height: 420, label: { tr: 'A3 297×420 mm', en: 'A3 297×420 mm' } },
  { id: 's70x100', width: 700, height: 1000, label: { tr: '70×100 cm', en: '70×100 cm' } },
  { id: 's64x90', width: 640, height: 900, label: { tr: '64×90 cm', en: '64×90 cm' } },
  { id: 's50x70', width: 500, height: 700, label: { tr: '50×70 cm', en: '50×70 cm' } },
  { id: 's100x70', width: 1000, height: 700, label: { tr: '100×70 cm', en: '100×70 cm' } },
  { id: 's100x140', width: 1000, height: 1400, label: { tr: '100×140 cm', en: '100×140 cm' } },
  { id: 's120x160', width: 1200, height: 1600, label: { tr: '120×160 cm', en: '120×160 cm' } },
  { id: 's140x200', width: 1400, height: 2000, label: { tr: '140×200 cm', en: '140×200 cm' } },
  { id: 's160x120', width: 1600, height: 1200, label: { tr: '160×120 cm', en: '160×120 cm' } },
  { id: 'custom', width: 1000, height: 1414, label: { tr: 'Özel ölçü', en: 'Custom size' } },
]

export const defaultImpose = (): ImposePayload => ({
  sheetId: 'b0',
  sheetWidth: 1000,
  sheetHeight: 1414,
  marginGripper: 15,
  marginTail: 5,
  marginSide: 5,
  gapX: 0,
  gapY: 0,
  fullSheet: true,
  copies: 16,
  rotation: 'auto',
  dimensionLines: true,
})

export const imposeCost = (
  layout: ImposeLayout,
  quantity: number,
  sheetPrice: number,
  knifePerMeter: number,
) => {
  const qty = Math.max(0, Math.round(quantity))
  const copies = layout.copies
  const sheets = copies > 0 && qty > 0 ? Math.ceil(qty / copies) : 0
  const leftover = copies > 0 && qty > 0 ? sheets * copies - qty : 0
  const paperCost = sheets * Math.max(0, sheetPrice)
  const dieMeters = (layout.cutLength + layout.creaseLength) / 1000
  const dieCost = dieMeters * Math.max(0, knifePerMeter)
  const total = paperCost + dieCost
  return {
    sheets,
    leftover,
    paperCost,
    dieCost,
    total,
    costPerBox: qty > 0 ? total / qty : 0,
    dieMeters,
  }
}

export const slimDieline = (d: DielineResponse) => ({
  templateId: d.templateId,
  bounds: d.bounds,
  paths: d.paths ?? [],
  stats: d.stats,
  meta: d.meta,
  params: d.params,
})

const EPS = 1e-6

const packGrid = (usableW: number, usableH: number, pieceW: number, pieceH: number, gapX: number, gapY: number) => {
  if (pieceW <= 0 || pieceH <= 0 || usableW + EPS < pieceW || usableH + EPS < pieceH) {
    return { cols: 0, rows: 0, copies: 0 }
  }
  const cols = Math.floor((usableW + gapX + EPS) / (pieceW + gapX))
  const rows = Math.floor((usableH + gapY + EPS) / (pieceH + gapY))
  return { cols, rows, copies: Math.max(0, cols) * Math.max(0, rows) }
}

const pieceSize = (bounds: { width: number; height: number }, rot: 0 | 90) =>
  rot === 0 ? { w: bounds.width, h: bounds.height } : { w: bounds.height, h: bounds.width }

const candidate = (
  bounds: { width: number; height: number },
  rot: 0 | 90,
  usableW: number,
  usableH: number,
  gapX: number,
  gapY: number,
): ImposeCandidate => {
  const { w: pieceWidth, h: pieceHeight } = pieceSize(bounds, rot)
  return { rotation: rot, pieceWidth, pieceHeight, ...packGrid(usableW, usableH, pieceWidth, pieceHeight, gapX, gapY) }
}

const usableOf = (cfg: ImposePayload, sheetW = cfg.sheetWidth, sheetH = cfg.sheetHeight) => ({
  x: cfg.marginSide,
  y: cfg.marginGripper,
  width: sheetW - cfg.marginSide * 2,
  height: sheetH - cfg.marginGripper - cfg.marginTail,
})

const placeGrid = (
  ox: number,
  oy: number,
  cols: number,
  rows: number,
  pw: number,
  ph: number,
  gapX: number,
  gapY: number,
  rot: 0 | 90,
): ImposePlacement[] => {
  const out: ImposePlacement[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        x: ox + col * (pw + gapX),
        y: oy + row * (ph + gapY),
        rotation: rot,
        width: pw,
        height: ph,
      })
    }
  }
  return out
}

/** Yerleşim özeti: arama yalnız sayar; yerleşimler en iyi seçimden sonra bir kez üretilir (API ile aynı). */
interface PackScore {
  n: number
  zero: number
  mask: number
  choice: { rot: 0 | 90; cols: number; rows: number; right: boolean; top: boolean } | null
}

const EMPTY_SCORE: PackScore = { n: 0, zero: 0, mask: 0, choice: null }
const SPAN_LIMIT = 8

const betterScore = (a: PackScore, b: PackScore): boolean => {
  if (a.n !== b.n) return a.n > b.n
  const mixedA = a.mask === 3
  const mixedB = b.mask === 3
  if (mixedA !== mixedB) return !mixedA
  return a.zero > b.zero
}

/**
 * Guillotine: ana ızgara + sağ/üst kalan şeritte diğer yön. Alt problemler önbellekten gelir
 * (eski yinelemeli arama küçük kutu + büyük tabakada arayüzü dakikalarca dondurabiliyordu).
 */
const packRect = (
  rect: { x: number; y: number; width: number; height: number },
  bounds: { width: number; height: number },
  gapX: number,
  gapY: number,
  allowed: readonly (0 | 90)[],
): ImposePlacement[] => {
  const memo = new Map<string, PackScore>()
  const minSide = Math.min(bounds.width, bounds.height)
  const restOf = (w: number, h: number, pw: number, ph: number, cols: number, rows: number) => {
    const nestedW = cols * pw + (cols - 1) * gapX
    const nestedH = rows * ph + (rows - 1) * gapY
    const rightW = w - nestedW - (nestedW > 0 ? gapX : 0)
    const topH = h - nestedH - (nestedH > 0 ? gapY : 0)
    return { nestedW, nestedH, rightW, topH, right: rightW + EPS >= minSide, top: topH + EPS >= minSide && nestedW > EPS }
  }
  const score = (w: number, h: number, depth: number): PackScore => {
    if (depth > 4 || w <= EPS || h <= EPS) return EMPTY_SCORE
    const key = `${Math.round(w * 1e6)}x${Math.round(h * 1e6)}@${depth}`
    const hit = memo.get(key)
    if (hit) return hit
    let best = EMPTY_SCORE
    let found = false
    for (const rot of allowed) {
      const { w: pw, h: ph } = pieceSize(bounds, rot)
      const { cols: maxC, rows: maxR } = packGrid(w, h, pw, ph, gapX, gapY)
      if (maxC === 0 || maxR === 0) continue
      for (let cols = maxC; cols >= Math.max(1, maxC - SPAN_LIMIT); cols--) {
        for (let rows = maxR; rows >= Math.max(1, maxR - SPAN_LIMIT); rows--) {
          if (cols !== maxC && rows !== maxR) continue
          const r = restOf(w, h, pw, ph, cols, rows)
          const right = r.right ? score(r.rightW, h, depth + 1) : EMPTY_SCORE
          const top = r.top ? score(r.nestedW, r.topH, depth + 1) : EMPTY_SCORE
          const placed = cols * rows
          const next: PackScore = {
            n: placed + right.n + top.n,
            zero: (rot === 0 ? placed : 0) + right.zero + top.zero,
            mask: (rot === 0 ? 1 : 2) | right.mask | top.mask,
            choice: { rot, cols, rows, right: r.right, top: r.top },
          }
          if (!found || betterScore(next, best)) {
            best = next
            found = true
          }
        }
      }
    }
    memo.set(key, best)
    return best
  }
  const build = (r: { x: number; y: number; width: number; height: number }, depth: number): ImposePlacement[] => {
    if (depth > 4 || r.width <= EPS || r.height <= EPS) return []
    const choice = score(r.width, r.height, depth).choice
    if (!choice) return []
    const { w: pw, h: ph } = pieceSize(bounds, choice.rot)
    const rest = restOf(r.width, r.height, pw, ph, choice.cols, choice.rows)
    const out = placeGrid(r.x, r.y, choice.cols, choice.rows, pw, ph, gapX, gapY, choice.rot)
    if (choice.right) out.push(...build({ x: r.x + rest.nestedW + (rest.nestedW > 0 ? gapX : 0), y: r.y, width: rest.rightW, height: r.height }, depth + 1))
    if (choice.top) out.push(...build({ x: r.x, y: r.y + rest.nestedH + (rest.nestedH > 0 ? gapY : 0), width: rest.nestedW, height: rest.topH }, depth + 1))
    return out
  }
  return build(rect, 0)
}

const planSheet = (
  bounds: { width: number; height: number },
  usable: { x: number; y: number; width: number; height: number },
  cfg: ImposePayload,
) => {
  const allowed: readonly (0 | 90)[] = cfg.rotation === 0 ? [0] : cfg.rotation === 90 ? [90] : [0, 90]
  const placements = packRect(usable, bounds, cfg.gapX, cfg.gapY, allowed)
  const alt0 = candidate(bounds, 0, usable.width, usable.height, cfg.gapX, cfg.gapY)
  const alt90 = candidate(bounds, 90, usable.width, usable.height, cfg.gapX, cfg.gapY)
  const primaryRot = placements[0]?.rotation ?? (cfg.rotation === 90 ? 90 : 0)
  const primaryPlaced = placements.filter((p) => p.rotation === primaryRot)
  const xs = [...new Set(primaryPlaced.map((p) => Math.round(p.x * 1000) / 1000))].sort((a, b) => a - b)
  const ys = [...new Set(primaryPlaced.map((p) => Math.round(p.y * 1000) / 1000))].sort((a, b) => a - b)
  const size = pieceSize(bounds, primaryRot)
  const primary: ImposeCandidate =
    placements.length === 0
      ? cfg.rotation === 90
        ? alt90
        : cfg.rotation === 0
          ? alt0
          : alt0.copies >= alt90.copies
            ? alt0
            : alt90
      : {
          rotation: primaryRot,
          cols: xs.length,
          rows: ys.length,
          copies: primaryPlaced.length,
          pieceWidth: size.w,
          pieceHeight: size.h,
        }
  return { placements, primary, alt0, alt90 }
}

const copiesOn = (bounds: { width: number; height: number }, cfg: ImposePayload, sheetW: number, sheetH: number) => {
  const u = usableOf(cfg, sheetW, sheetH)
  if (u.width <= 0 || u.height <= 0) return 0
  return planSheet(bounds, u, cfg).placements.length
}

/** Editörde API gelmeden önce de dizgiyi hesaplar. */
export function packImposeLayout(
  bounds: { width: number; height: number },
  cfg: ImposePayload,
  stats?: DielineResponse['stats'],
): ImposeLayout {
  let sheetW = cfg.sheetWidth
  let sheetH = cfg.sheetHeight
  let sheetAdjusted = false
  if (copiesOn(bounds, cfg, sheetW, sheetH) === 0) {
    const ranked = DEFAULT_SHEETS.filter((p) => p.id !== 'custom').sort((a, b) => a.width * a.height - b.width * b.height)
    let found = false
    for (const preset of ranked) {
      if (copiesOn(bounds, cfg, preset.width, preset.height) > 0) {
        sheetW = preset.width
        sheetH = preset.height
        found = true
        sheetAdjusted = true
        break
      }
    }
    if (!found) {
      const slack = 4
      const w0 = bounds.width + cfg.marginSide * 2 + slack
      const h0 = bounds.height + cfg.marginGripper + cfg.marginTail + slack
      const w90 = bounds.height + cfg.marginSide * 2 + slack
      const h90 = bounds.width + cfg.marginGripper + cfg.marginTail + slack
      const use90 = cfg.rotation === 90 || (cfg.rotation !== 0 && w90 * h90 < w0 * h0)
      sheetW = Math.min(12000, Math.max(50, use90 ? w90 : w0))
      sheetH = Math.min(12000, Math.max(50, use90 ? h90 : h0))
      sheetAdjusted = true
    }
  }
  const usable = usableOf(cfg, sheetW, sheetH)
  const planned = planSheet(bounds, usable, cfg)
  const { alt0, alt90, primary: chosen } = planned
  const maxCopies = planned.placements.length
  const copies = cfg.fullSheet ? maxCopies : Math.min(maxCopies, Math.max(1, cfg.copies))
  const placements = planned.placements.slice(0, copies)
  const mixedCopies = placements.filter((p) => p.rotation !== chosen.rotation).length
  const placedArea = placements.reduce((sum, p) => sum + p.width * p.height, 0)
  let nestedWidth = 0
  let nestedHeight = 0
  if (placements.length > 0) {
    nestedWidth = Math.max(...placements.map((p) => p.x + p.width)) - Math.min(...placements.map((p) => p.x))
    nestedHeight = Math.max(...placements.map((p) => p.y + p.height)) - Math.min(...placements.map((p) => p.y))
  }
  const sheetId = DEFAULT_SHEETS.find((p) => p.id !== 'custom' && p.width === sheetW && p.height === sheetH)?.id ?? 'custom'
  const sheetArea = Math.max(sheetW * sheetH, 1)
  const usableArea = Math.max(usable.width * usable.height, 1)
  return {
    cols: chosen.cols,
    rows: chosen.rows,
    copies,
    maxCopies,
    rotation: chosen.rotation,
    pieceWidth: chosen.pieceWidth,
    pieceHeight: chosen.pieceHeight,
    nestedWidth,
    nestedHeight,
    usable,
    sheet: { width: sheetW, height: sheetH },
    wasteRatio: 1 - placedArea / usableArea,
    sheetFill: placedArea / sheetArea,
    cutLength: (stats?.cutLength ?? 0) * copies,
    creaseLength: (stats?.creaseLength ?? 0) * copies,
    perfLength: (stats?.perfLength ?? 0) * copies,
    alternatives: [alt0, alt90],
    sheetId,
    sheetAdjusted,
    placements,
    mixedCopies,
  }
}

/** Mevcut 2D SVG’yi tabakaya dizer — API olmasa da tuval boş kalmaz. */
export function composeLocalImposeSvg(
  pieceSvg: string,
  layout: ImposeLayout,
  _cfg: ImposePayload,
  theme: 'dark' | 'light',
): string {
  const sw = layout.sheet.width
  const sh = layout.sheet.height
  const bg = theme === 'light' ? '#ffffff' : '#0b0b0b'
  const stroke = theme === 'light' ? '#999999' : '#5a5a5a'
  const clean = pieceSvg.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/\s(width|height)="[^"]*mm"/gi, '')
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`
  const cells = (layout.placements ?? []).slice(0, layout.copies).map((cell) => {
    const origW = cell.rotation === 90 ? cell.height : cell.width
    const origH = cell.rotation === 90 ? cell.width : cell.height
    const svgY = sh - cell.y - cell.height
    const transform =
      cell.rotation === 90 ? `translate(${cell.x + cell.width} ${svgY}) rotate(90)` : `translate(${cell.x} ${svgY})`
    return `<g transform="${transform}"><image href="${href}" xlink:href="${href}" width="${origW}" height="${origH}" preserveAspectRatio="xMidYMid meet"/></g>`
  })
  const frame = Math.max(0.6, Math.min(sw, sh) * 0.002)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" height="100%" viewBox="0 0 ${sw} ${sh}" preserveAspectRatio="xMidYMid meet">`,
    `<rect width="${sw}" height="${sh}" fill="${bg}"/>`,
    `<rect x="0" y="0" width="${sw}" height="${sh}" fill="none" stroke="${stroke}" stroke-width="${frame}"/>`,
    `<rect x="${layout.usable.x}" y="${sh - layout.usable.y - layout.usable.height}" width="${layout.usable.width}" height="${layout.usable.height}" fill="none" stroke="${stroke}" stroke-width="${frame * 0.7}" stroke-dasharray="${frame * 4} ${frame * 3}"/>`,
    ...cells,
    `</svg>`,
  ].join('')
}
