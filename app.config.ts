import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * APP_ENV: development | preview | production (eas.json profillerinden gelir).
 * Native uygulamanın API adresi ortamla belirlenir; web aynı origin'deki /api'yi kullanır.
 */
const APP_ENV: string = process.env.APP_ENV ?? 'development'

const API: string = ({
  development: process.env.EXPO_PUBLIC_API_URL ?? 'https://dev-api-diecutting.ledayazilim.com/api/v1',
  preview: 'https://dev-api-diecutting.ledayazilim.com/api/v1',
  production: 'https://api-diecutting.ledayazilim.com/api/v1',
} as Record<string, string>)[APP_ENV] ?? 'https://api-diecutting.ledayazilim.com/api/v1'

/** expo.dev/accounts/leda-yazilim-2/projects/leda-diecutting */
const EAS_PROJECT_ID: string = process.env.EAS_PROJECT_ID || '788acf67-f577-43a7-9069-e8bc9f6bb596'

const suffix = APP_ENV === 'production' ? '' : `.${APP_ENV === 'preview' ? 'preview' : 'dev'}`
const nameSuffix = APP_ENV === 'production' ? '' : APP_ENV === 'preview' ? ' (Preview)' : ' (Dev)'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: `Leda Diecutting${nameSuffix}`,
  owner: 'leda-yazilim-2',
  slug: 'leda-diecutting',
  scheme: 'ledadiecutting',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: `com.ledayazilim.diecutting${suffix}`,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSPhotoLibraryUsageDescription: 'Kutu üzerinde baskı önizlemesi için görsel seçmenize izin verir.',
    },
  },
  android: {
    package: `com.ledayazilim.diecutting${suffix}`,
    adaptiveIcon: {
      backgroundColor: '#0B0B0C',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
    bundler: 'metro',
    name: 'Leda Diecutting',
    shortName: 'Diecutting',
    themeColor: '#F6F5F2',
    backgroundColor: '#F6F5F2',
    description: 'Parametrik bıçak izi: ölçünü gir, 3D katlanışını gör, PDF / DXF / SVG indir.',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        backgroundColor: '#F6F5F2',
        dark: { backgroundColor: '#09090A' },
      },
    ],
    [
      'expo-image-picker',
      { photosPermission: 'Kutu üzerinde baskı önizlemesi için görsel seçmenize izin verir.' },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: APP_ENV,
    apiUrl: API,
    eas: { projectId: EAS_PROJECT_ID },
  },
  updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
  runtimeVersion: { policy: 'appVersion' },
})
