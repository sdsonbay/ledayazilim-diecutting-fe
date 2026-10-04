import * as DocumentPicker from 'expo-document-picker'
import { useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { ExportSheet } from '../../components/editor/ExportSheet'
import { ImposePanel } from '../../components/editor/ImposePanel'
import { Stage, type StageMode } from '../../components/editor/Stage'
import { Button, Icon, Page, PageHeader, ScalePressable, Text, useFeedback, useIsWide } from '../../components/ui'
import { useImpose } from '../../hooks/useImpose'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import { api } from '../../lib/api'
import { slimDieline } from '../../lib/impose'
import type { DielineResponse } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

export default function ImportScreen() {
  const { colors, scheme } = useTheme()
  const { t, locale } = useI18n()
  const { toast } = useFeedback()
  const wide = useIsWide()
  const { height } = useWindowDimensions()
  const [dieline, setDieline] = useState<DielineResponse | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<StageMode>('2d')
  const [exportOpen, setExportOpen] = useState(false)
  const impose = useImpose({ enabled: mode === 'impose', dieline, templateId: dieline?.templateId, theme: scheme })

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/svg+xml', 'application/pdf', 'image/png', 'image/jpeg', 'application/dxf', 'image/vnd.dxf', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    const asset = result.canceled ? null : result.assets[0]
    if (!asset) return
    setBusy(true)
    try {
      const next = await api.importDieline({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: asset.file })
      setDieline(next)
      setFileName(asset.name)
      setMode('2d')
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'import.fail', t), 'error')
    } finally {
      setBusy(false)
    }
  }

  const dropzone = (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={t('import.pick')}
      onPress={() => void pick()}
      hoverLift
      haptic
      style={[styles.drop, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}
    >
      <View style={[styles.dropIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name="upload-cloud" size={26} color={colors.accent} />
      </View>
      <Text variant="title" align="center">
        {busy ? t('import.reading') : t('import.pick')}
      </Text>
      <Text variant="small" tone="muted" align="center">
        {t('import.formats')}
      </Text>
    </ScalePressable>
  )

  return (
    <Page>
      <PageHeader
        kicker={t('tab.import')}
        title={t('import.title')}
        lead={t('import.lead')}
        right={dieline ? <Button label={t('import.again')} variant="outline" icon="upload" onPress={() => void pick()} loading={busy} /> : undefined}
      />
      {dieline ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} style={{ gap: 16 }}>
          <Text variant="smallStrong" tone="soft">
            {fileName} ·{' '}
            {t('import.stats', {
              panels: dieline.panels.length,
              folds: dieline.folds.length,
              w: dieline.stats.flatWidth.toFixed(0),
              h: dieline.stats.flatHeight.toFixed(0),
            })}
          </Text>
          <View style={wide ? { flexDirection: 'row', gap: 20 } : { gap: 20 }}>
            <Stage
              dieline={dieline}
              mode={mode}
              onMode={setMode}
              busy={busy}
              impose={impose}
              onExport={() => setExportOpen(true)}
              style={wide ? { flex: 1, height: Math.min(height - 260, 720) } : { height: Math.max(340, height * 0.5) }}
            />
            {mode === 'impose' ? (
              <View style={wide ? { width: 380 } : null}>
                <ImposePanel impose={impose} />
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(80).springify().damping(20)}>{dropzone}</Animated.View>
      )}
      <ExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        body={() => (mode === 'impose' ? impose.exportBody() : { dieline: dieline ? slimDieline(dieline) : undefined })}
      />
    </Page>
  )
}

const styles = StyleSheet.create({
  drop: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    paddingVertical: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  dropIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
})
