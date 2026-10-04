import { File, Paths } from 'expo-file-system'
import type { LocalFile } from './api'

/** Metni yüklenebilir geçici dosyaya çevirir (native: önbellekte gerçek dosya). */
export function textFile(content: string, name: string, mimeType: string): LocalFile {
  const file = new File(Paths.cache, name)
  if (file.exists) file.delete()
  file.create()
  file.write(content)
  return { uri: file.uri, name, mimeType }
}
