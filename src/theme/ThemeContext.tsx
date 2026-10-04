import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { storage } from '../lib/storage'
import { palettes, type ColorScheme, type Palette } from './tokens'

export type ThemePreference = 'system' | ColorScheme

interface ThemeValue {
  scheme: ColorScheme
  colors: Palette
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

const readPreference = (): ThemePreference => {
  const stored = storage.get('diecut.theme')
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    storage.set('diecut.theme', next === 'system' ? null : next)
  }, [])

  const toggle = useCallback(() => setPreference(scheme === 'dark' ? 'light' : 'dark'), [scheme, setPreference])

  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: palettes[scheme], preference, setPreference, toggle }),
    [scheme, preference, setPreference, toggle],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = (): ThemeValue => {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider gerekli')
  return value
}
