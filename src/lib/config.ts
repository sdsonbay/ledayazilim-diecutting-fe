import Constants from 'expo-constants'
import { Platform } from 'react-native'

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; appEnv?: string }

/**
 * API kökü.
 * - Web: aynı origin `/api/v1` (nginx kümedeki API servisine proxy'ler) — tek imaj dev ve prod'da çalışır.
 * - Native: build profiline göre `extra.apiUrl` (app.config.ts → EXPO_PUBLIC_API_URL).
 * Yerel geliştirmede EXPO_PUBLIC_API_URL her iki platformu da ezer.
 */
const fromEnv = process.env.EXPO_PUBLIC_API_URL

export const API_BASE = (
  fromEnv || (Platform.OS === 'web' ? '/api/v1' : extra.apiUrl || 'https://api-diecutting.ledayazilim.com/api/v1')
).replace(/\/$/, '')

export const APP_ENV = extra.appEnv ?? 'production'
