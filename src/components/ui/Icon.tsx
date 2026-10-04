import Feather from '@expo/vector-icons/Feather'
import type { ComponentProps } from 'react'
import { useTheme } from '../../theme/ThemeContext'

export type IconName = ComponentProps<typeof Feather>['name']

export const Icon = ({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) => {
  const { colors } = useTheme()
  return <Feather name={name} size={size} color={color ?? colors.ink} />
}
