import { forwardRef, useState } from 'react'
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, motion, radius } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { ScalePressable } from './Pressable'
import { Text } from './Text'

export interface InputProps extends TextInputProps {
  label?: string
  hint?: string
  error?: string | null
  icon?: IconName
  suffix?: string
}

export const Input = forwardRef<TextInput, InputProps>(({ label, hint, error, icon, suffix, secureTextEntry, style, onFocus, onBlur, ...rest }, ref) => {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const [reveal, setReveal] = useState(false)
  const ring = useAnimatedStyle(() => ({
    borderColor: withTiming(error ? colors.danger : focused ? colors.ink : 'transparent', { duration: motion.fast }),
  }))
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" tone="soft">
          {label}
        </Text>
      ) : null}
      <Animated.View style={[styles.field, { backgroundColor: colors.surfaceAlt }, ring]}>
        {icon ? <Icon name={icon} size={16} color={colors.muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          secureTextEntry={secureTextEntry && !reveal}
          {...rest}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[
            styles.input,
            { color: colors.ink },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            style,
          ]}
        />
        {suffix ? (
          <Text variant="small" tone="muted">
            {suffix}
          </Text>
        ) : null}
        {secureTextEntry ? (
          <ScalePressable accessibilityRole="button" accessibilityLabel="toggle" onPress={() => setReveal((v) => !v)} hitSlop={10}>
            <Icon name={reveal ? 'eye-off' : 'eye'} size={16} color={colors.muted} />
          </ScalePressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})
Input.displayName = 'Input'

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, minWidth: 0, width: '100%', fontFamily: fonts.regular, fontSize: 15, paddingVertical: 10 },
})
