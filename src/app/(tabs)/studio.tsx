import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { ExportSheet } from '../../components/editor/ExportSheet'
import { ImportDrop } from '../../components/ImportDrop'
import { ImposePanel } from '../../components/editor/ImposePanel'
import { Stage, type StageMode } from '../../components/editor/Stage'
import { ImportResult } from '../../components/studio/ImportResult'
import { Chip, Input, Page, PageHeader, SectionTitle, Segmented, Text, useFeedback, useIsWide } from '../../components/ui'
import { useImpose } from '../../hooks/useImpose'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import type { MessageKey } from '../../i18n/messages'
import { api } from '../../lib/api'
import { slimDieline } from '../../lib/impose'
import type { DielineResponse, Point } from '../../lib/types'
import { DrawEditor, type DrawStarter } from '../../studio/DrawEditor'
import { openTray, shapesFromDieline } from '../../studio/drawDoc'
import { useTheme } from '../../theme/ThemeContext'

type Family = 'tuck' | 'straight' | 'tray' | 'sleeve' | 'hex' | 'auto' | 'snap' | 'tube'

const FAMILIES: Family[] = ['tuck', 'straight', 'tray', 'sleeve', 'hex', 'auto', 'snap', 'tube']

const templateOf = (family: Family, sides: number): string => {
  if (family === 'tuck') return 'ecma-a20-20'
  if (family === 'straight') return 'ecma-a20-21'
  if (family === 'tray') return 'tray-4corner-glued'
  if (family === 'sleeve') return 'sleeve-4panel'
  if (family === 'hex') return 'tray-hex'
  if (family === 'auto') return 'ecma-a21-20'
  if (family === 'snap') return 'ecma-a20-80'
  if (sides <= 3) return 'tube-triangle'
  if (sides === 5) return 'tube-pentagon'
  if (sides >= 8) return 'tube-octagon'
  return 'tube-hex'
}

export default function StudioScreen() {
  const { scheme } = useTheme()
  const { t, locale } = useI18n()
  const { toast } = useFeedback()
  const wide = useIsWide()
  const { height } = useWindowDimensions()
  const params = useLocalSearchParams<{ source?: string }>()
  const [source, setSource] = useState<'param' | 'draw' | 'file'>(params.source === 'file' ? 'file' : params.source === 'draw' ? 'draw' : 'param')
  const [family, setFamily] = useState<Family>('tuck')
  const [sides, setSides] = useState(6)
  const [dims, setDims] = useState({ length: 120, width: 80, height: 40 })
  const [dieline, setDieline] = useState<DielineResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<StageMode>('2d')
  const [exportOpen, setExportOpen] = useState(false)
  const [drawing, setDrawing] = useState(false)
  // İçe aktarılan / çizilen modelin ilk hali (düzenlemeleri geri almak için) ve tanınan şablon.
  const [imported, setImported] = useState<DielineResponse | null>(null)
  const [highlight, setHighlight] = useState<[Point, Point] | null>(null)

  const templateId = templateOf(family, sides)
  const variables: Record<string, unknown> =
    family === 'hex' ? { height: dims.height, width: dims.length } : family === 'tube' ? { height: dims.height, diameter: dims.length } : dims
  const impose = useImpose({
    enabled: mode === 'impose',
    dieline,
    templateId: source === 'param' ? templateId : undefined,
    values: source === 'param' ? variables : undefined,
    theme: scheme,
  })

  // Hazır model: değerler değişince yeniden üret.
  useEffect(() => {
    if (source !== 'param') return
    const handle = setTimeout(() => {
      setBusy(true)
      api
        .generate(templateId, variables)
        .then(setDieline)
        .catch((err) => toast(apiErrorMessage(err, locale, 'editor.drawFail', t), 'error'))
        .finally(() => setBusy(false))
    }, 260)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, templateId, dims.length, dims.width, dims.height])

  const acceptImport = (d: DielineResponse) => {
    setImported(d)
    setDieline(d)
    setHighlight(null)
    setMode('2d')
  }

  const convert = async (svg: string) => {
    setBusy(true)
    try {
      acceptImport(await api.importSvg(svg))
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'import.fail', t), 'error')
    } finally {
      setBusy(false)
    }
  }

  const fromTemplate = async (id: string, vars: Record<string, unknown>) => {
    try {
      return shapesFromDieline(await api.generate(id, vars))
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'editor.drawFail', t), 'error')
      return null
    }
  }
  const starters: DrawStarter[] = [
    { id: 'tray', label: t('draw.start.tray'), icon: 'inbox', load: () => Promise.resolve(openTray(dims.length, dims.width, dims.height)) },
    { id: 'tuck', label: t('draw.start.tuck'), icon: 'package', load: () => fromTemplate('ecma-a20-20', dims) },
    { id: 'mailer', label: t('draw.start.mailer'), icon: 'archive', load: () => fromTemplate('fefco-0427', dims) },
  ]

  const importPanel =
    imported && dieline && source !== 'param' ? (
      <ImportResult original={imported} dieline={dieline} match={imported.match} onChange={setDieline} onHighlight={setHighlight} />
    ) : null

  const dimInput = (key: 'length' | 'width' | 'height', label: string) => (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Input
        label={label}
        defaultValue={String(dims[key])}
        key={`${key}-${dims[key]}`}
        keyboardType="decimal-pad"
        suffix="mm"
        onEndEditing={(e) => setNum(key, e.nativeEvent.text)}
        onSubmitEditing={(e) => setNum(key, e.nativeEvent.text)}
        onBlur={(e) => {
          const text = (e.target as unknown as { value?: string })?.value
          if (typeof text === 'string') setNum(key, text)
        }}
      />
    </View>
  )
  const setNum = (key: 'length' | 'width' | 'height', raw: string) => {
    const n = Number(raw.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) setDims((d) => (d[key] === n ? d : { ...d, [key]: Math.min(2000, n) }))
  }

  const controls =
    source === 'file' ? (
      <Animated.View key="file" entering={FadeIn.duration(200)}>
        <ImportDrop busy={busy} setBusy={setBusy} onDieline={acceptImport} />
      </Animated.View>
    ) : source === 'param' ? (
      <Animated.View key="param" entering={FadeIn.duration(200)} style={{ gap: 16 }}>
        <SectionTitle title={t('studio.family')} />
        <View style={styles.wrap}>
          {FAMILIES.map((f) => (
            <Chip key={f} label={t(`studio.family.${f}` as MessageKey)} selected={family === f} onPress={() => setFamily(f)} />
          ))}
        </View>
        {family === 'tube' ? (
          <View style={{ gap: 8 }}>
            <Text variant="smallStrong" tone="soft">
              {t('studio.sides')}
            </Text>
            <Segmented
              size="sm"
              value={String(sides)}
              onChange={(v) => setSides(Number(v))}
              options={[3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </View>
        ) : null}
        <View style={styles.row}>
          {dimInput('length', family === 'tube' || family === 'hex' ? t('studio.diameter') : t('studio.length'))}
          {family === 'tube' || family === 'hex' ? null : dimInput('width', t('studio.width'))}
          {dimInput('height', t('studio.height'))}
        </View>
      </Animated.View>
    ) : (
      <Animated.View key="draw" entering={FadeIn.duration(200)} style={{ gap: 12 }}>
        <DrawEditor
          onConvert={(svg) => void convert(svg)}
          converting={busy}
          starters={starters}
          onInteract={setDrawing}
          height={wide ? Math.max(420, Math.min(height - 380, 620)) : 380}
        />
      </Animated.View>
    )

  const stage = (
    <Stage
      dieline={dieline}
      mode={mode}
      onMode={setMode}
      busy={busy}
      impose={impose}
      highlight={highlight}
      onExport={() => setExportOpen(true)}
      style={wide ? { flex: 1, minHeight: 520 } : { height: Math.max(340, height * 0.48) }}
      empty={
        <View style={styles.empty}>
          <Text variant="heading" align="center">
            {t('studio.needDraw')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('studio.needDrawBody')}
          </Text>
        </View>
      }
    />
  )

  return (
    <Page scrollEnabled={!drawing}>
      <PageHeader kicker={t('tab.studio')} title={t('studio.title')} lead={t('studio.leadShort')} />
      <View style={{ maxWidth: 520, marginBottom: 20 }}>
        <Segmented
          value={source}
          onChange={(v) => {
            setSource(v)
            setDieline(null)
            setImported(null)
            setHighlight(null)
          }}
          options={[
            { value: 'param', label: t('studio.modeParam'), icon: 'package' },
            { value: 'draw', label: t('studio.modeDraw'), icon: 'edit-3' },
            { value: 'file', label: t('studio.modeFile'), icon: 'upload' },
          ]}
        />
      </View>
      <View style={wide ? styles.wideRow : { gap: 24 }}>
        <Animated.View entering={FadeInDown.springify().damping(20)} style={wide ? { width: source === 'draw' ? '58%' : 400, gap: 16 } : { gap: 16 }}>
          {controls}
          {importPanel}
          {mode === 'impose' ? <ImposePanel impose={impose} /> : null}
        </Animated.View>
        <View style={wide ? { flex: 1 } : null}>
          <SectionTitle title={t('studio.result')} />
          {stage}
        </View>
      </View>
      <ExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        body={() =>
          mode === 'impose'
            ? impose.exportBody()
            : source === 'param'
              ? { templateId, variables }
              : { dieline: dieline ? slimDieline(dieline) : undefined }
        }
      />
    </Page>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wideRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
})
