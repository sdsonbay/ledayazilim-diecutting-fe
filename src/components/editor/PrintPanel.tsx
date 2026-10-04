import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { defaultPrintTransform } from '../../fold/printDefaults'
import { useI18n } from '../../i18n/LocaleContext'
import type { LocalFile } from '../../lib/api'
import { centerPrint, coverPrint, fitPrint, normalizeAngle, resetPrint, printSize, SCALE_MAX, SCALE_MIN, withPrintWidth, withScale } from '../../lib/printMap'
import { defaultPrintFinish, type PrintFinish, type PrintTransform } from '../../lib/types'
import { useUnit } from '../../lib/units'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Button, Divider, Icon, NumberBox, ScalePressable, SectionTitle, Slider, Text, Toggle, type IconName } from '../ui'

export interface PrintArtwork {
  /** Görüntüleme URI'si (file://, blob:, data:). */
  uri: string
  /** Kaydederken yüklenecek dosya; kayıttan geldiyse yok. */
  upload?: LocalFile
}

const FOILS = ['#C9A227', '#C0C0C8', '#B87333', '#E8B4B8', '#1F1F1F']

export const PrintPanel = ({
  artwork,
  transform,
  finish,
  bounds,
  onArtwork,
  onTransform,
  onFinish,
}: {
  artwork: PrintArtwork | null
  transform: PrintTransform
  finish: PrintFinish
  bounds?: { width: number; height: number }
  onArtwork: (next: PrintArtwork | null) => void
  onTransform: (next: PrintTransform) => void
  onFinish: (next: PrintFinish) => void
}) => {
  const { t } = useI18n()
  const { colors } = useTheme()
  const units = useUnit()
  const [picking, setPicking] = useState(false)
  const box = bounds ?? { width: 200, height: 200 }
  const span = Math.max(box.width, box.height)
  const size = printSize(box, transform)
  const fromUnit = (v: number) => units.fromDisplay(v)
  const toUnit = (mm: number) => Number(units.toDisplay(mm).toFixed(units.unit === 'in' ? 2 : 1))

  const pick = async () => {
    setPicking(true)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false })
      const asset = result.canceled ? null : result.assets[0]
      if (!asset) return
      const mime = asset.mimeType ?? 'image/jpeg'
      const name = asset.fileName ?? `artwork.${mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'}`
      onArtwork({ uri: asset.uri, upload: { uri: asset.uri, name, mimeType: mime, file: asset.file } })
      // Görsel oranı korunur: ilk yerleşim bıçak izinin içine sığdırılmış ve ortalanmış.
      const aspect = asset.width > 0 && asset.height > 0 ? asset.width / asset.height : undefined
      onTransform({ ...defaultPrintTransform(), aspect })
    } finally {
      setPicking(false)
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Text variant="small" tone="muted">
        {t('editor.printHelp')}
      </Text>
      {artwork ? (
        <Animated.View entering={FadeIn} style={[styles.thumbRow, { backgroundColor: colors.surfaceAlt }]}>
          <Image source={{ uri: artwork.uri }} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1, gap: 8 }}>
            <Button label={t('editor.printChange')} variant="outline" size="sm" icon="image" onPress={() => void pick()} loading={picking} />
            <Button label={t('editor.printClear')} variant="ghost" size="sm" icon="trash-2" onPress={() => onArtwork(null)} />
          </View>
        </Animated.View>
      ) : (
        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel={t('editor.printUpload')}
          onPress={() => void pick()}
          hoverLift
          style={[styles.drop, { borderColor: colors.lineStrong }]}
        >
          <Text variant="heading">{picking ? t('editor.printPreparing') : t('editor.printUpload')}</Text>
          <Text variant="small" tone="muted">
            PNG · JPG · WebP
          </Text>
        </ScalePressable>
      )}

      {artwork ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 6 }}>
          <Text variant="small" tone="muted">
            {t('editor.printCanvasHint')}
          </Text>
          <View style={styles.actions}>
            <Action icon="minimize-2" label={t('editor.printFit')} onPress={() => onTransform(fitPrint(box, transform))} />
            <Action icon="maximize-2" label={t('editor.printCover')} onPress={() => onTransform(coverPrint(box, transform))} />
            <Action icon="crosshair" label={t('editor.printCenter')} onPress={() => onTransform(centerPrint(transform))} />
            <Action icon="rotate-cw" label="90°" onPress={() => onTransform({ ...transform, rotation: normalizeAngle(Math.round(transform.rotation / 90) * 90 + 90) })} />
          </View>
          <View style={styles.grid}>
            <NumberBox label={t('editor.printWidth')} unit={units.label} value={toUnit(size.width)} onCommit={(v) => {
                if (v > 0) onTransform(withPrintWidth(box, transform, fromUnit(v)))
              }} />
            <NumberBox
              label={t('editor.printHeight')}
              unit={units.label}
              value={toUnit(size.height)}
              onCommit={(v) => {
                if (v > 0) onTransform(withPrintWidth(box, transform, (fromUnit(v) * size.width) / Math.max(size.height, 1e-6)))
              }}
            />
            <NumberBox label={t('editor.offsetX')} unit={units.label} value={toUnit(transform.offsetX)} onCommit={(v) => onTransform({ ...transform, offsetX: clamp(fromUnit(v), span) })} />
            <NumberBox label={t('editor.offsetY')} unit={units.label} value={toUnit(transform.offsetY)} onCommit={(v) => onTransform({ ...transform, offsetY: clamp(fromUnit(v), span) })} />
          </View>
          <Range
            label={t('editor.scale')}
            value={transform.scale}
            min={SCALE_MIN}
            max={Math.min(SCALE_MAX, 4)}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onTransform(withScale(transform, v))}
          />
          <Range label={t('editor.rotate')} value={transform.rotation} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => onTransform({ ...transform, rotation: v })} />

          <Divider />
          <SectionTitle title={t('editor.finishTitle')} />
          <Toggle label={t('editor.finishFoil')} value={finish.foil.enabled} onChange={(v) => onFinish({ ...finish, foil: { ...finish.foil, enabled: v } })} />
          {finish.foil.enabled ? (
            <Animated.View entering={FadeInDown} style={{ gap: 8 }}>
              <View style={styles.swatches}>
                {FOILS.map((c) => (
                  <ScalePressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={c}
                    onPress={() => onFinish({ ...finish, foil: { ...finish.foil, color: c } })}
                    scaleTo={0.85}
                    style={[styles.swatch, { backgroundColor: c, borderColor: finish.foil.color === c ? colors.ink : colors.line }]}
                  />
                ))}
              </View>
              <Range label={t('editor.finishIntensity')} value={finish.foil.intensity} min={0} max={1} step={0.01} format={pct} onChange={(v) => onFinish({ ...finish, foil: { ...finish.foil, intensity: v } })} />
            </Animated.View>
          ) : null}
          <Toggle label={t('editor.finishEmboss')} value={finish.emboss.enabled} onChange={(v) => onFinish({ ...finish, emboss: { ...finish.emboss, enabled: v } })} />
          {finish.emboss.enabled ? (
            <Range label={t('editor.finishEmbossDepth')} value={finish.emboss.depth} min={0} max={1} step={0.01} format={pct} onChange={(v) => onFinish({ ...finish, emboss: { ...finish.emboss, depth: v } })} />
          ) : null}
          <Toggle label={t('editor.finishVarnish')} value={finish.varnish.enabled} onChange={(v) => onFinish({ ...finish, varnish: { ...finish.varnish, enabled: v } })} />
          {finish.varnish.enabled ? (
            <Range label={t('editor.finishVarnishGloss')} value={finish.varnish.gloss} min={0} max={1} step={0.01} format={pct} onChange={(v) => onFinish({ ...finish, varnish: { ...finish.varnish, gloss: v } })} />
          ) : null}
          {Platform.OS !== 'web' ? (
            <Text variant="small" tone="muted">
              {t('editor.printNative')}
            </Text>
          ) : null}
          <Button label={t('editor.reset')} variant="ghost" size="sm" icon="rotate-ccw" onPress={() => { onTransform(resetPrint(transform)); onFinish(defaultPrintFinish()) }} />
        </Animated.View>
      ) : null}
    </View>
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v))

const Action = ({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) => {
  const { colors } = useTheme()
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} haptic scaleTo={0.94} style={[styles.action, { backgroundColor: colors.surfaceAlt }]}>
      <Icon name={icon} size={14} color={colors.ink} />
      <Text variant="smallStrong" numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  )
}

const Range = ({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) => (
  <View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="smallStrong" tone="soft">
        {label}
      </Text>
      <Text variant="mono" tone="muted">
        {format(value)}
      </Text>
    </View>
    <Slider value={value} min={min} max={max} step={step} onChange={onChange} accessibilityLabel={label} />
  </View>
)

const styles = StyleSheet.create({
  drop: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 4,
  },
  thumbRow: { flexDirection: 'row', gap: 14, padding: 12, borderRadius: radius.lg, alignItems: 'center' },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  swatches: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
})
