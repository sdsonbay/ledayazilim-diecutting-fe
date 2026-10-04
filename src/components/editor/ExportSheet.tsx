import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../auth/AuthContext'
import { useExport, type ExportBody } from '../../hooks/useExport'
import { useI18n } from '../../i18n/LocaleContext'
import type { ExportFormat } from '../../lib/api'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Icon, ScalePressable, Text, type IconName } from '../ui'

const FORMATS: { id: ExportFormat; icon: IconName; hint: 'editor.pdfHint' | 'editor.dxfHint' | 'editor.svgHint' }[] = [
  { id: 'pdf', icon: 'file-text', hint: 'editor.pdfHint' },
  { id: 'dxf', icon: 'scissors', hint: 'editor.dxfHint' },
  { id: 'svg', icon: 'pen-tool', hint: 'editor.svgHint' },
]

/** Alttan açılan indirme sayfası (geniş ekranda ortada kart). */
export const ExportSheet = ({ visible, onClose, body }: { visible: boolean; onClose: () => void; body: () => ExportBody }) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const { session } = useAuth()
  const insets = useSafeAreaInsets()
  const exporter = useExport()

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View style={styles.root}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.springify().damping(22).stiffness(200)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheet, { backgroundColor: colors.elevated, paddingBottom: insets.bottom + 20 }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
            <Text variant="title">{t('editor.exportTitle')}</Text>
            <Text variant="small" tone="muted">
              {t('editor.exportLead', { n: session?.credits ?? 0 })}
            </Text>
            <View style={{ gap: 10, marginTop: 6 }}>
              {FORMATS.map((f) => (
                <ScalePressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={f.id.toUpperCase()}
                  onPress={async () => {
                    const ok = await exporter.run(f.id, body())
                    if (ok) onClose()
                  }}
                  disabled={Boolean(exporter.busy)}
                  haptic
                  hoverLift
                  style={[styles.format, { backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.formatIcon, { backgroundColor: colors.surface }]}>
                    <Icon name={f.icon} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">{f.id.toUpperCase()}</Text>
                    <Text variant="small" tone="muted">
                      {t(f.hint)}
                    </Text>
                  </View>
                  {exporter.busy === f.id ? <ActivityIndicator color={colors.ink} /> : <Icon name="download" size={18} color={colors.muted} />}
                </ScalePressable>
              ))}
            </View>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 22,
    gap: 6,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 10 },
  format: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg },
  formatIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
