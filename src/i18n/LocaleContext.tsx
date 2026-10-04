import { getLocales } from 'expo-localization'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { storage } from '../lib/storage'
import { catalogLabel } from '../lib/printMap'
import type { I18nText } from '../lib/types'
import { fill, messages, type Locale, type MessageKey } from './messages'

const readLocale = (): Locale => {
  const stored = storage.get('diecut.locale')
  if (stored === 'en' || stored === 'tr') return stored
  const device = getLocales()[0]?.languageCode?.toLowerCase() ?? 'tr'
  return device === 'tr' ? 'tr' : 'en'
}

/** API istekleri hook dışından da güncel dili okuyabilsin. */
let currentLocale: Locale = 'tr'
export const getCurrentLocale = (): Locale => currentLocale

interface LocaleValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  label: (text: I18nText) => string
}

const LocaleContext = createContext<LocaleValue | null>(null)

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>(() => (currentLocale = readLocale()))

  const setLocale = useCallback((next: Locale) => {
    currentLocale = next
    setLocaleState(next)
    storage.set('diecut.locale', next)
  }, [])

  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => fill(messages[locale][key] ?? messages.tr[key] ?? key, vars),
      label: (text) => catalogLabel(text, locale),
    }),
    [locale, setLocale],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useI18n = (): LocaleValue => {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LocaleProvider gerekli')
  return value
}
