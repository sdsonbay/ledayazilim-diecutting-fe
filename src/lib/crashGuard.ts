import { Platform } from 'react-native'

/**
 * Native'de render dışında (zamanlayıcı, çizim döngüsü, olay geri çağrısı) atılan yakalanmamış
 * hata uygulamayı kapatır ("Unhandled JS Exception"). Uygulama arayüzü hazırsa bunun yerine
 * hata ekranı gösterilir: kullanıcı yeniden başlatabilir ve hata metnini iletebilir.
 */
type Listener = (error: Error) => void

interface ErrorUtilsLike {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void
}

const listeners = new Set<Listener>()
let installed = false

export const installCrashGuard = () => {
  if (installed || Platform.OS === 'web' || __DEV__) return
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils
  if (!utils?.getGlobalHandler || !utils.setGlobalHandler) return
  installed = true
  const previous = utils.getGlobalHandler()
  utils.setGlobalHandler((error, isFatal) => {
    // Arayüz henüz yoksa (açılış) varsayılan davranış: sistem hata ekranı.
    if (!isFatal || listeners.size === 0) {
      previous(error, isFatal)
      return
    }
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[crash]', err)
    listeners.forEach((l) => l(err))
  })
}

export const onCrash = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Kullanıcıya gösterilecek kısa hata metni (mesaj + yığının ilk satırları). */
export const crashText = (error: Error): string =>
  [
    `${error.name}: ${error.message}`,
    ...(error.stack ?? '')
      .split('\n')
      .slice(1, 7)
      .map((l) => l.trim()),
  ]
    .filter(Boolean)
    .join('\n')
