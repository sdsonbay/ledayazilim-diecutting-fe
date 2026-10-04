import * as Sharing from 'expo-sharing'

/** Native: anlık görüntü dosyasını paylaşım menüsüyle açar. */
export async function shareImage(uri: string, filename: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: filename, UTI: 'public.png' })
}
