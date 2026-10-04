import type { LocalFile } from './api'

export function textFile(content: string, name: string, mimeType: string): LocalFile {
  const blob = new Blob([content], { type: mimeType })
  return { uri: '', name, mimeType, file: blob }
}
