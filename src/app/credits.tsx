import { useMutation, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, EmptyState, IconButton, Page, PageHeader, Skeleton, Text, staggerIn, useFeedback } from '../components/ui'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { api } from '../lib/api'
import { useTheme } from '../theme/ThemeContext'
import { radius } from '../theme/tokens'

export default function CreditsScreen() {
  const { colors } = useTheme()
  const { t, label, locale } = useI18n()
  const { loggedIn, session, refresh } = useAuth()
  const { toast } = useFeedback()
  const packs = useQuery({ queryKey: ['credit-packages'], queryFn: api.creditPackages })
  // Gerçek ödeme bağlanana kadar prod'da satın alma kapalı (API provider: 'none').
  const purchasable = packs.data?.provider !== 'none'
  const buy = useMutation({
    mutationFn: api.purchaseCredits,
    onSuccess: async (result) => {
      await refresh()
      toast(t('credits.done', { n: result.granted, total: result.credits }), 'success')
    },
    onError: (err) => toast(apiErrorMessage(err, locale, 'error.unexpected', t), 'error'),
  })

  return (
    <Page max={980}>
      <View style={{ alignItems: 'flex-end' }}>
        <IconButton icon="x" label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <PageHeader
        kicker={session ? t('credits.label', { n: session.credits }) : undefined}
        title={t('credits.pageTitle')}
        lead={loggedIn ? t('credits.title') : t('credits.login')}
      />
      {!loggedIn ? (
        <EmptyState
          icon="zap"
          title={t('credits.login')}
          body={t('credits.guestHint')}
          action={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={t('editor.register')} onPress={() => router.replace('/auth/register')} />
              <Button label={t('editor.login')} variant="outline" onPress={() => router.replace('/auth/login')} />
            </View>
          }
        />
      ) : (
        <>
          <View style={styles.grid}>
            {packs.isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} height={260} rounded={radius.xl} style={{ flex: 1, minWidth: 240 }} />)
              : (packs.data?.items ?? []).map((pack, i) => {
                  const popular = pack.id === 'studio'
                  return (
                    <Animated.View
                      key={pack.id}
                      entering={staggerIn(i)}
                      style={[
                        styles.pack,
                        {
                          backgroundColor: popular ? colors.primary : colors.surface,
                          borderColor: popular ? colors.primary : colors.line,
                        },
                      ]}
                    >
                      {popular ? <Badge label={t('credits.popular')} tone="accent" /> : <View style={{ height: 20 }} />}
                      <Text variant="title" tone={popular ? 'onPrimary' : 'ink'}>
                        {label(pack.name)}
                      </Text>
                      <Text variant="small" color={popular ? colors.faint : colors.muted} style={{ minHeight: 36 }}>
                        {label(pack.blurb)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                        <Text variant="hero" tone={popular ? 'onPrimary' : 'ink'} style={{ fontSize: 48, lineHeight: 52 }}>
                          {pack.credits}
                        </Text>
                        <Text variant="bodyStrong" tone={popular ? 'onPrimary' : 'soft'}>
                          {t('credits.perCredit', { n: '' }).trim()}
                        </Text>
                      </View>
                      <Text variant="small" color={popular ? colors.faint : colors.muted}>
                        {t('credits.price', { n: pack.priceTry })} · {t('credits.unit', { n: (pack.priceTry / pack.credits).toFixed(2) })}
                      </Text>
                      <Button
                        disabled={!purchasable}
                        label={!purchasable ? t('credits.soon') : buy.isPending && buy.variables === pack.id ? t('credits.buying') : t('credits.buy')}
                        variant={popular ? 'accent' : 'primary'}
                        full
                        loading={buy.isPending && buy.variables === pack.id}
                        onPress={() => buy.mutate(pack.id)}
                        style={{ marginTop: 12 }}
                      />
                    </Animated.View>
                  )
                })}
          </View>
          <Text variant="small" tone="muted" style={{ marginTop: 20 }}>
            {purchasable ? t('credits.mockNote') : t('credits.soonNote')}
          </Text>
        </>
      )}
    </Page>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  pack: { flex: 1, minWidth: 240, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth * 2, padding: 22, gap: 6 },
})
