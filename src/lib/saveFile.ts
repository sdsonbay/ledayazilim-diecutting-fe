import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/** Native: dosyayı önbelleğe yazar ve paylaşım menüsünü açar (Dosyalar'a kaydet, AirDrop, e-posta…). */
export async function saveFile(bytes: Uint8Array, filename: string, mime: string): Promise<void> {
  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.create()
  file.write(bytes)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename, UTI: utiOf(filename) })
  }
}

const utiOf = (filename: string): string | undefined => {
  if (filename.endsWith('.pdf')) return 'com.adobe.pdf'
  if (filename.endsWith('.svg')) return 'public.svg-image'
  return undefined
}
