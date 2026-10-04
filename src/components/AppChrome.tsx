import { BlurView } from 'expo-blur'
import { router, usePathname, type Href } from 'expo-router'
import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/LocaleContext'
import type { MessageKey } from '../i18n/messages'
import { useTheme } from '../theme/ThemeContext'
import { fonts, motion, radius } from '../theme/tokens'
import { Logo } from './Logo'
import { Icon, IconButton, ScalePressable, Text, type IconName } from './ui'

export interface TabDef {
  name: string
  href: Href
  path: string
  label: MessageKey
  icon: IconName
}

export const TABS: TabDef[] = [
  { name: 'index', href: '/', path: '/', label: 'tab.catalog', icon: 'grid' },
  { name: 'studio', href: '/studio', path: '/studio', label: 'tab.studio', icon: 'pen-tool' },
  { name: 'import', href: '/import', path: '/import', label: 'tab.import', icon: 'upload' },
  { name: 'designs', href: '/designs', path: '/designs', label: 'tab.designs', icon: 'bookmark' },
  { name: 'account', href: '/account', path: '/account', label: 'tab.account', icon: 'user' },
]

const useActiveIndex = () => {
  const pathname = usePathname()
  const index = TABS.findIndex((tab) => (tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)))
  return Math.max(0, index)
}

/** Dar ekran: alttan yüzen cam sekme çubuğu, kayan seçili gösterge. */
export const BottomTabBar = () => {
  const { colors, scheme } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const active = useActiveIndex()
  const [width, setWidth] = useState(0)
  const slot = width / TABS.length
  const indicator = useAnimatedStyle(() => ({
    width: slot - 8,
    transform: [{ translateX: withSpring(active * slot + 4, motion.spring) }],
  }))
  return (
    <View pointerEvents="box-none" style={[styles.bottomWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bottomBar, { borderColor: colors.line, shadowColor: colors.shadow }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.elevated }]} />
        ) : (
          <BlurView intensity={60} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        {width > 0 ? <Animated.View style={[styles.bottomIndicator, { backgroundColor: colors.primary }, indicator]} /> : null}
        {TABS.map((tab, i) => {
          const focused = i === active
          return (
            <ScalePressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(tab.label)}
              onPress={() => router.navigate(tab.href)}
              haptic
              scaleTo={0.9}
              style={styles.bottomItem}
            >
              <Icon name={tab.icon} size={19} color={focused ? colors.onPrimary : colors.inkSoft} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 10, marginTop: 3 }} color={focused ? colors.onPrimary : colors.muted} numberOfLines={1}>
                {t(tab.label)}
              </Text>
            </ScalePressable>
          )
        })}
      </View>
    </View>
  )
}

/** Geniş ekran (web/tablet): üst gezinme çubuğu. */
export const TopNav = () => {
  const { colors, scheme, toggle } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const { session, loggedIn } = useAuth()
  const active = useActiveIndex()
  return (
    <View style={[styles.topBar, { borderColor: colors.line }]}>
      {Platform.OS === 'web' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass, backdropFilter: 'saturate(180%) blur(20px)' } as object]} />
      ) : (
        <BlurView intensity={50} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.topInner}>
        <ScalePressable accessibilityRole="link" accessibilityLabel={t('app.name')} onPress={() => router.navigate('/')} scaleTo={0.97}>
          <Logo />
        </ScalePressable>
        <View style={styles.topLinks}>
          {TABS.filter((tab) => tab.name !== 'account').map((tab, i) => (
            <TopLink key={tab.name} tab={tab} focused={i === active} />
          ))}
        </View>
        <View style={styles.topRight}>
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel={t('credits.title')}
            onPress={() => router.navigate(loggedIn ? '/credits' : '/auth/register')}
            hoverLift
            style={[styles.creditChip, { backgroundColor: colors.accentSoft }]}
          >
            <Icon name="zap" size={13} color={colors.accent} />
            <Text variant="smallStrong" color={colors.accent}>
              {session ? t('credits.label', { n: session.credits }) : '…'}
            </Text>
          </ScalePressable>
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel={locale === 'tr' ? 'English' : 'Türkçe'}
            onPress={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
            style={[styles.langBtn, { borderColor: colors.line }]}
          >
            <Text variant="mono" tone="soft">
              {locale === 'tr' ? 'EN' : 'TR'}
            </Text>
          </ScalePressable>
          <IconButton
            icon={scheme === 'dark' ? 'sun' : 'moon'}
            label={scheme === 'dark' ? t('theme.light') : t('theme.dark')}
            onPress={toggle}
            variant="ghost"
            size={36}
          />
          {loggedIn ? (
            <ScalePressable
              accessibilityRole="link"
              accessibilityLabel={t('tab.account')}
              onPress={() => router.navigate('/account')}
              style={[styles.avatar, { backgroundColor: active === 4 ? colors.primary : colors.surfaceAlt }]}
            >
              <Text variant="smallStrong" color={active === 4 ? colors.onPrimary : colors.ink}>
                {(session?.user?.name || session?.user?.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </ScalePressable>
          ) : (
            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel={t('nav.login')}
              onPress={() => router.navigate('/auth/login')}
              hoverLift
              style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            >
              <Text variant="smallStrong" tone="onPrimary">
                {t('nav.login')}
              </Text>
            </ScalePressable>
          )}
        </View>
      </View>
    </View>
  )
}

const TopLink = ({ tab, focused }: { tab: TabDef; focused: boolean }) => {
  const { colors } = useTheme()
  const { t } = useI18n()
  const [hovered, setHovered] = useState(false)
  const underline = useAnimatedStyle(() => ({
    opacity: withSpring(focused ? 1 : hovered ? 0.35 : 0, motion.spring),
    transform: [{ scaleX: withSpring(focused || hovered ? 1 : 0.4, motion.spring) }],
  }))
  return (
    <ScalePressable
      accessibilityRole="link"
      accessibilityState={{ selected: focused }}
      onPress={() => router.navigate(tab.href)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      scaleTo={0.97}
      style={styles.topLink}
    >
      <Text variant="bodyStrong" color={focused ? colors.ink : colors.muted}>
        {t(tab.label)}
      </Text>
      <Animated.View style={[styles.underline, { backgroundColor: colors.accent }, underline]} />
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  bottomBar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    height: 64,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    alignItems: 'center',
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  bottomIndicator: { position: 'absolute', left: 0, top: 6, height: 52, borderRadius: radius.lg },
  bottomItem: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  topBar: { borderBottomWidth: StyleSheet.hairlineWidth * 2, zIndex: 10 },
  topInner: {
    height: 64,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  topLinks: { flexDirection: 'row', gap: 22, flex: 1 },
  topLink: { paddingVertical: 8 },
  underline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  creditChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: radius.pill },
  langBtn: { height: 32, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  loginBtn: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center' },
})
