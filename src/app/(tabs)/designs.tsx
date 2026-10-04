import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button, EmptyState, IconButton, Page, PageHeader, ScalePressable, Skeleton, Text, staggerIn, useFeedback } from '../../components/ui'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import { api, previewUrl } from '../../lib/api'
import type { SavedDesign } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

export default function DesignsScreen() {
  const { colors, scheme } = useTheme()
  const { t, label, locale } = useI18n()
  const { loggedIn, session, ready } = useAuth()
  const { toast, confirm } = useFeedback()
  const queryClient = useQueryClient()
  const { width } = useWindowDimensions()
  const columns = width >= 1100 ? 3 : width >= 700 ? 2 : 1
  const key = ['me', 'designs', session?.user?.id]

  const designs = useQuery({ queryKey: key, queryFn: api.designs, enabled: loggedIn })
  const ids = [...new Set((designs.data ?? []).map((d) => d.templateId))].slice(0, 200)
  const names = useQuery({
    queryKey: ['templates', 'ids', ids.join(',')],
    queryFn: () => api.templates('', { ids, limit: 96 }),
    enabled: ids.length > 0,
  })
  const nameOf = (templateId: string) => {
    const item = names.data?.items.find((i) => i.id === templateId)
    return item ? label(item.name) : templateId
  }

  const remove = useMutation({
    mutationFn: api.deleteDesign,
    onSuccess: (_d, id) => {
      queryClient.setQueryData<SavedDesign[]>(key, (list) => (list ?? []).filter((x) => x.id !== id))
      toast(t('designs.deleted'), 'success')
    },
    onError: (err) => toast(apiErrorMessage(err, locale, 'saved.deleteFail', t), 'error'),
  })

  const when = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const open = (d: SavedDesign) => router.push({ pathname: '/template/[id]', params: { id: d.templateId, saved: d.id } })

  return (
    <Page>
      <PageHeader kicker={t('tab.designs')} title={t('saved.title')} lead={t('saved.lead')} />
      {!ready ? null : !loggedIn ? (
        <EmptyState
          icon="lock"
          title={t('designs.loginTitle')}
          body={t('designs.loginBody')}
          action={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={t('editor.login')} onPress={() => router.push('/auth/login')} />
              <Button label={t('editor.register')} variant="outline" onPress={() => router.push('/auth/register')} />
            </View>
          }
        />
      ) : designs.isLoading ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={104} rounded={radius.lg} />
          ))}
        </View>
      ) : (designs.data ?? []).length === 0 ? (
        <EmptyState
          icon="bookmark"
          title={t('designs.empty')}
          body={t('designs.emptyBody')}
          action={<Button label={t('designs.browse')} icon="grid" onPress={() => router.navigate('/catalog')} />}
        />
      ) : (
        <View style={styles.grid}>
          {(designs.data ?? []).map((d, i) => (
            <Animated.View
              key={d.id}
              entering={staggerIn(i)}
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.springify().damping(20)}
              style={{ width: columns === 1 ? '100%' : `${100 / columns - 1.5}%` }}
            >
              <ScalePressable
                accessibilityRole="link"
                accessibilityLabel={d.name}
                onPress={() => open(d)}
                hoverLift
                scaleTo={0.985}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
              >
                <View style={[styles.thumb, { backgroundColor: scheme === 'dark' ? '#0b0b0b' : '#ffffff', borderColor: colors.line, borderWidth: 1 }]}>
                  <Image source={{ uri: previewUrl(d.templateId, scheme) }} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text variant="small" tone="soft" numberOfLines={1}>
                    {nameOf(d.templateId)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    {d.hasArtwork ? <Badge label={t('saved.hasPrint')} tone="accent" /> : null}
                    <Text variant="small" tone="muted">
                      {when(d.updatedAt)}
                    </Text>
                  </View>
                </View>
                <IconButton
                  icon="trash-2"
                  label={t('saved.delete')}
                  variant="ghost"
                  onPress={async () => {
                    const ok = await confirm({
                      title: t('saved.confirm'),
                      message: d.name,
                      confirmLabel: t('saved.delete'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    })
                    if (ok) remove.mutate(d.id)
                  }}
                />
              </ScalePressable>
            </Animated.View>
          ))}
        </View>
      )}
    </Page>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  thumb: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden' },
})
