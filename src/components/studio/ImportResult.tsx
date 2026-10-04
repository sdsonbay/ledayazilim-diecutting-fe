import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useI18n } from '../../i18n/LocaleContext'
import { api } from '../../lib/api'
import { linkedZones, setCaliper, setFoldAngle, stretchDieline, stretchStops, type Axis } from '../../lib/dielineEdit'
import type { DielineResponse, Point, TemplateMatch } from '../../lib/types'
import { useUnit } from '../../lib/units'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Badge, Button, Icon, NumberBox, ScalePressable, SectionTitle, Text, Toggle } from '../ui'

const MAIN_DIMS = ['length', 'width', 'height', 'depth', 'diameter']

/**
 * İçe aktarılan / çizilen bıçak izinin sonucu:
 * - Şablon tanındıysa parametrik editöre geçiş (tam ölçü, malzeme, baskı, 3D).
 * - Her durumda: kırım ızgarasına göre ölçü bölgeleri, malzeme kalınlığı ve kırım açıları.
 */
export const ImportResult = ({
  original,
  dieline,
  match,
  onChange,
  onHighlight,
}: {
  original: DielineResponse
  dieline: DielineResponse
  match: TemplateMatch | null | undefined
  onChange: (next: DielineResponse) => void
  onHighlight: (axis: [Point, Point] | null) => void
}) => {
  const { t, label } = useI18n()
  const { colors } = useTheme()
  const units = useUnit()
  const [linked, setLinked] = useState(true)
  const [showEdit, setShowEdit] = useState(!match)
  const [selectedFold, setSelectedFold] = useState<string | null>(null)
  const detail = useQuery({ queryKey: ['template', match?.templateId], queryFn: () => api.template(match!.templateId), enabled: Boolean(match) })

  const zones = useMemo(() => {
    const of = (axis: Axis) => {
      const stops = stretchStops(dieline, axis)
      return stops.slice(1).map((v, i) => v - stops[i]!)
    }
    return { x: of('x'), y: of('y') }
  }, [dieline])

  const toUnit = (mm: number) => Number(units.toDisplay(mm).toFixed(units.unit === 'in' ? 3 : 1))

  const setZone = (axis: Axis, index: number, mm: number) => {
    const sizes = [...zones[axis]]
    const targets = linked ? linkedZones(sizes, index) : [index]
    for (const i of targets) sizes[i] = mm
    onChange(stretchDieline(dieline, axis, sizes))
  }

  const openParametric = () => {
    if (!match) return
    router.push({ pathname: '/template/[id]', params: { id: match.templateId, p: JSON.stringify(match.variables) } })
  }

  const dims = match
    ? Object.entries(match.variables)
        .filter(([k, v]) => MAIN_DIMS.includes(k) && typeof v === 'number')
        .map(([, v]) => units.format(v as number, units.unit === 'in' ? 2 : 0))
    : []
  const disconnected = dieline.warnings.some((w) => w.code === 'disconnected')

  const zoneRow = (axis: Axis) => {
    const list = zones[axis]
    // Dikey bölgeler ekranda yukarıdan aşağıya okunur (motor y yukarı).
    const order = axis === 'y' ? list.map((_, i) => list.length - 1 - i) : list.map((_, i) => i)
    if (list.length <= 1) {
      return (
        <Text variant="small" tone="muted">
          {t('import.zonesNone')}
        </Text>
      )
    }
    return (
      <View style={styles.zones}>
        {order.map((i, n) => (
          <NumberBox
            key={`${axis}-${i}-${list.length}`}
            label={`${axis === 'x' ? 'A' : 'B'}${n + 1}`}
            unit={units.label}
            value={toUnit(list[i]!)}
            onCommit={(v) => {
              if (v > 0) setZone(axis, i, units.fromDisplay(v))
            }}
            style={styles.zone}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={{ gap: 16 }}>
      {match ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.match, { backgroundColor: colors.surface, borderColor: match.exact ? colors.success : colors.line }]}>
          <View style={styles.matchHead}>
            <View style={[styles.matchIcon, { backgroundColor: colors.accentSoft }]}>
              <Icon name="check-circle" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption" tone="muted">
                {t('import.matchTitle')}
              </Text>
              <Text variant="heading" numberOfLines={2}>
                {detail.data ? label(detail.data.name) : match.templateId}
              </Text>
            </View>
            <Badge
              label={match.exact ? t('import.matchExact') : t('import.matchSimilar', { n: Math.round(match.coverage * 100) })}
              tone={match.exact ? 'success' : 'warning'}
            />
          </View>
          {dims.length ? (
            <Text variant="mono" tone="soft">
              {dims.join(' × ')}
              {detail.data?.code ? `  ·  ${detail.data.code}` : ''}
            </Text>
          ) : null}
          <Text variant="small" tone="muted">
            {match.exact ? t('import.openParamHint') : t('import.similarHint', { mm: match.deviation.toFixed(1) })}
          </Text>
          <View style={styles.row}>
            <Button label={t('import.openParam')} icon="sliders" onPress={openParametric} />
            <Button label={showEdit ? t('import.hideEdit') : t('import.asIs')} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn} style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
          <Icon name="info" size={16} color={colors.inkSoft} />
          <Text variant="small" tone="soft" style={{ flex: 1 }}>
            {t('import.noMatch')}
          </Text>
        </Animated.View>
      )}

      {disconnected ? (
        <Text variant="small" color={colors.warning}>
          {t('import.warnDisconnected')}
        </Text>
      ) : null}

      {showEdit ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 14 }}>
          <SectionTitle title={t('import.editTitle')} />
          <Text variant="smallStrong" tone="soft">
            {t('import.zonesX')}
          </Text>
          {zoneRow('x')}
          <Text variant="smallStrong" tone="soft">
            {t('import.zonesY')}
          </Text>
          {zoneRow('y')}
          <Toggle value={linked} onChange={setLinked} label={t('import.linkZones')} hint={t('import.linkZonesHint')} />
          <NumberBox
            label={t('import.caliper')}
            unit="mm"
            value={dieline.meta.caliper}
            onCommit={(v) => {
              if (v > 0) onChange(setCaliper(dieline, v))
            }}
            style={{ flexBasis: 'auto' }}
          />

          <SectionTitle title={t('import.folds')} />
          <Text variant="small" tone="muted">
            {t('import.foldsHint')}
          </Text>
          <View style={{ gap: 6 }}>
            {dieline.folds.map((f, i) => {
              const len = Math.hypot(f.axis[1].x - f.axis[0].x, f.axis[1].y - f.axis[0].y)
              const active = selectedFold === f.id
              const mag = Math.abs(f.angle)
              const set = (deg: number) => onChange(setFoldAngle(dieline, f.id, Math.sign(f.angle || 1) * deg))
              return (
                <ScalePressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('import.fold', { n: i + 1 })}
                  onPress={() => {
                    const next = active ? null : f.id
                    setSelectedFold(next)
                    onHighlight(next ? f.axis : null)
                  }}
                  scaleTo={0.99}
                  style={[styles.fold, { backgroundColor: active ? colors.accentSoft : colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="smallStrong">{t('import.fold', { n: i + 1 })}</Text>
                    <Text variant="small" tone="muted">
                      {units.format(len, 0)} · {Math.round(f.angle)}°
                    </Text>
                  </View>
                  {[90, 180].map((deg) => (
                    <ScalePressable
                      key={deg}
                      accessibilityRole="button"
                      accessibilityLabel={`${deg}°`}
                      onPress={() => set(deg)}
                      scaleTo={0.92}
                      style={[styles.angle, { backgroundColor: Math.round(mag) === deg ? colors.ink : colors.surface }]}
                    >
                      <Text variant="smallStrong" color={Math.round(mag) === deg ? colors.bg : colors.ink}>
                        {deg}°
                      </Text>
                    </ScalePressable>
                  ))}
                  <View style={{ width: 74 }}>
                    <NumberBox label="" unit="°" value={Math.round(mag)} onCommit={(v) => set(Math.max(0, Math.min(180, v)))} style={{ flexBasis: 'auto' }} />
                  </View>
                  <ScalePressable
                    accessibilityRole="button"
                    accessibilityLabel={t('import.flip')}
                    onPress={() => onChange(setFoldAngle(dieline, f.id, -f.angle))}
                    scaleTo={0.9}
                    style={[styles.angle, { backgroundColor: colors.surface }]}
                  >
                    <Icon name="repeat" size={14} color={colors.ink} />
                  </ScalePressable>
                </ScalePressable>
              )
            })}
          </View>
          <Button
            label={t('import.reset')}
            icon="rotate-ccw"
            variant="ghost"
            size="sm"
            disabled={dieline === original}
            onPress={() => {
              setSelectedFold(null)
              onHighlight(null)
              onChange(original)
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  match: { borderWidth: 1.5, borderRadius: radius.xl, padding: 16, gap: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, alignItems: 'flex-start' },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zone: { flexBasis: 96, flexGrow: 0 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, paddingLeft: 12, borderRadius: radius.md },
  angle: { minWidth: 40, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
})
