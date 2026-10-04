import { memo, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useI18n } from '../../i18n/LocaleContext'
import type { ParamDef } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'
import { Chip, Icon, ScalePressable, Segmented, Slider, Text, Toggle } from '../ui'

export type ParamValue = number | string | boolean

const round = (n: number, step: number) => {
  const decimals = Math.max(0, (String(step).split('.')[1] ?? '').length)
  return Number(n.toFixed(decimals))
}

/** Tek parametre: sayı (adım + kaydırıcı + doğrudan giriş), anahtar veya seçenek. */
export const ParamField = memo(function ParamField({
  def,
  value,
  onChange,
}: {
  def: ParamDef
  value: ParamValue | undefined
  onChange: (key: string, value: ParamValue) => void
}) {
  const { label } = useI18n()
  const current = value ?? def.default

  if (def.kind === 'boolean') {
    return (
      <View style={styles.field}>
        <Toggle value={Boolean(current)} onChange={(v) => onChange(def.key, v)} label={label(def.label)} hint={def.help ? label(def.help) : undefined} />
      </View>
    )
  }

  if (def.kind === 'enum') {
    const options = def.options ?? []
    return (
      <View style={styles.field}>
        <Text variant="smallStrong" tone="soft">
          {label(def.label)}
        </Text>
        {options.length <= 3 ? (
          <Segmented
            size="sm"
            options={options.map((o) => ({ value: o.value, label: label(o.label) }))}
            value={String(current)}
            onChange={(v) => onChange(def.key, v)}
          />
        ) : (
          <View style={styles.wrap}>
            {options.map((o) => (
              <Chip key={o.value} label={label(o.label)} selected={String(current) === o.value} onPress={() => onChange(def.key, o.value)} />
            ))}
          </View>
        )}
        {def.help ? (
          <Text variant="small" tone="muted">
            {label(def.help)}
          </Text>
        ) : null}
      </View>
    )
  }

  return <NumberField def={def} value={Number(current)} onChange={onChange} />
})

const NumberField = ({ def, value, onChange }: { def: ParamDef; value: number; onChange: (key: string, value: ParamValue) => void }) => {
  const { colors } = useTheme()
  const { label } = useI18n()
  const step = def.step ?? 0.5
  const min = def.min ?? 0
  const max = def.max ?? Math.max(1000, value * 4)
  // Düzenlenirken yazılan metin; aksi halde değer gösterilir (effect ile senkron tutmaya gerek yok).
  const [draft, setDraft] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const text = draft ?? String(value)
  const setText = (next: string) => setDraft(next)
  // Kaydırıcı çok geniş aralıkta işe yaramaz; mantıklı bir pencere seç.
  const sliderMax = Math.min(max, Math.max(min + step * 20, def.autoWhenZero ? max : Math.max(Number(def.default) * 3, value * 1.5)))

  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'))
    setDraft(null)
    if (!Number.isFinite(n)) return
    onChange(def.key, round(Math.min(max, Math.max(min, n)), step))
  }

  const nudge = (dir: 1 | -1) => commit(String(round(value + dir * step * (step < 1 ? 2 : 1), step)))

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text variant="smallStrong" tone="soft" style={{ flex: 1 }} numberOfLines={2}>
          {label(def.label)}
        </Text>
        <View style={[styles.number, { backgroundColor: colors.surfaceAlt, borderColor: focused ? colors.ink : 'transparent' }]}>
          <ScalePressable accessibilityRole="button" accessibilityLabel="-" onPress={() => nudge(-1)} hitSlop={6} scaleTo={0.85} style={styles.step}>
            <Icon name="minus" size={14} color={colors.inkSoft} />
          </ScalePressable>
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              commit(text)
            }}
            onSubmitEditing={() => commit(text)}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={label(def.label)}
            style={[styles.input, { color: colors.ink }, { outlineStyle: 'none' } as object]}
          />
          {def.unit ? (
            <Text variant="small" tone="muted" style={{ marginRight: 2 }}>
              {def.unit}
            </Text>
          ) : null}
          <ScalePressable accessibilityRole="button" accessibilityLabel="+" onPress={() => nudge(1)} hitSlop={6} scaleTo={0.85} style={styles.step}>
            <Icon name="plus" size={14} color={colors.inkSoft} />
          </ScalePressable>
        </View>
      </View>
      <Slider
        value={Math.min(value, sliderMax)}
        min={min}
        max={sliderMax}
        step={step}
        onChange={(v) => setDraft(String(v))}
        onCommit={(v) => {
          setDraft(null)
          onChange(def.key, v)
        }}
        accessibilityLabel={label(def.label)}
      />
      {def.help ? (
        <Text variant="small" tone="muted">
          {label(def.help)}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 8, paddingVertical: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 4,
  },
  step: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  input: { width: 64, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 15, paddingVertical: 4 },
})
