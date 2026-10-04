import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutUp, LinearTransition, ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

type ToastTone = 'neutral' | 'success' | 'error'

interface Toast {
  id: number
  message: string
  tone: ToastTone
  action?: { label: string; onPress: () => void }
}

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
}

interface FeedbackValue {
  toast: (message: string, tone?: ToastTone, action?: Toast['action']) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackValue | null>(null)

const TONE_ICON: Record<ToastTone, IconName> = { neutral: 'info', success: 'check-circle', error: 'alert-circle' }

/** Toast'lar ve onay diyaloğu — RN Alert web'de çalışmadığı için kendi bileşenimiz. */
export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const seq = useRef(0)

  const toast = useCallback<FeedbackValue['toast']>((message, tone = 'neutral', action) => {
    const id = ++seq.current
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(
        tone === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      )
    }
    setToasts((list) => [...list.slice(-2), { id, message, tone, action }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), action ? 5200 : 3200)
  }, [])

  const confirm = useCallback<FeedbackValue['confirm']>(
    (options) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  )

  const close = (ok: boolean) => {
    dialog?.resolve(ok)
    setDialog(null)
  }

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 10, alignItems: 'center' }]}>
        {toasts.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(180)}
            layout={LinearTransition.springify()}
            style={[styles.toast, { backgroundColor: colors.primary, shadowColor: colors.shadow }]}
          >
            <Icon
              name={TONE_ICON[t.tone]}
              size={16}
              color={t.tone === 'error' ? colors.danger : t.tone === 'success' ? colors.success : colors.onPrimary}
            />
            <Text variant="smallStrong" tone="onPrimary" style={{ flexShrink: 1 }}>
              {t.message}
            </Text>
            {t.action ? (
              <Pressable
                onPress={() => {
                  t.action?.onPress()
                  setToasts((list) => list.filter((x) => x.id !== t.id))
                }}
                hitSlop={8}
              >
                <Text variant="smallStrong" color={colors.accent}>
                  {t.action.label}
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ))}
      </View>
      <Modal visible={Boolean(dialog)} transparent animationType="none" onRequestClose={() => close(false)}>
        {dialog ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[styles.scrim, { backgroundColor: colors.scrim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} />
            <Animated.View entering={ZoomIn.springify().damping(16)} style={[styles.dialog, { backgroundColor: colors.elevated }]}>
              <Text variant="title">{dialog.title}</Text>
              {dialog.message ? (
                <Text variant="body" tone="soft">
                  {dialog.message}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button label={dialog.cancelLabel} variant="secondary" onPress={() => close(false)} style={{ flex: 1 }} />
                <Button
                  label={dialog.confirmLabel}
                  variant={dialog.destructive ? 'danger' : 'primary'}
                  onPress={() => close(true)}
                  style={{ flex: 1 }}
                />
              </View>
            </Animated.View>
          </Animated.View>
        ) : null}
      </Modal>
    </FeedbackContext.Provider>
  )
}

export const useFeedback = (): FeedbackValue => {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('FeedbackProvider gerekli')
  return value
}

/** Liste/ızgara girişleri için kademeli giriş animasyonu. */
export const staggerIn = (index: number) =>
  FadeInDown.delay(Math.min(index, 12) * 45)
    .springify()
    .damping(20)
    .stiffness(160)

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    marginBottom: 8,
    maxWidth: 520,
    marginHorizontal: 16,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius.xl, padding: 24, gap: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
})
