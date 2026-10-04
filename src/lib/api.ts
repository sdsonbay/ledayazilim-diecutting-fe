import { Platform } from 'react-native'
import { getCurrentLocale } from '../i18n/LocaleContext'
import { API_BASE } from './config'
import type { ImposePayload, ImposeResponse } from './impose'
import { storage } from './storage'
import { textFile } from './textFile'
import type {
  CatalogBranch,
  CatalogFacet,
  DctCoverage,
  DielineResponse,
  PrintFinish,
  PrintTransform,
  SavedDesign,
  Session,
  TemplateDetail,
  TemplateSummary,
} from './types'
import { randomUuid, UUID_RE } from './uuid'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly credits: number | undefined
  readonly guest: boolean | undefined
  readonly key: string | undefined

  constructor(message: string, status: number, extra?: { code?: string; credits?: number; guest?: boolean; key?: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = extra?.code
    this.credits = extra?.credits
    this.guest = extra?.guest
    this.key = extra?.key
  }
}

/** Misafir kimliği: indirme kredisi cihaz başına takip edilir. */
export const getGuestId = (): string => {
  const existing = storage.get('diecut.guestId')
  if (existing && UUID_RE.test(existing)) return existing
  const id = randomUuid()
  storage.set('diecut.guestId', id)
  return id
}

export const getToken = (): string | null => storage.get('diecut.token')
export const setToken = (token: string | null): void => storage.set('diecut.token', token)

const parseError = async (response: Response): Promise<ApiError> => {
  const locale = getCurrentLocale()
  let message = locale === 'en' ? `Request failed (${response.status})` : `İstek başarısız (${response.status})`
  let body: { error?: string; code?: string; credits?: number; guest?: boolean; key?: string } = {}
  try {
    body = (await response.json()) as typeof body
    if (body.error) message = body.error
  } catch {
    /* gövde JSON değil */
  }
  return new ApiError(message, response.status, body)
}

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers)
  headers.set('X-Diecut-Guest', getGuestId())
  headers.set('Accept-Language', getCurrentLocale())
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(getCurrentLocale() === 'en' ? 'No connection to the server' : 'Sunucuya ulaşılamıyor', 0, {
      code: 'network',
    })
  }
  if (!response.ok) throw await parseError(response)
  return response
}

const json = async <T,>(path: string, init?: RequestInit): Promise<T> => (await request(path, init)).json() as Promise<T>

export const previewUrl = (templateId: string, theme: 'light' | 'dark' = 'light'): string =>
  `${API_BASE}/templates/${encodeURIComponent(templateId)}/preview.svg?theme=${theme}`

export interface TemplatePage {
  items: TemplateSummary[]
  total: number
  catalogTotal: number
  page: number
  pageCount: number
  categories: CatalogFacet[]
  materials: CatalogFacet[]
  tree: CatalogBranch[]
}

export interface TemplateFilters {
  category?: string
  material?: string
  page?: number
  limit?: number
  ids?: string[]
}

export type ExportFormat = 'pdf' | 'svg' | 'dxf'

export interface ExportResult {
  bytes: Uint8Array
  filename: string
  mime: string
  credits: number | undefined
}

/** Yerel dosyadan (DocumentPicker / ImagePicker) multipart parçası. */
export interface LocalFile {
  uri: string
  name: string
  mimeType?: string
  /** Web'de picker gerçek File nesnesi verir. */
  file?: Blob
}

const appendFile = (form: FormData, field: string, file: LocalFile) => {
  if (Platform.OS === 'web' && file.file) {
    form.append(field, file.file, file.name)
    return
  }
  // React Native FormData: { uri, name, type } nesnesini dosya olarak yükler.
  form.append(field, { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob)
}

export interface CreditPackage {
  id: string
  credits: number
  priceTry: number
  name: { tr: string; en: string }
  blurb: { tr: string; en: string }
}

export interface ApiKeyInfo {
  publicKey: string
  secretHint: string
  createdAt: string
  lastUsedAt: string | null
}

export interface ApiKeyCreated extends ApiKeyInfo {
  secretKey: string
}

export interface SaveDesignInput {
  id?: string
  templateId: string
  name: string
  params: Record<string, unknown>
  printTransform: PrintTransform
  finishSettings?: PrintFinish
  artwork?: LocalFile | null
  clearArtwork?: boolean
}

export const api = {
  session: () => json<Session>('/session'),

  login: (email: string, password: string) =>
    json<{ token: string; session: Session }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (input: { email: string; password: string; name?: string }) =>
    json<{ token: string; session: Session }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  templates: (query = '', filters: TemplateFilters = {}) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (filters.category) params.set('category', filters.category)
    if (filters.material) params.set('material', filters.material)
    if (filters.page) params.set('page', String(filters.page))
    if (filters.limit) params.set('limit', String(filters.limit))
    if (filters.ids?.length) params.set('ids', filters.ids.join(','))
    const qs = params.toString()
    return json<TemplatePage>(`/templates${qs ? `?${qs}` : ''}`)
  },

  template: (id: string) => json<TemplateDetail>(`/templates/${encodeURIComponent(id)}`),

  dctCoverage: () => json<DctCoverage>('/catalog/dct-coverage'),

  generate: (templateId: string, variables: Record<string, unknown>) =>
    json<DielineResponse>('/dielines', { method: 'POST', body: JSON.stringify({ templateId, variables }) }),

  impose: (body: {
    templateId?: string
    variables?: Record<string, unknown>
    dieline?: unknown
    impose: ImposePayload
    theme: 'light' | 'dark'
  }) => json<ImposeResponse>('/dielines/impose', { method: 'POST', body: JSON.stringify(body) }),

  importDieline: (file: LocalFile) => {
    const body = new FormData()
    appendFile(body, 'file', file)
    return json<DielineResponse>('/dielines/import', { method: 'POST', body })
  },

  /** SVG metninden içe aktarma (Stüdyo çizimi). */
  importSvg: (svg: string, name = 'studio.svg') => api.importDieline(textFile(svg, name, 'image/svg+xml')),

  exportFile: async (body: {
    templateId?: string
    variables?: Record<string, unknown>
    format: ExportFormat
    impose?: ImposePayload
    dieline?: unknown
  }): Promise<ExportResult> => {
    const response = await request('/dielines/export', { method: 'POST', body: JSON.stringify(body) })
    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `dieline.${body.format}`
    const remaining = response.headers.get('x-diecut-credits')
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      filename,
      mime: response.headers.get('content-type') ?? 'application/octet-stream',
      credits: remaining ? Number(remaining) : undefined,
    }
  },

  favorites: async () => (await json<{ items: string[] }>('/favorites')).items,
  addFavorite: async (templateId: string) =>
    (await json<{ items: string[] }>(`/favorites/${encodeURIComponent(templateId)}`, { method: 'PUT' })).items,
  removeFavorite: async (templateId: string) =>
    (await json<{ items: string[] }>(`/favorites/${encodeURIComponent(templateId)}`, { method: 'DELETE' })).items,

  designs: async () => (await json<{ items: SavedDesign[] }>('/designs')).items,
  getDesign: (id: string) => json<SavedDesign>(`/designs/${encodeURIComponent(id)}`),
  saveDesign: (input: SaveDesignInput) => {
    const body = new FormData()
    if (input.id) body.append('id', input.id)
    body.append('templateId', input.templateId)
    body.append('name', input.name)
    body.append('params', JSON.stringify(input.params))
    body.append('printTransform', JSON.stringify(input.printTransform))
    if (input.finishSettings) {
      const { masks: _masks, ...finish } = input.finishSettings
      body.append('finishSettings', JSON.stringify(finish))
    }
    if (input.clearArtwork) body.append('clearArtwork', '1')
    if (input.artwork) appendFile(body, 'artwork', input.artwork)
    return json<SavedDesign>('/designs', { method: 'POST', body })
  },
  deleteDesign: async (id: string) => {
    await request(`/designs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  /** Kayıtlı baskı görseli — `data:` URI (her iki platformda Image/three ile açılır). */
  designArtwork: async (id: string): Promise<string> => {
    const response = await request(`/designs/${encodeURIComponent(id)}/artwork`)
    const mime = response.headers.get('content-type') ?? 'image/jpeg'
    const bytes = new Uint8Array(await response.arrayBuffer())
    return `data:${mime};base64,${toBase64(bytes)}`
  },

  creditPackages: () => json<{ items: CreditPackage[]; provider: string }>('/credits/packages'),
  purchaseCredits: (packageId: string) =>
    json<{ credits: number; packageId: string; granted: number; session: Session }>('/credits/purchase', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    }),

  apiKey: () => json<{ key: ApiKeyInfo | null }>('/me/keys'),
  regenerateApiKey: () => json<ApiKeyCreated>('/me/keys/regenerate', { method: 'POST' }),
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}
