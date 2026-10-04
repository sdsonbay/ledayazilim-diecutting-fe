import { router } from 'expo-router'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useFeedback } from '../components/ui'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { ApiError, api, type ExportFormat } from '../lib/api'
import type { ImposePayload } from '../lib/impose'
import { saveFile } from '../lib/saveFile'

export interface ExportBody {
  templateId?: string
  variables?: Record<string, unknown>
  dieline?: unknown
  impose?: ImposePayload
}

/** PDF/DXF/SVG indirme: kredi düşer, dosya kaydedilir/paylaşılır, kredi bitince yönlendirir. */
export function useExport() {
  const { setCredits, loggedIn } = useAuth()
  const { toast } = useFeedback()
  const { t, locale } = useI18n()
  const [busy, setBusy] = useState<ExportFormat | null>(null)

  const run = async (format: ExportFormat, body: ExportBody): Promise<boolean> => {
    setBusy(format)
    try {
      const result = await api.exportFile({ ...body, format })
      if (typeof result.credits === 'number' && Number.isFinite(result.credits)) setCredits(result.credits)
      await saveFile(result.bytes, result.filename, result.mime)
      toast(t('editor.exportDone', { file: result.filename }), 'success')
      return true
    } catch (err) {
      if (err instanceof ApiError && typeof err.credits === 'number') setCredits(err.credits)
      const code = err instanceof ApiError ? err.code : undefined
      const message = apiErrorMessage(err, locale, 'editor.exportFail', t)
      if (code === 'credits_exhausted_guest' || (code === 'credits_exhausted' && !loggedIn)) {
        toast(message, 'error', { label: t('editor.register'), onPress: () => router.push('/auth/register') })
      } else if (code === 'credits_exhausted') {
        toast(message, 'error', { label: t('nav.credits'), onPress: () => router.push('/credits') })
      } else {
        toast(message, 'error')
      }
      return false
    } finally {
      setBusy(null)
    }
  }

  return { run, busy }
}
