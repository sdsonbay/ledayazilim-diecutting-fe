import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'
import { Text } from './Text'

/** Küçük sayı kutusu: yazarken taslak tutar, odak kaybında / Enter'da işler. */
export const NumberBox = ({
  label,
  unit,
  value,
  onCommit,
  onFocus,
  style,
}: {
  label: string
  unit: string
  value: number
  onCommit: (v: number) => void
  onFocus?: () => void
  style?: object
}) => {
  const { colors } = useTheme()
  const [draft, setDraft] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const text = draft ?? String(value)
  const commit = () => {
    const n = Number(text.replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(n) && n !== value) onCommit(n)
  }
  return (
    <View style={[styles.numberCell, style]}>
      <Text variant="small" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.numberBox, { backgroundColor: colors.surfaceAlt, borderColor: focused ? colors.ink : 'transparent' }]}>
        <TextInput
          value={text}
          onChangeText={setDraft}
          onFocus={() => {
            setFocused(true)
            onFocus?.()
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onSubmitEditing={commit}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={label}
          style={[styles.numberInput, { color: colors.ink }, { outlineStyle: 'none' } as object]}
        />
        <Text variant="small" tone="muted">
          {unit}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  numberCell: { flexBasis: '45%', flexGrow: 1, gap: 4 },
  numberBox: { flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: 10, gap: 6 },
  numberInput: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 15, paddingVertical: 4 },
})
