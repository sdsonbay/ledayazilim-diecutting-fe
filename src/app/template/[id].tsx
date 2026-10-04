import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import Head from 'expo-router/head'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../auth/AuthContext'
import { ExportSheet } from '../../components/editor/ExportSheet'
import { ImposePanel } from '../../components/editor/ImposePanel'
import { ParamField, type ParamValue } from '../../components/editor/ParamField'
import { PrintPanel, type PrintArtwork } from '../../components/editor/PrintPanel'
import { Stage, type StageMode } from '../../components/editor/Stage'
import { materialKey } from '../../components/TemplateCard'
import { Badge, Button, EmptyState, IconButton, Input, Segmented, Skeleton, Text, useFeedback, useIsWide } from '../../components/ui'
import { defaultPrintTransform } from '../../fold/printDefaults'
import { useFavorites } from '../../hooks/useFavorites'
import { useImpose } from '../../hooks/useImpose'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import type { MessageKey } from '../../i18n/messages'
import { api } from '../../lib/api'
import { useUnit } from '../../lib/units'
import { defaultPrintFinish, type DielineResponse, type ParamDef, type PrintFinish, type PrintTransform } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

type PanelTab = 'params' | 'print' | 'impose'

const GROUP_LABEL: Record<string, MessageKey> = {
  dimensions: 'editor.groupDims',
  material: 'editor.groupMaterial',
  construction: 'editor.groupBuild',
  options: 'editor.groupOptions',
  prepress: 'editor.groupPress',
}

const defaultsOf = (params: ParamDef[]) => Object.fromEntries(params.map((p) => [p.key, p.default])) as Record<string, ParamValue>

/** Paylaşım bağlantısındaki `p` (yalnız varsayılandan farklı parametreler, JSON). */
const parseShared = (raw: string | undefined, params: ParamDef[]): Record<string, ParamValue> => {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, ParamValue> = {}
    for (const def of params) {
      const v = obj[def.key]
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[def.key] = v
    }
    return out
  } catch {
    return {}
  }
}

export default function EditorScreen() {
  const { id, saved, mode: modeParam, p: sharedParams } = useLocalSearchParams<{ id: string; saved?: string; mode?: string; p?: string }>()
  const { colors, scheme } = useTheme()
  const { t, label, locale } = useI18n()
  const { loggedIn, ready } = useAuth()
  const { toast } = useFeedback()
  const insets = useSafeAreaInsets()
  const wide = useIsWide()
  const { height } = useWindowDimensions()
  const favorites = useFavorites()
  const units = useUnit()

  const [values, setValues] = useState<Record<string, ParamValue>>({})
  const [mode, setMode] = useState<StageMode>(modeParam === '3d' || modeParam === 'impose' ? modeParam : '2d')
  const [tab, setTab] = useState<PanelTab>('params')
  const [artwork, setArtwork] = useState<PrintArtwork | null>(null)
  const [transform, setTransform] = useState<PrintTransform>(defaultPrintTransform())
  const [finish, setFinish] = useState<PrintFinish>(defaultPrintFinish())
  const [name, setName] = useState('')
  const [savedId, setSavedId] = useState<string | null>(saved ?? null)
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [dieline, setDieline] = useState<DielineResponse | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  const seq = useRef(0)

  const template = useQuery({ queryKey: ['template', id], queryFn: () => api.template(id), enabled: Boolean(id) })

  // Şablon (ve varsa kayıt) yüklenince başlangıç değerleri — sunucudan gelen veriyle
  // düzenlenebilir yerel durumu bir kez tohumlar.
  useEffect(() => {
    if (!template.data || !ready) return
    let cancelled = false
    const detail = template.data
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues({ ...defaultsOf(detail.params), ...(saved ? {} : parseShared(sharedParams, detail.params)) })
    setName(label(detail.name))
    setArtwork(null)
    setTransform(defaultPrintTransform())
    setFinish(defaultPrintFinish())
    if (saved && loggedIn) {
      void (async () => {
        try {
          const design = await api.getDesign(saved)
          if (cancelled) return
          if (design.templateId !== detail.id) {
            router.replace({ pathname: '/template/[id]', params: { id: design.templateId, saved: design.id } })
            return
          }
          setValues({ ...defaultsOf(detail.params), ...design.params })
          setName(design.name)
          setTransform(design.printTransform)
          setFinish(design.finishSettings ?? defaultPrintFinish())
          setSavedId(design.id)
          if (design.hasArtwork) {
            const uri = await api.designArtwork(design.id)
            if (!cancelled) setArtwork({ uri })
          }
        } catch (err) {
          if (!cancelled) toast(apiErrorMessage(err, locale, 'editor.loadFail', t), 'error')
        }
      })()
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.data, saved, loggedIn, ready])

  // Değerler değişince bıçak izini (kısa gecikmeyle) yeniden üret.
  useEffect(() => {
    if (!template.data || Object.keys(values).length === 0) return
    const my = ++seq.current
    const handle = setTimeout(() => {
      setDrawing(true)
      api
        .generate(template.data.id, values)
        .then((next) => {
          if (my !== seq.current) return
          setDieline(next)
          setDrawError(null)
        })
        .catch((err) => {
          if (my === seq.current) setDrawError(apiErrorMessage(err, locale, 'editor.drawFail', t))
        })
        .finally(() => {
          if (my === seq.current) setDrawing(false)
        })
    }, 200)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.data, values])

  const impose = useImpose({ enabled: mode === 'impose', dieline, templateId: template.data?.id, values, theme: scheme })

  const changeMode = (next: StageMode) => {
    setMode(next)
    if (next === 'impose') setTab('impose')
    else if (tab === 'impose') setTab('params')
  }

  const groups = useMemo(() => {
    const out: { id: string; params: ParamDef[] }[] = []
    for (const p of template.data?.params ?? []) {
      if (p.advanced) continue
      const gid = p.group ?? 'options'
      const last = out[out.length - 1]
      if (last && last.id === gid) last.params.push(p)
      else out.push({ id: gid, params: [p] })
    }
    return out
  }, [template.data])
  const advanced = useMemo(() => template.data?.params.filter((p) => p.advanced) ?? [], [template.data])

  const setParam = (key: string, value: ParamValue) => setValues((v) => (v[key] === value ? v : { ...v, [key]: value }))

  const save = async () => {
    if (!template.data) return
    if (!loggedIn) {
      router.push('/auth/login')
      return
    }
    setSaving(true)
    try {
      const row = await api.saveDesign({
        id: savedId ?? undefined,
        templateId: template.data.id,
        name,
        params: values,
        printTransform: transform,
        finishSettings: finish,
        artwork: artwork?.upload ?? null,
        clearArtwork: !artwork,
      })
      setSavedId(row.id)
      router.setParams({ saved: row.id })
      toast(t('editor.saved'), 'success', { label: t('nav.designs'), onPress: () => router.navigate('/designs') })
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'editor.saveFail', t), 'error')
    } finally {
      setSaving(false)
    }
  }

  const exportBody = () => (mode === 'impose' ? impose.exportBody() : { templateId: template.data?.id, variables: values })

  if (template.isError) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top + 40, paddingHorizontal: 20 }]}>
        <EmptyState
          icon="alert-triangle"
          title={t('editor.notFound')}
          body={apiErrorMessage(template.error, locale, 'editor.templateFail', t)}
          action={<Button label={t('notFound.home')} onPress={() => router.replace('/catalog')} />}
        />
      </View>
    )
  }

  const detail = template.data
  const favorited = detail ? favorites.ids.has(detail.id) : false

  const share = async () => {
    if (!detail) return
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => detail.params.find((p) => p.key === k)?.default !== v))
    const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://diecutting.ledayazilim.com'
    const qs = Object.keys(changed).length ? `?p=${encodeURIComponent(JSON.stringify(changed))}` : ''
    const url = `${origin}/template/${encodeURIComponent(detail.id)}${qs}`
    if (Platform.OS !== 'web') {
      await Share.share({ message: `${label(detail.name)} — ${url}`, url })
      return
    }
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }) : null
    if (nav?.share && wide === false) {
      await nav.share({ title: label(detail.name), url }).catch(() => undefined)
      return
    }
    await Clipboard.setStringAsync(url)
    toast(t('editor.linkCopied'), 'success')
  }


  const header = (
    <View style={[styles.header, wide ? null : { paddingTop: insets.top + 6 }]}>
      <IconButton icon="arrow-left" label={t('editor.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/catalog'))} variant="ghost" />
      <View style={{ flex: 1 }}>
        {detail ? (
          <Animated.View entering={FadeIn}>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[detail.code || detail.standard, label(detail.categoryLabel)].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="heading" numberOfLines={1}>
              {label(detail.name)}
            </Text>
          </Animated.View>
        ) : (
          <Skeleton width={180} height={18} />
        )}
      </View>
      {detail ? <IconButton icon="share-2" label={t('editor.shareLink')} onPress={() => void share()} variant="ghost" /> : null}
      {detail ? (
        <IconButton
          icon="heart"
          label={favorited ? t('catalog.favRemove') : t('catalog.favAdd')}
          onPress={() => favorites.toggle(detail.id)}
          active={favorited}
          variant="ghost"
        />
      ) : null}
    </View>
  )

  const panel = (
    <View style={{ gap: 18 }}>
      {detail ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 8 }}>
          <Text variant="body" tone="soft">
            {label(detail.description)}
          </Text>
          <View style={styles.badges}>
            {detail.materials.map((m) => (
              <Badge key={m} label={materialKey(m) ? t(materialKey(m) as MessageKey) : m} />
            ))}
            {detail.maturity === 'beta' ? <Badge label="beta" tone="warning" /> : null}
            {(detail.dct ?? []).slice(0, 2).map((d) => (
              <Badge key={d} label={`DCT ${d.replace(/^becf-/, '')}`} tone="accent" />
            ))}
          </View>
        </Animated.View>
      ) : null}

      <Segmented<PanelTab>
        value={tab}
        onChange={(next) => {
          setTab(next)
          if (next === 'impose') setMode('impose')
          else if (mode === 'impose') setMode('2d')
        }}
        options={[
          { value: 'params', label: t('editor.tabParams'), icon: 'sliders' },
          { value: 'print', label: t('editor.tabPrint'), icon: 'image' },
          { value: 'impose', label: t('editor.tabImpose'), icon: 'layout' },
        ]}
      />

      {drawError ? (
        <Text variant="small" tone="danger">
          {drawError}
        </Text>
      ) : null}

      {tab === 'params' ? (
        detail ? (
          <Animated.View key="params" entering={FadeIn.duration(200)} style={{ gap: 18 }}>
            <View style={styles.unitRow}>
              <Text variant="smallStrong" tone="soft">
                {t('editor.unit')}
              </Text>
              <View style={{ width: 150 }}>
                <Segmented
                  size="sm"
                  value={units.unit}
                  onChange={units.setUnit}
                  options={[
                    { value: 'mm', label: 'mm' },
                    { value: 'in', label: 'inch' },
                  ]}
                />
              </View>
            </View>
            {groups.map((group) => (
              <View key={group.id} style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Text variant="caption" tone="muted">
                  {t(GROUP_LABEL[group.id] ?? 'editor.groupOptions')}
                </Text>
                {group.params.map((p) => (
                  <ParamField key={p.key} def={p} value={values[p.key]} onChange={setParam} />
                ))}
              </View>
            ))}
            {advanced.length > 0 ? (
              <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Button
                  label={t('editor.advanced')}
                  variant="ghost"
                  size="sm"
                  iconRight={showAdvanced ? 'chevron-up' : 'chevron-down'}
                  onPress={() => setShowAdvanced((v) => !v)}
                />
                {showAdvanced
                  ? advanced.map((p) => <ParamField key={p.key} def={p} value={values[p.key]} onChange={setParam} />)
                  : null}
              </View>
            ) : null}
            <Button label={t('editor.reset')} variant="ghost" size="sm" icon="rotate-ccw" onPress={() => setValues(defaultsOf(detail.params))} />
          </Animated.View>
        ) : (
          <View style={{ gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={64} rounded={radius.lg} />
            ))}
          </View>
        )
      ) : tab === 'print' ? (
        <Animated.View key="print" entering={FadeIn.duration(200)}>
          <PrintPanel
            artwork={artwork}
            transform={transform}
            finish={finish}
            bounds={dieline?.bounds}
            onArtwork={setArtwork}
            onTransform={setTransform}
            onFinish={setFinish}
          />
        </Animated.View>
      ) : (
        <Animated.View key="impose" entering={FadeIn.duration(200)}>
          <ImposePanel impose={impose} />
        </Animated.View>
      )}

      <View style={[styles.saveBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text variant="caption" tone="muted">
          {t('editor.saveSheetTitle')}
        </Text>
        <Input value={name} onChangeText={setName} maxLength={80} placeholder={t('editor.saveName')} accessibilityLabel={t('editor.saveName')} />
        <Button label={saving ? t('editor.saving') : t('editor.save')} icon="bookmark" onPress={() => void save()} loading={saving} full />
        <Text variant="small" tone="muted">
          {t('editor.saveHelp')}
          {loggedIn ? '' : t('editor.saveLogin')}
        </Text>
      </View>
    </View>
  )

  const stage = (
    <Stage
      key={template.data?.id ?? 'loading'}
      dieline={dieline}
      mode={mode}
      onMode={changeMode}
      busy={drawing}
      printUri={artwork?.uri}
      printTransform={transform}
      printFinish={finish}
      impose={impose}
      onExport={() => setExportOpen(true)}
      defaultSubstrate={template.data?.materials[0] === 'corrugated' ? 'corrugated' : 'white'}
      style={wide ? { flex: 1 } : { height: Math.max(320, Math.min(height * 0.5, 520)) }}
    />
  )

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {detail ? (
        <Head>
          <title>{`${label(detail.name)} · Leda Diecutting`}</title>
          <meta name="description" content={label(detail.description)} />
        </Head>
      ) : null}
      {wide ? (
        <View style={[styles.fill, styles.wideRow]}>
          <View style={[styles.fill, { padding: 20, paddingRight: 0, gap: 12 }]}>
            {header}
            {stage}
          </View>
          <ScrollView style={styles.side} contentContainerStyle={{ padding: 20, paddingTop: 76, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {panel}
          </ScrollView>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
            stickyHeaderIndices={[0]}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ backgroundColor: colors.bg }}>{header}</View>
            <View style={{ paddingHorizontal: 14 }}>{stage}</View>
            <View style={{ padding: 20 }}>{panel}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} body={exportBody} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wideRow: { flexDirection: 'row' },
  side: { width: 420, flexGrow: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.lg, padding: 16, gap: 4 },
  saveBox: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.lg, padding: 16, gap: 10 },
})
