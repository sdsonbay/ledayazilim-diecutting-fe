import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../auth/AuthContext'
import { DielineHero } from '../../components/DielineHero'
import { Logo } from '../../components/Logo'
import { TemplateCard } from '../../components/TemplateCard'
import { Button, Chip, Container, EmptyState, Input, Skeleton, TAB_BAR_SPACE, Text, staggerIn, useIsWide } from '../../components/ui'
import { useFavorites } from '../../hooks/useFavorites'
import { apiErrorMessage } from '../../i18n/errors'
import { useI18n } from '../../i18n/LocaleContext'
import { api } from '../../lib/api'
import type { TemplateSummary } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

const PAGE_SIZE = 48
const GAP = 14

const useDebounced = <T,>(value: T, ms: number): T => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(handle)
  }, [value, ms])
  return debounced
}

export default function CatalogScreen() {
  const { colors } = useTheme()
  const { t, label, locale } = useI18n()
  const { loggedIn } = useAuth()
  const insets = useSafeAreaInsets()
  const wide = useIsWide()
  const { width } = useWindowDimensions()
  const favorites = useFavorites()
  const [query, setQuery] = useState('')
  const [material, setMaterial] = useState('')
  const [category, setCategory] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const debounced = useDebounced(query, 250)

  const columns = width >= 1180 ? 4 : width >= 860 ? 3 : 2
  const contentWidth = Math.min(width, 1240) - 40
  const itemWidth = (contentWidth - GAP * (columns - 1)) / columns

  const coverage = useQuery({ queryKey: ['coverage'], queryFn: api.dctCoverage, staleTime: 60 * 60_000 })

  const catalog = useInfiniteQuery({
    queryKey: ['templates', debounced, material, category, showFavorites ? favorites.list.join(',') : ''],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      showFavorites
        ? api.templates(debounced, { ids: favorites.list.slice(0, 200), limit: 96 })
        : api.templates(debounced, {
            ...(material ? { material } : {}),
            ...(category ? { category } : {}),
            page: pageParam,
            limit: PAGE_SIZE,
          }),
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
    enabled: !showFavorites || favorites.list.length > 0,
    placeholderData: (previous) => previous,
  })

  const first = catalog.data?.pages[0]
  const items = useMemo<TemplateSummary[]>(() => {
    if (showFavorites && favorites.list.length === 0) return []
    return catalog.data?.pages.flatMap((p) => p.items) ?? []
  }, [catalog.data, showFavorites, favorites.list.length])
  const tree = first?.tree ?? []
  const branch = tree.find((b) => b.id === material)
  const total = showFavorites ? items.length : (first?.total ?? 0)

  const rows = useMemo(() => {
    const out: TemplateSummary[][] = []
    for (let i = 0; i < items.length; i += columns) out.push(items.slice(i, i + columns))
    return out
  }, [items, columns])

  const selectAll = () => {
    setShowFavorites(false)
    setMaterial('')
    setCategory('')
  }

  const header = (
    <View>
      <Container>
        {!wide ? (
          <View style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
            <Logo />
          </View>
        ) : null}
        <View style={[styles.hero, wide ? styles.heroWide : null]}>
          <Animated.View entering={FadeInDown.springify().damping(20)} style={{ flex: 1, gap: 14, maxWidth: 640 }}>
            <Text variant="caption" tone="accent">
              {t('home.kicker')}
            </Text>
            <Text variant={wide ? 'hero' : 'display'} style={wide ? { fontSize: 64, lineHeight: 64 } : null}>
              {t('home.title')}
            </Text>
            <Text variant="body" tone="muted" style={{ fontSize: 16, lineHeight: 24 }}>
              {t('home.lead')}
            </Text>
            <View style={styles.stats}>
              <Stat value={first ? first.catalogTotal.toLocaleString(locale) : '—'} label={t('home.statTemplates')} />
              <Stat
                value={coverage.data ? compact(coverage.data.configurableTotal, locale) : '—'}
                label={t('home.statPerms')}
              />
              <Stat value="3" label={t('home.statFormats')} />
            </View>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(150).duration(600)} style={wide ? styles.heroArt : styles.heroArtNarrow}>
            <DielineHero height={wide ? 300 : 190} />
          </Animated.View>
        </View>

        <View style={styles.search}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={wide ? t('catalog.search') : t('catalog.searchShort')}
            icon="search"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel={t('catalog.search')}
          />
        </View>
      </Container>

      <ChipRow wide={wide}>
        <Chip label={t('catalog.all')} selected={!showFavorites && !material} onPress={selectAll} count={first?.catalogTotal} />
        <Chip
          label={t('catalog.favorites')}
          icon="heart"
          selected={showFavorites}
          count={loggedIn ? favorites.list.length : undefined}
          onPress={() => {
            if (!loggedIn) {
              favorites.toggle('')
              return
            }
            setShowFavorites(true)
            setMaterial('')
            setCategory('')
          }}
        />
        {tree.map((b) => (
          <Chip
            key={b.id}
            label={label(b.label)}
            count={b.count}
            selected={!showFavorites && material === b.id}
            onPress={() => {
              setShowFavorites(false)
              setMaterial(material === b.id ? '' : b.id)
              setCategory('')
            }}
          />
        ))}
      </ChipRow>
      {branch && !showFavorites ? (
        <Animated.View entering={FadeInDown.springify().damping(20)} layout={LinearTransition}>
          <ChipRow wide={wide} tight>
            {branch.groups.map((g) => (
              <Chip key={g.id} label={label(g.label)} count={g.count} selected={category === g.id} onPress={() => setCategory(category === g.id ? '' : g.id)} />
            ))}
          </ChipRow>
        </Animated.View>
      ) : null}

      <Container style={styles.countRow}>
        <Text variant="smallStrong" tone="muted">
          {showFavorites ? t('catalog.favCount', { n: total }) : t('catalog.count', { n: total.toLocaleString(locale) })}
        </Text>
        {catalog.isFetching && !catalog.isFetchingNextPage ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      </Container>
    </View>
  )

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(row) => row.map((r) => r.id).join('|')}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: (wide ? 64 : TAB_BAR_SPACE) + insets.bottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (catalog.hasNextPage && !catalog.isFetchingNextPage && !showFavorites) void catalog.fetchNextPage()
      }}
      renderItem={({ item: row, index }) => (
        <Container style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
          {row.map((item, i) => (
            <Animated.View key={item.id} entering={staggerIn((index * columns + i) % PAGE_SIZE)} style={{ width: itemWidth }}>
              <TemplateCard item={item} favorited={favorites.ids.has(item.id)} onFavorite={favorites.toggle} />
            </Animated.View>
          ))}
        </Container>
      )}
      ListEmptyComponent={
        catalog.isLoading ? (
          <Container style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {Array.from({ length: columns * 2 }, (_, i) => (
              <View key={i} style={{ width: itemWidth, gap: 10 }}>
                <Skeleton height={itemWidth * 0.75} rounded={radius.lg} />
                <Skeleton width="60%" height={12} />
                <Skeleton width="85%" height={16} />
              </View>
            ))}
          </Container>
        ) : catalog.isError ? (
          <Container>
            <EmptyState
              icon="wifi-off"
              title={apiErrorMessage(catalog.error, locale, 'catalog.loadError', t)}
              action={<Button label={t('common.retry')} variant="outline" icon="refresh-cw" onPress={() => void catalog.refetch()} />}
            />
          </Container>
        ) : (
          <Container>
            <EmptyState
              icon={showFavorites ? 'heart' : 'search'}
              title={showFavorites ? t('catalog.favorites') : t('catalog.empty')}
              body={showFavorites ? t('catalog.favEmpty') : undefined}
              action={<Button label={t('catalog.clear')} variant="outline" onPress={() => { setQuery(''); selectAll() }} />}
            />
          </Container>
        )
      }
      ListFooterComponent={
        catalog.isFetchingNextPage ? (
          <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.muted} />
            <Text variant="small" tone="muted">
              {t('catalog.loadingMore')}
            </Text>
          </View>
        ) : null
      }
    />
  )
}

/** Dar ekranda yatay kaydırma, geniş ekranda sarmalanan chip satırı. */
const ChipRow = ({ wide, tight, children }: { wide: boolean; tight?: boolean; children: ReactNode }) =>
  wide ? (
    <Container style={[styles.chipsWrap, tight ? { paddingTop: 0 } : null]}>{children}</Container>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, tight ? { paddingTop: 0 } : null]}>
      {children}
    </ScrollView>
  )

const compact = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const Stat = ({ value, label }: { value: string; label: string }) => (
  <View style={{ gap: 2 }}>
    <Text variant="title" style={{ fontSize: 26, lineHeight: 30 }}>
      {value}
    </Text>
    <Text variant="small" tone="muted">
      {label}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  hero: { paddingTop: 16, paddingBottom: 8, gap: 12 },
  heroWide: { flexDirection: 'row', alignItems: 'center', paddingTop: 40, paddingBottom: 24, gap: 32 },
  heroArt: { flex: 1, alignItems: 'flex-end' },
  heroArtNarrow: { alignItems: 'center', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 32, marginTop: 10 },
  search: { marginTop: 16, marginBottom: 6 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
})
