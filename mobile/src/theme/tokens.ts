// Design tokens — copied from DESIGN.md. Do not invent values in screens;
// if a value is missing, add it here (and to DESIGN.md) first.

export const colors = {
  primary: '#103048', // logo navy — buttons, active state, dark chips
  primaryPressed: '#0A2134',
  primarySoft: '#E3E9EF',

  // The green accent: map pins, the chosen filter, highlight cards, progress.
  // Text and icons on it are accentInk, never white (white on this green is unreadable).
  accent: '#4ADE80',
  accentPressed: '#3BCB6E',
  accentSoft: '#DCFCE7',
  accentInk: '#0B3B1F',

  // The map's blue-grey and the frosted panels floating over it.
  slate: '#3E5366',
  glass: 'rgba(255, 255, 255, 0.86)',

  link: '#1B7FB0', // links and info only
  brandGreen: '#12A150', // the logo itself only — never for buttons or text

  ink: '#111827',
  inkMuted: '#4B5563', // never lighter than this
  surface: '#FFFFFF', // cards
  surfaceAlt: '#ECEFF2', // the page behind the cards
  border: '#DCE1E6',

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
  // The one big number on a green highlight card.
  hero: { fontSize: 48, fontFamily: fonts.readex700, lineHeight: 58 },
} as const;

export type TypeVariant = keyof typeof type;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { card: 24, input: 16, pill: 999 } as const;

// Smallest touch target: supervisors record attendance standing in the sun.
export const touch = 48;

// A soft lift for what floats over the map or the page.
export const shadow = {
  shadowColor: '#0B1A28',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
} as const;
