import * as DocumentPicker from 'expo-document-picker'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { api } from '../lib/api'
import type { DielineResponse } from '../lib/types'
import { useTheme } from '../theme/ThemeContext'
import { radius } from '../theme/tokens'
import { Button, Icon, ScalePressable, Text, useFeedback } from './ui'

/** Dosyadan bıçak izi: SVG / DXF / PDF / PNG / JPG → panel ve kırımlar. */
export const ImportDrop = ({ onDieline, busy, setBusy }: { onDieline: (d: DielineResponse) => void; busy: boolean; setBusy: (b: boolean) => void }) => {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const { toast } = useFeedback()
  const [file, setFile] = useState<{ name: string; stats: string } | null>(null)

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
      onDieline(next)
      setFile({
        name: asset.name,
        stats: t('import.stats', {
          panels: next.panels.length,
          folds: next.folds.length,
          w: next.stats.flatWidth.toFixed(0),
          h: next.stats.flatHeight.toFixed(0),
        }),
      })
    } catch (err) {
      toast(apiErrorMessage(err, locale, 'import.fail', t), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Text variant="small" tone="muted">
        {t('import.lead')}
      </Text>
      {file ? (
        <View style={[styles.file, { backgroundColor: colors.surfaceAlt }]}>
          <Icon name="file" size={18} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {file.name}
            </Text>
            <Text variant="small" tone="muted">
              {file.stats}
            </Text>
          </View>
          <Button label={t('import.again')} size="sm" variant="outline" onPress={() => void pick()} loading={busy} />
        </View>
      ) : (
        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel={t('import.pick')}
          onPress={() => void pick()}
          hoverLift
          haptic
          style={[styles.drop, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}
        >
          <View style={[styles.dropIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name="upload-cloud" size={24} color={colors.accent} />
          </View>
          <Text variant="heading" align="center">
            {busy ? t('import.reading') : t('import.pick')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t('import.formats')}
          </Text>
        </ScalePressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  drop: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.xl, paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  dropIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg },
})
