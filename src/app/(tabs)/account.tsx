import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useAuth } from '../../auth/AuthContext'
import { Button, Card, Divider, Icon, Page, PageHeader, ScalePressable, SectionTitle, Segmented, Text, useFeedback } from '../../components/ui'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import { api, type ApiKeyCreated } from '../../lib/api'
import { APP_ENV } from '../../lib/config'
import { useUnit } from '../../lib/units'
import { useTheme, type ThemePreference } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'

export default function AccountScreen() {
  const { colors, preference, setPreference } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const { session, loggedIn, logout } = useAuth()
  const { toast, confirm } = useFeedback()
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  const user = session?.user
  const units = useUnit()

  const key = useQuery({ queryKey: ['me', 'key', user?.id], queryFn: api.apiKey, enabled: loggedIn })
  const regen = useMutation({
    mutationFn: api.regenerateApiKey,
    onSuccess: (next) => {
      setCreated(next)
      void queryClient.invalidateQueries({ queryKey: ['me', 'key'] })
    },
    onError: (err) => toast(apiErrorMessage(err, locale, 'error.unexpected', t), 'error'),
  })

  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value)
    toast(t('account.copied'), 'success')
  }

  const when = (iso: string | null | undefined) => {
    if (!iso) return t('account.never')
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? t('account.never') : d.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const initials = (user?.name?.trim() || user?.email || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Page max={760}>
      <PageHeader kicker={t('tab.account')} title={t('account.title')} lead={loggedIn ? t('account.lead') : undefined} />

      {loggedIn && user ? (
        <Animated.View entering={FadeInDown.springify().damping(20)}>
          <Card>
            <View style={styles.hero}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 20 }} tone="onPrimary">
                  {initials}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{user.name || user.email}</Text>
                <Text variant="small" tone="muted">
                  {user.email}
                </Text>
              </View>
            </View>
            <Divider />
            <View style={styles.creditRow}>
              <View>
                <Text variant="small" tone="muted">
                  {t('account.creditsBalance')}
                </Text>
                <Text variant="display">{session?.credits ?? 0}</Text>
              </View>
              <Button label={t('account.buyMore')} icon="zap" variant="accent" onPress={() => router.push('/credits')} />
            </View>
          </Card>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.springify().damping(20)}>
          <Card style={{ gap: 10 }}>
            <Text variant="title">{t('account.guestTitle')}</Text>
            <Text variant="body" tone="muted">
              {t('account.guestBody')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <Button label={t('auth.gift')} icon="gift" onPress={() => router.push('/auth/register')} />
              <Button label={t('editor.login')} variant="outline" onPress={() => router.push('/auth/login')} />
            </View>
          </Card>
        </Animated.View>
      )}

      <SectionTitle title={t('common.settings')} />
      <Animated.View entering={FadeInDown.delay(80).springify().damping(20)}>
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text variant="smallStrong" tone="soft">
              {t('account.appearance')}
            </Text>
            <Segmented<ThemePreference>
              value={preference}
              onChange={setPreference}
              options={[
                { value: 'system', label: t('account.themeSystem'), icon: 'smartphone' },
                { value: 'light', label: t('account.themeLight'), icon: 'sun' },
                { value: 'dark', label: t('account.themeDark'), icon: 'moon' },
              ]}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="smallStrong" tone="soft">
              {t('editor.unit')}
            </Text>
            <Segmented
              value={units.unit}
              onChange={units.setUnit}
              options={[
                { value: 'mm', label: t('account.unitMm') },
                { value: 'in', label: t('account.unitIn') },
              ]}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="smallStrong" tone="soft">
              {t('account.language')}
            </Text>
            <Segmented
              value={locale}
              onChange={setLocale}
              options={[
                { value: 'tr', label: 'Türkçe' },
                { value: 'en', label: 'English' },
              ]}
            />
          </View>
        </Card>
      </Animated.View>

      {loggedIn ? (
        <>
          <SectionTitle title={t('account.apiTitle')} />
          <Animated.View entering={FadeInDown.delay(140).springify().damping(20)}>
            <Card style={{ gap: 12 }}>
              <Text variant="small" tone="muted">
                {t('account.apiShort')}
              </Text>
              {key.data?.key ? (
                <>
                  <KeyRow label={t('account.publicKey')} value={key.data.key.publicKey} onCopy={copy} />
                  <Text variant="small" tone="muted">
                    {t('account.secretHint')}: {key.data.key.secretHint} · {t('account.created')}: {when(key.data.key.createdAt)} · {t('account.lastUsed')}:{' '}
                    {when(key.data.key.lastUsedAt)}
                  </Text>
                </>
              ) : (
                <Text variant="small" tone="muted">
                  {t('account.noKey')}
                </Text>
              )}
              {created ? (
                <Animated.View entering={FadeInDown} style={[styles.secret, { backgroundColor: colors.warningSoft }]}>
                  <Text variant="smallStrong" color={colors.warning}>
                    {t('account.secretOnce')}
                  </Text>
                  <KeyRow label={t('account.secretKey')} value={created.secretKey} onCopy={copy} />
                </Animated.View>
              ) : null}
              <Button
                label={regen.isPending ? t('account.generating') : key.data?.key ? t('account.regenerate') : t('account.generate')}
                variant="outline"
                icon="key"
                loading={regen.isPending}
                onPress={async () => {
                  if (key.data?.key) {
                    const ok = await confirm({
                      title: t('account.regenerate'),
                      message: t('account.confirmRegen'),
                      confirmLabel: t('account.regenerate'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    })
                    if (!ok) return
                  }
                  regen.mutate()
                }}
              />
              <View style={[styles.code, { backgroundColor: colors.surfaceAlt }]}>
                <Text variant="mono" tone="soft">
                  {`x-api-key: ${key.data?.key?.publicKey ?? 'dk_…'}\nx-secret-key: ${created?.secretKey ?? 'sk_…'}`}
                </Text>
              </View>
            </Card>
          </Animated.View>
          <Button
            label={t('nav.logout')}
            variant="danger"
            icon="log-out"
            full
            style={{ marginTop: 24 }}
            onPress={async () => {
              const ok = await confirm({ title: t('account.logoutConfirm'), confirmLabel: t('nav.logout'), cancelLabel: t('common.cancel'), destructive: true })
              if (ok) logout()
            }}
          />
        </>
      ) : null}

      <Text variant="small" tone="faint" align="center" style={{ marginTop: 28 }}>
        Leda Diecutting · {t('account.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
        {APP_ENV !== 'production' ? ` · ${APP_ENV}` : ''}
      </Text>
    </Page>
  )
}

const KeyRow = ({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) => {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Text variant="smallStrong" tone="soft">
        {label}
      </Text>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onCopy(value)}
        style={[styles.key, { backgroundColor: colors.surfaceAlt }]}
      >
        <Text variant="mono" style={{ flex: 1 }} numberOfLines={1} selectable>
          {value}
        </Text>
        <Icon name="copy" size={15} color={colors.muted} />
      </ScalePressable>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  creditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  secret: { padding: 14, borderRadius: radius.md, gap: 10 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
  code: { padding: 14, borderRadius: radius.md },
})
