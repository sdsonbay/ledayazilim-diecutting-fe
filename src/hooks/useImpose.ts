import { useEffect, useMemo, useState } from 'react'
import { apiErrorMessage } from '../i18n/errors'
import { useI18n } from '../i18n/LocaleContext'
import { ApiError, api } from '../lib/api'
import {
  DEFAULT_SHEETS,
  composeLocalImposeSvg,
  defaultImpose,
  imposeCost,
  packImposeLayout,
  slimDieline,
  type ImposeLayout,
  type ImposePayload,
  type ImposeResponse,
} from '../lib/impose'
import type { DielineResponse } from '../lib/types'

const nearly = (a: number, b: number) => Math.abs(a - b) <= 0.2

/**
 * Tabaka yerleşimi: yerel paketleme anında sonuç verir, API sonucu gelince
 * (ölçü çizgileri, gerçek kesim uzunluğu) onunla değiştirilir.
 */
export function useImpose({
  enabled,
  dieline,
  templateId,
  values,
  theme,
}: {
  enabled: boolean
  dieline: DielineResponse | null
  templateId?: string
  values?: Record<string, unknown>
  theme: 'light' | 'dark'
}) {
  const { t, locale } = useI18n()
  const [cfg, setCfg] = useState<ImposePayload>(defaultImpose)
  // API sonucu hangi isteğe aitse o anahtarla saklanır; girdiler değişince kendiliğinden geçersizleşir.
  const [apiResult, setApiResult] = useState<{ key: string; svg: string; layout: ImposeLayout } | null>(null)
  const [sheets, setSheets] = useState(DEFAULT_SHEETS)
  const [qty, setQty] = useState(1000)
  const [sheetPrice, setSheetPrice] = useState(0)
  const [knifePrice, setKnifePrice] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const bounds = dieline?.bounds
  const hasBounds = Boolean(bounds && bounds.width > 0 && bounds.height > 0)
  const hasPaths = Boolean(dieline?.paths && dieline.paths.length > 0)
  const catalogTemplate = Boolean(templateId && values)
  const canLocal = enabled && hasBounds
  const canApi = canLocal && (hasPaths || catalogTemplate)
  const valuesKey = JSON.stringify(values ?? null)

  const local = useMemo<ImposeResponse | null>(() => {
    if (!canLocal || !bounds || !dieline) return null
    const layout = packImposeLayout(bounds, cfg, dieline.stats)
    return { svg: composeLocalImposeSvg(dieline.svg ?? '', layout, cfg, theme), layout, presets: DEFAULT_SHEETS }
  }, [canLocal, bounds, cfg, dieline, theme])

  const requestKey = JSON.stringify([cfg, theme, templateId, valuesKey, dieline?.templateId, bounds?.width, bounds?.height])

  // Bıçak izi tabakaya sığmadığında paketleyici tabakayı büyütür; formu bu ölçüye eşitle.
  useEffect(() => {
    if (!local?.layout.sheetAdjusted) return
    const { width: w, height: h } = local.layout.sheet
    if (nearly(cfg.sheetWidth, w) && nearly(cfg.sheetHeight, h)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCfg((c) => ({ ...c, sheetId: local.layout.sheetId ?? 'custom', sheetWidth: w, sheetHeight: h }))
  }, [local, cfg.sheetWidth, cfg.sheetHeight])

  const exportSource = () => ({
    templateId: catalogTemplate ? templateId : undefined,
    variables: catalogTemplate ? values : undefined,
    dieline: !catalogTemplate && hasPaths && dieline ? slimDieline(dieline) : undefined,
  })

  useEffect(() => {
    if (!canApi) return
    const handle = setTimeout(() => {
      setBusy(true)
      void api
        .impose({ ...exportSource(), impose: cfg, theme })
        .then((next) => {
          setApiResult({ key: requestKey, svg: next.svg, layout: next.layout })
          if (next.presets?.length) setSheets(next.presets)
          setError(null)
          setErrorCode(null)
        })
        .catch((err: unknown) => {
          setError(apiErrorMessage(err, locale, 'editor.drawFail', t))
          setErrorCode(err instanceof ApiError ? (err.code ?? null) : null)
        })
        .finally(() => setBusy(false))
    }, 240)
    return () => clearTimeout(handle)
    // exportSource bu değerlerden türetilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApi, requestKey, locale, t])

  const fresh = apiResult?.key === requestKey ? apiResult : null
  const result = useMemo<ImposeResponse | null>(
    () => (local ? { svg: fresh?.svg ?? local.svg, layout: fresh?.layout ?? local.layout, presets: sheets } : null),
    [local, fresh, sheets],
  )

  const cost = result ? imposeCost(result.layout, qty, sheetPrice, knifePrice) : null
  const alts = useMemo(
    () => (result ? [...result.layout.alternatives].sort((a, b) => b.copies - a.copies || a.rotation - b.rotation) : []),
    [result],
  )

  return {
    cfg,
    setCfg,
    result,
    sheets,
    qty,
    setQty,
    sheetPrice,
    setSheetPrice,
    knifePrice,
    setKnifePrice,
    busy,
    error,
    errorCode,
    cost,
    alts,
    exportBody: () => ({ ...exportSource(), impose: cfg }),
  }
}

export type ImposeState = ReturnType<typeof useImpose>
