export type ColorScheme = 'light' | 'dark'

const light = {
  bg: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEDE8',
  elevated: '#FFFFFF',
  stage: '#ECEAE4',
  ink: '#0B0B0C',
  inkSoft: '#3A3A3D',
  muted: '#86868B',
  faint: '#B7B5AF',
  line: 'rgba(11, 11, 12, 0.08)',
  lineStrong: 'rgba(11, 11, 12, 0.16)',
  primary: '#0B0B0C',
  onPrimary: '#FFFFFF',
  accent: '#E5402A',
  accentSoft: 'rgba(229, 64, 42, 0.10)',
  onAccent: '#FFFFFF',
  crease: '#2563EB',
  success: '#16804A',
  successSoft: 'rgba(22, 128, 74, 0.10)',
  warning: '#B7791F',
  warningSoft: 'rgba(183, 121, 31, 0.12)',
  danger: '#C8321F',
  dangerSoft: 'rgba(200, 50, 31, 0.10)',
  glass: 'rgba(246, 245, 242, 0.78)',
  scrim: 'rgba(11, 11, 12, 0.38)',
  shadow: 'rgba(17, 17, 17, 0.10)',
  skeleton: '#E7E5E0',
  scene: '#F1F0EC',
}

const dark: typeof light = {
  bg: '#09090A',
  surface: '#141416',
  surfaceAlt: '#1C1C1F',
  elevated: '#1E1E21',
  stage: '#000000',
  ink: '#F5F5F7',
  inkSoft: '#D1D1D6',
  muted: '#8E8E93',
  faint: '#48484C',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.16)',
  primary: '#F5F5F7',
  onPrimary: '#09090A',
  accent: '#FF5A3D',
  accentSoft: 'rgba(255, 90, 61, 0.14)',
  onAccent: '#FFFFFF',
  crease: '#60A5FA',
  success: '#34C77B',
  successSoft: 'rgba(52, 199, 123, 0.14)',
  warning: '#F5B544',
  warningSoft: 'rgba(245, 181, 68, 0.14)',
  danger: '#FF6B57',
  dangerSoft: 'rgba(255, 107, 87, 0.14)',
  glass: 'rgba(9, 9, 10, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  skeleton: '#1C1C1F',
  scene: '#050505',
}

export const palettes = { light, dark }
export type Palette = typeof light

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 52, lineHeight: 54, letterSpacing: -1 },
  display: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.6 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
} as const

export type TypeVariant = keyof typeof type

/** Hareket: tüm geçişler aynı eğri ve süre ailesini kullanır. */
export const motion = {
  fast: 160,
  base: 240,
  slow: 420,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 140, mass: 1 },
} as const

export const breakpoints = { wide: 900, xwide: 1280 } as const
