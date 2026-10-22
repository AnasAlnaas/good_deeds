// Design tokens — copied from DESIGN.md. Do not invent values in screens;
// if a value is missing, add it here (and to DESIGN.md) first.

export const colors = {
  primary: '#103048', // logo navy — buttons, header, active state
  primaryPressed: '#0A2134',
  primarySoft: '#E7ECF1',

  spiritual: '#0E7C74', // روحي
  mental: '#B45309', // عقلي
  physical: '#0A7A3E', // بدني

  link: '#1B7FB0', // links and info only
  brandGreen: '#12A150', // the logo itself only — never for buttons or text

  ink: '#111827',
  inkMuted: '#4B5563', // never lighter than this
  surface: '#FFFFFF',
  surfaceAlt: '#F4F5F6',
  border: '#DFE3E8',

  success: '#0A7A3E',
  warning: '#B45309',
  danger: '#B91C1C',
} as const;

// One family name per weight: custom fonts on Android ignore fontWeight.
export const fonts = {
  readex600: 'ReadexPro_600SemiBold',
  readex700: 'ReadexPro_700Bold',
  plex400: 'IBMPlexSansArabic_400Regular',
  plex500: 'IBMPlexSansArabic_500Medium',
  plex600: 'IBMPlexSansArabic_600SemiBold',
} as const;

export const type = {
  screenTitle: { fontSize: 26, fontFamily: fonts.readex700, lineHeight: 36 },
  sectionTitle: { fontSize: 19, fontFamily: fonts.readex600, lineHeight: 28 },
  body: { fontSize: 16, fontFamily: fonts.plex400, lineHeight: 26 },
  bodyStrong: { fontSize: 16, fontFamily: fonts.plex600, lineHeight: 26 },
  caption: { fontSize: 14, fontFamily: fonts.plex400, lineHeight: 22 },
  metric: { fontSize: 34, fontFamily: fonts.readex700, lineHeight: 40 },
} as const;

export type TypeVariant = keyof typeof type;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { card: 14, input: 10, pill: 999 } as const;

// Smallest touch target: supervisors record attendance standing in the sun.
export const touch = 48;

export const pillarColor = {
  spiritual: colors.spiritual,
  mental: colors.mental,
  physical: colors.physical,
} as const;
