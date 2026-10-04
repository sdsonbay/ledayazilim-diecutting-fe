import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { ExportSheet } from '../../components/editor/ExportSheet'
import { ImportDrop } from '../../components/ImportDrop'
import { ImposePanel } from '../../components/editor/ImposePanel'
import { Stage, type StageMode } from '../../components/editor/Stage'
import { Button, Chip, IconButton, Input, Page, PageHeader, SectionTitle, Segmented, Text, Toggle, useFeedback, useIsWide, type IconName } from '../../components/ui'
import { useImpose } from '../../hooks/useImpose'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import type { MessageKey } from '../../i18n/messages'
import { api } from '../../lib/api'
import { slimDieline } from '../../lib/impose'
import type { DielineResponse } from '../../lib/types'
import { DrawCanvas } from '../../studio/DrawCanvas'
import { openTrayStrokes, strokesToSvg, type DrawTool, type Stroke } from '../../studio/drawGeometry'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

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

const TOOLS: { id: DrawTool; icon: IconName; label: MessageKey }[] = [
  { id: 'cut', icon: 'scissors', label: 'studio.toolCut' },
  { id: 'crease', icon: 'minus', label: 'studio.toolCrease' },
  { id: 'rect', icon: 'square', label: 'studio.toolRect' },
  { id: 'roundrect', icon: 'credit-card', label: 'studio.toolRoundRect' },
  { id: 'oval', icon: 'circle', label: 'studio.toolOval' },
  { id: 'hole', icon: 'target', label: 'studio.toolHole' },
  { id: 'poly', icon: 'hexagon', label: 'studio.toolPoly' },
  { id: 'select', icon: 'mouse-pointer', label: 'studio.toolSelect' },
]

export default function StudioScreen() {
  const { colors, scheme } = useTheme()
  const { t, locale } = useI18n()
  const { toast, confirm } = useFeedback()
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
  // Çizim
  const [strokes, setStrokes] = useState<Stroke[]>(() => openTrayStrokes(120, 80, 40))
  const [tool, setTool] = useState<DrawTool>('cut')
  const [grid, setGrid] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const undo = useRef<Stroke[][]>([])
  const redo = useRef<Stroke[][]>([])
  const [, force] = useState(0)
  const [drawing, setDrawing] = useState(false)

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

  const commit = (next: Stroke[]) => {
    undo.current.push(strokes)
    if (undo.current.length > 80) undo.current.shift()
    redo.current = []
    setStrokes(next)
  }
  const doUndo = () => {
    const prev = undo.current.pop()
    if (!prev) return
    redo.current.push(strokes)
    setStrokes(prev)
    setSelected(null)
    force((n) => n + 1)
  }
  const doRedo = () => {
    const next = redo.current.pop()
    if (!next) return
    undo.current.push(strokes)
    setStrokes(next)
    force((n) => n + 1)
  }

  const convert = async () => {
    if (strokes.length === 0) {
      toast(t('studio.empty'), 'error')
      return
    }
    setBusy(true)
    try {
      setDieline(await api.importSvg(strokesToSvg(strokes)))
      setMode('2d')
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'import.fail', t), 'error')
    } finally {
      setBusy(false)
    }
  }

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
        <ImportDrop
          busy={busy}
          setBusy={setBusy}
          onDieline={(d) => {
            setDieline(d)
            setMode('2d')
          }}
        />
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
        <View style={styles.wrap}>
          {TOOLS.map((tl) => (
            <Chip key={tl.id} label={t(tl.label)} icon={tl.icon} selected={tool === tl.id} onPress={() => setTool(tl.id)} />
          ))}
        </View>
        <View style={[styles.canvas, { height: wide ? Math.min(height - 360, 560) : 300, borderColor: colors.line }]}>
          <DrawCanvas
            strokes={strokes}
            onCommit={commit}
            tool={tool}
            grid={grid}
            cornerRadius={12}
            polySides={6}
            selectedId={selected}
            onSelect={setSelected}
            onInteract={setDrawing}
          />
        </View>
        <View style={styles.toolbar}>
          <IconButton icon="corner-up-left" label={t('studio.undo')} onPress={doUndo} />
          <IconButton icon="corner-up-right" label={t('studio.redo')} onPress={doRedo} />
          <IconButton
            icon="trash-2"
            label={t('studio.toolDelete')}
            onPress={() => {
              if (!selected) return
              commit(strokes.filter((s) => s.id !== selected))
              setSelected(null)
            }}
          />
          <IconButton
            icon="x-square"
            label={t('studio.clear')}
            onPress={async () => {
              const ok = await confirm({ title: t('studio.clearConfirm'), confirmLabel: t('studio.clear'), cancelLabel: t('common.cancel'), destructive: true })
              if (ok) commit([])
            }}
          />
          <View style={{ flex: 1 }} />
          <Toggle value={grid} onChange={setGrid} label={t('studio.snap')} />
        </View>
        <Text variant="small" tone="muted">
          {t(`studio.hint${tool === 'cut' ? 'Cut' : tool === 'crease' ? 'Crease' : tool === 'select' ? 'Select' : tool === 'hole' ? 'Hole' : tool === 'poly' ? 'Poly' : 'Shape'}` as MessageKey)}
        </Text>
        <View style={styles.row}>
          <Button label={t('studio.addTray')} variant="outline" icon="plus-square" onPress={() => commit([...strokes, ...openTrayStrokes(dims.length, dims.width, dims.height)])} />
          <Button label={busy ? t('studio.building') : t('studio.to3d')} icon="box" onPress={() => void convert()} loading={busy} />
        </View>
      </Animated.View>
    )

  const stage = (
    <Stage
      dieline={dieline}
      mode={mode}
      onMode={setMode}
      busy={busy}
      impose={impose}
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
          }}
          options={[
            { value: 'param', label: t('studio.modeParam'), icon: 'package' },
            { value: 'draw', label: t('studio.modeDraw'), icon: 'edit-3' },
            { value: 'file', label: t('studio.modeFile'), icon: 'upload' },
          ]}
        />
      </View>
      <View style={wide ? styles.wideRow : { gap: 24 }}>
        <Animated.View entering={FadeInDown.springify().damping(20)} style={wide ? { width: source === 'draw' ? '52%' : 380, gap: 16 } : { gap: 16 }}>
          {controls}
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
  canvas: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
})
