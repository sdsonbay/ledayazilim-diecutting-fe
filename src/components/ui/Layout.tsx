import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { breakpoints } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export const useIsWide = (): boolean => useWindowDimensions().width >= breakpoints.wide

/** Alt sekme çubuğunun kapladığı alan (dar ekran). */
export const TAB_BAR_SPACE = 96

export const Container = ({ children, style, max = 1240 }: { children: ReactNode; style?: StyleProp<ViewStyle>; max?: number }) => (
  <View style={[{ width: '100%', maxWidth: max, alignSelf: 'center', paddingHorizontal: 20 }, style]}>{children}</View>
)

/** Kaydırılabilir sayfa: güvenli alan + sekme çubuğu boşluğu + geniş ekranda ortalı kolon. */
export const Page = ({
  children,
  contentStyle,
  max,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle>; max?: number }) => {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const wide = useIsWide()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: wide ? 28 : insets.top + 12, paddingBottom: (wide ? 48 : TAB_BAR_SPACE) + insets.bottom }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      <Container max={max} style={contentStyle}>
        {children}
      </Container>
    </ScrollView>
  )
}

export const PageHeader = ({
  kicker,
  title,
  lead,
  right,
}: {
  kicker?: string
  title: string
  lead?: string
  right?: ReactNode
}) => {
  const wide = useIsWide()
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.header, wide ? styles.headerWide : null]}>
      <View style={{ flex: 1, gap: 6 }}>
        {kicker ? (
          <Text variant="caption" tone="accent">
            {kicker}
          </Text>
        ) : null}
        <Text variant={wide ? 'hero' : 'display'}>{title}</Text>
        {lead ? (
          <Text variant="body" tone="muted" style={{ maxWidth: 620 }}>
            {lead}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </Animated.View>
  )
}

export const SectionTitle = ({ title, right }: { title: string; right?: ReactNode }) => (
  <View style={styles.section}>
    <Text variant="caption" tone="muted">
      {title}
    </Text>
    {right}
  </View>
)

export const EmptyState = ({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) => {
  const { colors } = useTheme()
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.empty, { borderColor: colors.line }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Icon name={icon} size={22} color={colors.inkSoft} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 380 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </Animated.View>
  )
}

export const Divider = () => {
  const { colors } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.line, marginVertical: 4 }} />
}

const styles = StyleSheet.create({
  header: { gap: 16, marginBottom: 24 },
  headerWide: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 32 },
  right: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
})
