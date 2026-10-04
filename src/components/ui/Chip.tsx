import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { ScalePressable } from './Pressable'
import { Text } from './Text'

export const Chip = ({
  label,
  selected,
  onPress,
  icon,
  count,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: IconName
  count?: number | string
}) => {
  const { colors } = useTheme()
  const fg = selected ? colors.onPrimary : colors.ink
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      haptic
      scaleTo={0.94}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.line,
        },
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={14} color={fg} /> : null}
        <Text style={{ fontFamily: fonts.medium, fontSize: 13 }} color={fg} numberOfLines={1}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, opacity: 0.55 }} color={fg}>
            {count}
          </Text>
        ) : null}
      </View>
    </ScalePressable>
  )
}

export const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) => {
  const { colors } = useTheme()
  const bg = { neutral: colors.surfaceAlt, accent: colors.accentSoft, success: colors.successSoft, warning: colors.warningSoft }[tone]
  const fg = { neutral: colors.inkSoft, accent: colors.accent, success: colors.success, warning: colors.warning }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.2 }} color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
})
