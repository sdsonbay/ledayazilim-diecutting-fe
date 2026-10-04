import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { ClipPath, Defs, G, Image as SvgImage, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg'
import { SVG_MARGIN_MM, printImageSvgTransform } from '../../lib/printMap'
import type { DielineResponse, PathCommand, Point, PrintTransform } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { fonts } from '../../theme/tokens'
import { Text } from '../ui/Text'
import { ZoomSurface, type ViewBox } from './ZoomSurface'

const commandsToD = (commands: PathCommand[]): string => {
  let d = ''
  for (const c of commands) {
    switch (c.c) {
      case 'M':
      case 'L':
        d += `${c.c}${r(c.x)} ${r(c.y)}`
        break
      case 'C':
        d += `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`
        break
      case 'A':
        d += `A${r(c.rx)} ${r(c.ry)} ${r(c.rot)} ${c.large ? 1 : 0} ${c.sweep ? 1 : 0} ${r(c.x)} ${r(c.y)}`
        break
      case 'Z':
        d += 'Z'
        break
    }
  }
  return d
}

const r = (n: number) => Math.round(n * 1000) / 1000

const polyD = (pts: Point[]) => (pts.length ? `M${pts.map((p) => `${r(p.x)} ${r(p.y)}`).join('L')}Z` : '')

interface LayerStyle {
  color: string
  width: number
  dash?: number[]
  opacity?: number
}

/**
 * Bıçak izi çizimi: API'nin yapısal `paths` verisinden, tema renkleriyle.
 * Çizgi kalınlıkları ekran pikseli cinsinden sabit kalır (yakınlaştırmada da).
 */
export const DielineCanvas = memo(function DielineCanvas({
  dieline,
  printUri,
  printTransform,
  showPanels = true,
  interactive = true,
  formatLength,
}: {
  dieline: DielineResponse
  printUri?: string | null
  printTransform?: PrintTransform
  showPanels?: boolean
  interactive?: boolean
  /** Verilirse otomatik ölçü çizgileri (toplam en/boy + panel genişlikleri) çizilir. */
  formatLength?: (mm: number) => string
}) {
  const { colors } = useTheme()
  const { bounds } = dieline
  // Ölçü çizgileri için üstte ve solda ek boşluk.
  const m = SVG_MARGIN_MM
  const dimPad = formatLength ? Math.max(bounds.width, bounds.height) * 0.09 : 0
  const content: ViewBox = { x: -dimPad, y: -dimPad, w: bounds.width + m * 2 + dimPad, h: bounds.height + m * 2 + dimPad }
  // API koordinatları y-yukarı; SVG y-aşağı. Referans SVG'deki dönüşümün aynısı.
  const flip = `translate(${r(m - bounds.x)} ${r(m + bounds.y + bounds.height)}) scale(1,-1)`

  const layers = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const p of dieline.paths ?? []) {
      const list = out.get(p.layer) ?? []
      list.push(commandsToD(p.commands))
      out.set(p.layer, list)
    }
    return out
  }, [dieline.paths])

  const panelPaths = useMemo(
    () =>
      dieline.panels.map((panel) => ({
        id: panel.id,
        d: polyD(panel.outline) + (panel.holes ?? []).map(polyD).join(''),
        glue: panel.role === 'glue',
      })),
    [dieline.panels],
  )

  // Düşey kırımların x konumları → üst kenarda panel genişlikleri.
  const panelStops = useMemo(() => {
    const xs = new Set<number>()
    for (const p of dieline.paths ?? []) {
      if (p.layer !== 'crease') continue
      const pts = p.commands.filter((c): c is Extract<PathCommand, { x: number }> => 'x' in c)
      if (pts.length === 2 && Math.abs(pts[0]!.x - pts[1]!.x) < 0.01 && Math.abs(pts[0]!.y - pts[1]!.y) > bounds.height * 0.2) {
        xs.add(Math.round(pts[0]!.x * 10) / 10)
      }
    }
    return [bounds.x, ...[...xs].sort((a, b) => a - b), bounds.x + bounds.width]
  }, [dieline.paths, bounds.x, bounds.width, bounds.height])

  const styleOf = (layer: string): LayerStyle => {
    switch (layer) {
      case 'cut':
        return { color: colors.accent, width: 1.6 }
      case 'crease':
        return { color: colors.crease, width: 1.2, dash: [6, 4] }
      case 'perf':
        return { color: colors.ink, width: 1.1, dash: [2, 3] }
      case 'bleed':
        return { color: colors.muted, width: 0.8, dash: [3, 3], opacity: 0.55 }
      case 'glue':
        return { color: colors.success, width: 0.9, dash: [1, 3], opacity: 0.8 }
      default:
        return { color: colors.inkSoft, width: 0.8, opacity: 0.6 }
    }
  }

  const order = ['bleed', 'glue', 'crease', 'perf', 'cut']
  const layerKeys = [...layers.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))

  const toX = (x: number) => m - bounds.x + x
  const renderDimensions = (upp: number) => {
    if (!formatLength) return null
    const c = colors.muted
    const sw = 1 * upp
    const fs = 11 * upp
    const tick = 5 * upp
    const yTop = -dimPad * 0.35
    const xLeft = -dimPad * 0.35
    const top = m
    const bottom = m + bounds.height
    const left = m
    const right = m + bounds.width
    const arrow = (x1: number, y1: number, x2: number, y2: number, key: string) => (
      <G key={key}>
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={sw} />
        {x1 === x2 ? (
          <>
            <Line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke={c} strokeWidth={sw} />
            <Line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke={c} strokeWidth={sw} />
          </>
        ) : (
          <>
            <Line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke={c} strokeWidth={sw} />
            <Line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke={c} strokeWidth={sw} />
          </>
        )}
      </G>
    )
    const segs = panelStops.slice(1).map((x, i) => ({ a: panelStops[i]!, b: x })).filter((s) => s.b - s.a > bounds.width * 0.06)
    return (
      <G>
        {arrow(left, yTop, right, yTop, 'w')}
        <SvgText x={(left + right) / 2} y={yTop - 4 * upp} fontSize={fs} fill={colors.ink} textAnchor="middle" fontFamily={fonts.semibold}>
          {formatLength(bounds.width)}
        </SvgText>
        {segs.length > 1
          ? segs.map((s, i) => (
              <G key={i}>
                <Line x1={toX(s.a)} y1={top - 3 * upp} x2={toX(s.a)} y2={yTop + tick} stroke={colors.line} strokeWidth={sw} />
                <SvgText x={(toX(s.a) + toX(s.b)) / 2} y={yTop + 12 * upp} fontSize={fs * 0.85} fill={c} textAnchor="middle" fontFamily={fonts.medium}>
                  {formatLength(s.b - s.a)}
                </SvgText>
              </G>
            ))
          : null}
        {arrow(xLeft, top, xLeft, bottom, 'h')}
        <SvgText
          x={xLeft - 5 * upp}
          y={(top + bottom) / 2}
          fontSize={fs}
          fill={colors.ink}
          textAnchor="middle"
          fontFamily={fonts.semibold}
          transform={`rotate(-90 ${xLeft - 5 * upp} ${(top + bottom) / 2})`}
        >
          {formatLength(bounds.height)}
        </SvgText>
      </G>
    )
  }

  const draw = (view: ViewBox, size: { width: number; height: number }) => {
    const upp = view.w / size.width // piksel başına birim
    return (
      <Svg width={size.width} height={size.height} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <ClipPath id="dl-panels">
            <G transform={flip}>
              {panelPaths.map((p) => (
                <Path key={p.id} d={p.d} fillRule="evenodd" />
              ))}
            </G>
          </ClipPath>
          <Pattern id="dl-glue" patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
            <Rect width={1} height={4} fill={colors.success} opacity={0.25} />
          </Pattern>
        </Defs>
        {showPanels ? (
          <G transform={flip}>
            {panelPaths.map((p) => (
              <Path key={p.id} d={p.d} fill={p.glue ? 'url(#dl-glue)' : colors.surface} fillRule="evenodd" />
            ))}
          </G>
        ) : null}
        {printUri && printTransform ? (
          <G clipPath="url(#dl-panels)">
            <SvgImage
              href={printUri}
              x={m}
              y={m}
              width={bounds.width}
              height={bounds.height}
              preserveAspectRatio="none"
              transform={printImageSvgTransform(bounds, printTransform)}
            />
          </G>
        ) : null}
        {formatLength ? renderDimensions(upp) : null}
        <G transform={flip}>
          {layerKeys.map((layer) => {
            const s = styleOf(layer)
            return (
              <G key={layer} opacity={s.opacity ?? 1}>
                {(layers.get(layer) ?? []).map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width * upp}
                    strokeDasharray={s.dash?.map((v) => v * upp)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </G>
            )
          })}
        </G>
      </Svg>
    )
  }

  return (
    <ZoomSurface content={content} resetKey={dieline.templateId} interactive={interactive}>
      {draw}
    </ZoomSurface>
  )
})

/** Ölçü/çizgi lejantı. */
export const DielineLegend = ({ labels }: { labels: { cut: string; crease: string } }) => {
  const { colors } = useTheme()
  return (
    <View style={styles.legend}>
      <Svg width={22} height={6}>
        <Path d="M1 3H21" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <LegendText>{labels.cut}</LegendText>
      <Svg width={22} height={6}>
        <Path d="M1 3H21" stroke={colors.crease} strokeWidth={1.6} strokeDasharray="5 3" strokeLinecap="round" />
      </Svg>
      <LegendText>{labels.crease}</LegendText>
    </View>
  )
}

const LegendText = ({ children }: { children: string }) => (
  <Text variant="small" tone="muted" style={{ marginRight: 10 }}>
    {children}
  </Text>
)

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
