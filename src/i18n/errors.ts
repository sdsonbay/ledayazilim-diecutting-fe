import { ApiError } from '../lib/api'
import { fill, messages, type Locale, type MessageKey } from './messages'

const errorKey = (code: string | undefined): MessageKey | null => {
  if (!code) return null
  const key = `error.${code}` as MessageKey
  return key in messages.tr ? key : null
}

export const apiErrorMessage = (
  err: unknown,
  locale: Locale,
  fallback: MessageKey,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string => {
  if (err instanceof ApiError) {
    const key = errorKey(err.code)
    if (key) return t(key, { n: err.status, key: err.key ?? '' })
    if (err.message) return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fill(messages[locale][fallback])
}

export const isCreditsError = (err: unknown): err is ApiError =>
  err instanceof ApiError && (err.code === 'credits_exhausted' || err.code === 'credits_exhausted_guest' || err.status === 402)
