// Design tokens — copied from DESIGN.md. Do not invent values in screens;
// if a value is missing, add it here (and to DESIGN.md) first.

// The palette follows the logo (assets/brand/logo-source.jpg, 2026-11-05): a
// forest-green tree in a sage ring on paper. Forest leads, cream is the page,
// and a muted gold marks what is earned: points and levels. Keep gold rare.
export const colors = {
  primary: '#1E5E3B', // the logo's forest green: buttons, active state, titles on cream (7.6:1 with white)
  primaryPressed: '#164A2E',
  primarySoft: '#E5EDE4', // a sage tint: pressed quiet buttons, disabled, soft fills

  // The gold accent: what is earned (points, level cards, progress, the confirmed seal) and event pins.
  // Text and icons on it are accentInk, never white (white on gold is unreadable; accentInk is 5.6:1).
  accent: '#CDA650',
  accentPressed: '#B8913E',
  accentSoft: '#F7EED6',
  accentInk: '#3A2B08',

  // The map's green-grey and the frosted panels floating over it.
  slate: '#3D5146',
  glass: 'rgba(252, 250, 244, 0.9)',

  link: '#1F6E8C', // links and info only
  brandGreen: '#1E5E3B', // the logo's tree
  brandSage: '#9BB896', // the logo's ring: decoration only — never text (too light)

  ink: '#17231D', // a green-black
  inkMuted: '#4D5A52', // never lighter than this (6.4:1 on the cream page)
  surface: '#FFFDF8', // cards: warm white
  surfaceAlt: '#F4F0E6', // the page behind the cards: the logo's paper
  border: '#E4DDCB', // hairlines around cards and fields

  success: '#1F7A45',
  warning: '#A85A06',
  danger: '#B42318',
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
  shadowColor: '#2B2414',
  shadowOpacity: 0.14,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
} as const;

// Cards on the cream page: a hairline (colors.border) and a barely-there lift.
export const cardShadow = {
  shadowColor: '#2B2414',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
} as const;
