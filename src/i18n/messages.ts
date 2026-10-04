import { messages as base } from './messages.base'
import { appMessages } from './messages.app'

export type Locale = 'tr' | 'en'

export const messages = {
  tr: { ...base.tr, ...appMessages.tr },
  en: { ...base.en, ...appMessages.en },
} as const

export type MessageKey = keyof typeof messages.tr

export const fill = (template: string, vars?: Record<string, string | number>): string => {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}
