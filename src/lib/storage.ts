import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

/**
 * Basit anahtar-değer deposu. Açılışta `hydrateStorage()` ile belleğe alınır,
 * sonrasında okumalar senkron (render sırasında kullanılabilir).
 * Token native'de Keychain/Keystore'da (SecureStore), web'de localStorage'da durur.
 */
const KEYS = ['diecut.locale', 'diecut.theme', 'diecut.guestId', 'diecut.onboarded', 'diecut.unit'] as const
const SECURE_KEYS = ['diecut.token'] as const

export type StorageKey = (typeof KEYS)[number] | (typeof SECURE_KEYS)[number]

const cache = new Map<string, string>()
const isWeb = Platform.OS === 'web'
const isSecure = (key: string) => (SECURE_KEYS as readonly string[]).includes(key)

const webStore = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export async function hydrateStorage(): Promise<void> {
  if (isWeb) {
    const store = webStore()
    for (const key of [...KEYS, ...SECURE_KEYS]) {
      const value = store?.getItem(key)
      if (value != null) cache.set(key, value)
    }
    return
  }
  const pairs = await AsyncStorage.multiGet([...KEYS])
  for (const [key, value] of pairs) if (value != null) cache.set(key, value)
  for (const key of SECURE_KEYS) {
    const value = await SecureStore.getItemAsync(key).catch(() => null)
    if (value != null) cache.set(key, value)
  }
}

export const storage = {
  get(key: StorageKey): string | null {
    return cache.get(key) ?? null
  },
  set(key: StorageKey, value: string | null): void {
    if (value == null) cache.delete(key)
    else cache.set(key, value)
    if (isWeb) {
      const store = webStore()
      if (value == null) store?.removeItem(key)
      else store?.setItem(key, value)
      return
    }
    if (isSecure(key)) {
      void (value == null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)).catch(() => undefined)
      return
    }
    void (value == null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(() => undefined)
  },
}
