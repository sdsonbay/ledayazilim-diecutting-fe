import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import type { ImposeState } from '../../hooks/useImpose'
import { useI18n } from '../../i18n/LocaleContext'
import type { ImposePayload } from '../../lib/impose'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Chip, Divider, Input, SectionTitle, Segmented, Text, Toggle } from '../ui'

const num = (raw: string, fallback: number) => {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export const ImposePanel = ({ impose }: { impose: ImposeState }) => {
  const { t, label, locale } = useI18n()
  const { colors } = useTheme()
  const { cfg, setCfg, result, sheets, cost } = impose
  const layout = result?.layout
  const set = (patch: Partial<ImposePayload>) => setCfg((c) => ({ ...c, ...patch }))
  const money = (n: number) => n.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 })

  return (
    <View style={{ gap: 14 }}>
      <Text variant="small" tone="muted">
        {t('editor.imposeHelp')}
      </Text>

      {layout ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.kpis, { backgroundColor: colors.surfaceAlt }]}>
          <Kpi value={String(layout.copies)} label={t('editor.upOnSheet', { n: '' }).trim()} accent />
          <Kpi value={`${(layout.sheetFill * 100).toFixed(1)}%`} label={t('editor.fill', { n: '' }).replace('%', '').trim()} />
          <Kpi value={`${(layout.wasteRatio * 100).toFixed(1)}%`} label={t('editor.waste', { n: '' }).replace('%', '').trim()} />
        </Animated.View>
      ) : null}
      {layout?.copies === 0 ? (
        <Text variant="small" tone="danger">
          {t('editor.noFit')}
        </Text>
      ) : null}
      {layout?.sheetAdjusted ? (
        <Text variant="small" tone="accent">
          {t('editor.sheetAdjusted', { w: Math.round(layout.sheet.width), h: Math.round(layout.sheet.height) })}
        </Text>
      ) : null}

      <SectionTitle title={t('editor.sheet')} />
      <View style={styles.wrap}>
        {sheets.map((s) => (
          <Chip
            key={s.id}
            label={label(s.label)}
            selected={cfg.sheetId === s.id}
            onPress={() => set(s.id === 'custom' ? { sheetId: 'custom' } : { sheetId: s.id, sheetWidth: s.width, sheetHeight: s.height })}
          />
        ))}
      </View>
      {cfg.sheetId === 'custom' ? (
        <View style={styles.row}>
          <NumberInput label={t('editor.sheetW')} value={cfg.sheetWidth} onChange={(v) => set({ sheetWidth: v })} />
          <NumberInput label={t('editor.sheetH')} value={cfg.sheetHeight} onChange={(v) => set({ sheetHeight: v })} />
        </View>
      ) : null}

      {layout && impose.alts.length > 1 ? (
        <Segmented
          size="sm"
          value={cfg.rotation === 'auto' ? 'auto' : String(cfg.rotation)}
          onChange={(v) => set({ rotation: v === 'auto' ? 'auto' : (Number(v) as 0 | 90) })}
          options={[
            { value: 'auto', label: t('editor.autoRotate') },
            ...impose.alts.slice(0, 2).map((alt) => ({ value: String(alt.rotation), label: `${alt.cols}×${alt.rows} · ${alt.rotation}°` })),
          ]}
        />
      ) : null}

      <View style={styles.row}>
        <NumberInput label={t('editor.marginGripper')} value={cfg.marginGripper} onChange={(v) => set({ marginGripper: v })} />
        <NumberInput label={t('editor.marginTail')} value={cfg.marginTail} onChange={(v) => set({ marginTail: v })} />
        <NumberInput label={t('editor.marginSide')} value={cfg.marginSide} onChange={(v) => set({ marginSide: v })} />
      </View>
      <Toggle label={t('editor.fullSheet')} value={cfg.fullSheet} onChange={(v) => set({ fullSheet: v })} />
      {!cfg.fullSheet ? (
        <NumberInput label={t('editor.copies')} value={cfg.copies} onChange={(v) => set({ copies: Math.max(1, Math.round(v)) })} unit="" />
      ) : null}

      <SectionTitle title={t('editor.otherSettings')} />
      <View style={styles.row}>
        <NumberInput label={t('editor.gapX')} value={cfg.gapX} onChange={(v) => set({ gapX: v })} />
        <NumberInput label={t('editor.gapY')} value={cfg.gapY} onChange={(v) => set({ gapY: v })} />
      </View>
      <Toggle label={t('editor.dimLines')} value={cfg.dimensionLines} onChange={(v) => set({ dimensionLines: v })} />

      <Divider />
      <SectionTitle title={t('editor.imposeTitle')} />
      <View style={styles.row}>
        <NumberInput label={t('editor.qty')} value={impose.qty} onChange={(v) => impose.setQty(Math.max(0, Math.round(v)))} unit="" />
        <NumberInput label={t('editor.sheetPrice')} value={impose.sheetPrice} onChange={impose.setSheetPrice} unit="₺" />
        <NumberInput label={t('editor.knifePrice')} value={impose.knifePrice} onChange={impose.setKnifePrice} unit="₺" />
      </View>
      {cost ? (
        <View style={[styles.cost, { borderColor: colors.line }]}>
          <CostRow label={t('editor.sheetsNeeded', { n: cost.sheets })} />
          {cost.leftover > 0 ? <CostRow label={t('editor.leftover', { n: cost.leftover })} /> : null}
          {impose.sheetPrice > 0 ? <CostRow label={t('editor.paperCost', { n: money(cost.paperCost) })} /> : null}
          {impose.knifePrice > 0 ? <CostRow label={t('editor.dieCost', { n: money(cost.dieCost) })} /> : null}
          {impose.sheetPrice > 0 || impose.knifePrice > 0 ? (
            <>
              <CostRow label={t('editor.totalCost', { n: money(cost.total) })} strong />
              <CostRow label={t('editor.costPerBox', { n: money(cost.costPerBox) })} />
            </>
          ) : null}
        </View>
      ) : null}
      <Text variant="small" tone="muted">
        {t('editor.costHint')}
      </Text>
    </View>
  )
}

const Kpi = ({ value, label, accent }: { value: string; label: string; accent?: boolean }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <Text variant="title" tone={accent ? 'accent' : 'ink'}>
      {value}
    </Text>
    <Text variant="small" tone="muted" numberOfLines={1}>
      {label}
    </Text>
  </View>
)

const CostRow = ({ label, strong }: { label: string; strong?: boolean }) => (
  <Text variant={strong ? 'bodyStrong' : 'small'} tone={strong ? 'ink' : 'soft'}>
    {label}
  </Text>
)

const NumberInput = ({ label, value, onChange, unit = 'mm' }: { label: string; value: number; onChange: (v: number) => void; unit?: string }) => (
  <View style={{ flexGrow: 1, flexBasis: 100, minWidth: 0 }}>
    <Input
      label={label}
      defaultValue={String(value)}
      key={value}
      keyboardType="decimal-pad"
      suffix={unit || undefined}
      onEndEditing={(e) => onChange(num(e.nativeEvent.text, value))}
      onSubmitEditing={(e) => onChange(num(e.nativeEvent.text, value))}
      onBlur={(e) => {
        const text = (e.target as unknown as { value?: string })?.value
        if (typeof text === 'string') onChange(num(text, value))
      }}
    />
  </View>
)

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  kpis: { flexDirection: 'row', padding: 16, borderRadius: radius.lg, gap: 12 },
  cost: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 6 },
})
