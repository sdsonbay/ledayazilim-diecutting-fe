import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import Head from 'expo-router/head'
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../auth/AuthContext'
import { HeroFold } from '../../components/HeroFold'
import { Logo } from '../../components/Logo'
import { Button, Container, Icon, ScalePressable, TAB_BAR_SPACE, Text, staggerIn, useIsWide, type IconName } from '../../components/ui'
import { useI18n } from '../../i18n/LocaleContext'
import type { MessageKey } from '../../i18n/messages'
import { api, previewUrl } from '../../lib/api'
import type { CatalogFacet } from '../../lib/types'
import { useTheme } from '../../theme/ThemeContext'
import { radius } from '../../theme/tokens'

const compact = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const FEATURES: { icon: IconName; title: MessageKey; body: MessageKey }[] = [
  { icon: 'sliders', title: 'landing.f1Title', body: 'landing.f1Body' },
  { icon: 'box', title: 'landing.f2Title', body: 'landing.f2Body' },
  { icon: 'layout', title: 'landing.f3Title', body: 'landing.f3Body' },
  { icon: 'image', title: 'landing.f4Title', body: 'landing.f4Body' },
  { icon: 'download', title: 'landing.f5Title', body: 'landing.f5Body' },
  { icon: 'code', title: 'landing.f6Title', body: 'landing.f6Body' },
]

const STEPS: { icon: IconName; title: MessageKey; body: MessageKey }[] = [
  { icon: 'grid', title: 'landing.step1Title', body: 'landing.step1Body' },
  { icon: 'maximize', title: 'landing.step2Title', body: 'landing.step2Body' },
  { icon: 'package', title: 'landing.step3Title', body: 'landing.step3Body' },
]

export default function HomeScreen() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const { loggedIn } = useAuth()
  const insets = useSafeAreaInsets()
  const wide = useIsWide()
  const { width, height } = useWindowDimensions()

  const overview = useQuery({ queryKey: ['templates', 'overview'], queryFn: () => api.templates('', { limit: 1 }), staleTime: 10 * 60_000 })
  const coverage = useQuery({ queryKey: ['coverage'], queryFn: api.dctCoverage, staleTime: 60 * 60_000 })

  const groups: (CatalogFacet & { material: string })[] = (overview.data?.tree ?? [])
    .flatMap((branch) => branch.groups.map((g) => ({ ...g, material: branch.id })))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 8)
  const columns = width >= 1180 ? 4 : width >= 700 ? 3 : 2
  const cardWidth = (Math.min(width, 1240) - 40 - 14 * (columns - 1)) / columns

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: wide ? 0 : TAB_BAR_SPACE + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <Head>
        <title>Leda Diecutting — parametrik bıçak izi ve 3D kutu katlama</title>
        <meta name="description" content={t('landing.lead')} />
      </Head>

      {/* ───── Hero */}
      <Container style={[styles.hero, wide ? styles.heroWide : { paddingTop: insets.top + 10 }]}>
        {!wide ? <Logo /> : null}
        <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.heroCopy, wide ? { flex: 1 } : null]}>
          <Text variant="caption" tone="accent">
            {t('home.kicker')}
          </Text>
          <Text variant="hero" style={wide ? { fontSize: 68, lineHeight: 68 } : { fontSize: 44, lineHeight: 46 }}>
            {t('landing.title')}
          </Text>
          {/* Dar ekranda vitrin başlığın hemen altında: ilk ekranda görünsün. */}
          {!wide ? <HeroFold height={340} /> : null}
          <Text variant="body" tone="muted" style={{ fontSize: 17, lineHeight: 26, maxWidth: 560 }}>
            {t('landing.lead')}
          </Text>
          <View style={styles.ctas}>
            <Button label={t('landing.ctaCatalog')} size="lg" iconRight="arrow-right" onPress={() => router.navigate('/catalog')} />
            <Button label={t('landing.ctaStudio')} size="lg" variant="outline" icon="pen-tool" onPress={() => router.navigate('/studio')} />
          </View>
          <View style={styles.stats}>
            <Stat value={overview.data ? overview.data.catalogTotal.toLocaleString(locale) : '—'} label={t('home.statTemplates')} />
            <Stat value={coverage.data ? compact(coverage.data.configurableTotal, locale) : '—'} label={t('home.statPerms')} />
            <Stat value="PDF · DXF · SVG" label={t('home.statFormats')} />
          </View>
        </Animated.View>
        {wide ? (
          <Animated.View entering={FadeIn.delay(200).duration(700)} style={{ flex: 1.05 }}>
            <HeroFold height={Math.min(620, Math.max(460, height - 200))} />
          </Animated.View>
        ) : null}
      </Container>

      <View style={[styles.trust, { borderColor: colors.line }]}>
        <Text variant="smallStrong" tone="muted" align="center">
          {t('landing.trust')}
        </Text>
      </View>

      {/* ───── Nasıl çalışır */}
      <Container style={styles.section}>
        <SectionHead kicker={t('landing.howKicker')} title={t('landing.howTitle')} />
        <View style={[styles.grid, { gap: 14 }]}>
          {STEPS.map((step, i) => (
            <Animated.View
              key={step.title}
              entering={staggerIn(i)}
              style={[styles.step, { backgroundColor: colors.surface, borderColor: colors.line, width: wide ? (Math.min(width, 1240) - 40 - 28) / 3 : '100%' }]}
            >
              <View style={styles.stepTop}>
                <View style={[styles.stepIcon, { backgroundColor: colors.accentSoft }]}>
                  <Icon name={step.icon} size={20} color={colors.accent} />
                </View>
                <Text variant="display" tone="faint">
                  {`0${i + 1}`}
                </Text>
              </View>
              <Text variant="title">{t(step.title)}</Text>
              <Text variant="body" tone="muted">
                {t(step.body)}
              </Text>
            </Animated.View>
          ))}
        </View>
      </Container>

      {/* ───── Kategoriler */}
      <Container style={styles.section}>
        <SectionHead
          kicker={t('landing.catKicker')}
          title={t('landing.catTitle')}
          right={<Button label={t('landing.catAll')} variant="ghost" iconRight="arrow-right" onPress={() => router.navigate('/catalog')} />}
        />
        <View style={[styles.grid, { gap: 14 }]}>
          {groups.map((g, i) => (
            <Animated.View key={`${g.material}-${g.id}`} entering={staggerIn(i)} style={{ width: cardWidth }}>
              <CategoryCard group={g} />
            </Animated.View>
          ))}
        </View>
      </Container>

      {/* ───── Özellikler */}
      <Container style={styles.section}>
        <SectionHead kicker={t('landing.featKicker')} title={t('landing.featTitle')} />
        <View style={[styles.grid, { gap: 14 }]}>
          {FEATURES.map((f, i) => (
            <Animated.View
              key={f.title}
              entering={staggerIn(i)}
              style={[styles.feature, { borderColor: colors.line, width: wide ? (Math.min(width, 1240) - 40 - 28) / 3 : width >= 600 ? (width - 54) / 2 : '100%' }]}
            >
              <Icon name={f.icon} size={22} color={colors.ink} />
              <Text variant="heading">{t(f.title)}</Text>
              <Text variant="body" tone="muted">
                {t(f.body)}
              </Text>
            </Animated.View>
          ))}
        </View>
      </Container>

      {/* ───── Çağrı */}
      {!loggedIn ? (
        <Container style={styles.section}>
          <View style={[styles.cta, { backgroundColor: colors.primary }]}>
            <View style={{ flex: 1, gap: 10 }}>
              <Text variant="display" tone="onPrimary">
                {t('landing.ctaTitle')}
              </Text>
              <Text variant="body" color={colors.faint} style={{ maxWidth: 560 }}>
                {t('landing.ctaBody')}
              </Text>
            </View>
            <Button label={t('landing.ctaButton')} variant="accent" size="lg" icon="gift" onPress={() => router.push('/auth/register')} />
          </View>
        </Container>
      ) : null}

      {wide ? <Footer /> : <View style={{ height: 24 }} />}
    </ScrollView>
  )
}

const SectionHead = ({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) => {
  const wide = useIsWide()
  return (
    <View style={[styles.sectionHead, wide ? { flexDirection: 'row', alignItems: 'flex-end' } : null]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="caption" tone="accent">
          {kicker}
        </Text>
        <Text variant="display">{title}</Text>
      </View>
      {right}
    </View>
  )
}

const Stat = ({ value, label }: { value: string; label: string }) => (
  <View style={{ gap: 2 }}>
    <Text variant="title" style={{ fontSize: 24, lineHeight: 28 }}>
      {value}
    </Text>
    <Text variant="small" tone="muted">
      {label}
    </Text>
  </View>
)

const CategoryCard = ({ group }: { group: CatalogFacet & { material: string } }) => {
  const { colors, scheme } = useTheme()
  const { label, t } = useI18n()
  const sample = useQuery({
    queryKey: ['templates', 'sample', group.material, group.id],
    queryFn: () => api.templates('', { material: group.material, category: group.id, limit: 1 }),
    staleTime: 60 * 60_000,
  })
  const first = sample.data?.items[0]
  return (
    <ScalePressable
      accessibilityRole="link"
      accessibilityLabel={label(group.label)}
      onPress={() => router.navigate({ pathname: '/catalog', params: { material: group.material, category: group.id } })}
      hoverLift
      scaleTo={0.98}
      style={[styles.catCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <View style={[styles.catPreview, { backgroundColor: scheme === 'dark' ? '#0b0b0b' : '#ffffff' }]}>
        {first ? <Image source={{ uri: previewUrl(first.id, scheme) }} style={styles.catImage} contentFit="contain" transition={250} /> : null}
      </View>
      <View style={{ padding: 14, gap: 2 }}>
        <Text variant="heading" numberOfLines={1}>
          {label(group.label)}
        </Text>
        <Text variant="small" tone="muted">
          {t('catalog.count', { n: (group.count ?? 0).toLocaleString() })}
        </Text>
      </View>
    </ScalePressable>
  )
}

const Footer = () => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const link = (labelKey: MessageKey, onPress: () => void) => (
    <ScalePressable key={labelKey} accessibilityRole="link" onPress={onPress} scaleTo={0.98}>
      <Text variant="small" tone="soft">
        {t(labelKey)}
      </Text>
    </ScalePressable>
  )
  return (
    <View style={[styles.footer, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Container style={styles.footerInner}>
        <View style={{ gap: 10, flex: 1.4 }}>
          <Logo />
          <Text variant="small" tone="muted" style={{ maxWidth: 320 }}>
            {t('app.tagline')}
          </Text>
        </View>
        <View style={styles.footerCol}>
          <Text variant="caption" tone="muted">
            {t('footer.product')}
          </Text>
          {link('tab.catalog', () => router.navigate('/catalog'))}
          {link('tab.studio', () => router.navigate('/studio'))}
          {link('nav.credits', () => router.push('/credits'))}
        </View>
        <View style={styles.footerCol}>
          <Text variant="caption" tone="muted">
            {t('footer.account')}
          </Text>
          {link('nav.login', () => router.push('/auth/login'))}
          {link('nav.register', () => router.push('/auth/register'))}
          {link('tab.designs', () => router.navigate('/designs'))}
        </View>
      </Container>
      <Container>
        <Text variant="small" tone="faint" style={{ paddingVertical: 20 }}>
          {t('footer.rights', { year: new Date().getFullYear() })}
        </Text>
      </Container>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { gap: 18, paddingBottom: 12 },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: 32, paddingTop: 32 },
  heroCopy: { gap: 16 },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 28, marginTop: 14 },
  trust: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: StyleSheet.hairlineWidth * 2, paddingVertical: 16, paddingHorizontal: 20 },
  section: { paddingTop: 56 },
  sectionHead: { gap: 12, marginBottom: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  step: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth * 2, padding: 22, gap: 8 },
  stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stepIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  catPreview: { aspectRatio: 4 / 3 },
  catImage: { position: 'absolute', top: 16, left: 16, right: 16, bottom: 16 },
  feature: { borderTopWidth: 1.5, paddingTop: 18, paddingBottom: 12, paddingRight: 18, gap: 8 },
  cta: { borderRadius: radius.xl, padding: 32, gap: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  footer: { marginTop: 72, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  footerInner: { flexDirection: 'row', gap: 32, paddingTop: 40, paddingBottom: 12 },
  footerCol: { flex: 1, gap: 10 },
})
