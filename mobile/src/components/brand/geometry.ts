// Logo geometry, drawn on a 64×64 grid. The same paths feed the static mark,
// the animated mark and the exported SVG files in assets/brand — change them
// here and re-export the files, never one without the other.
// The mark is a map pin (events live on the map) with a seedling growing in
// it (good deeds that grow). It never mirrors in RTL.

export const MARK_GRID = 64;

export const PIN = 'M32 61C26.5 53.5 11 41.5 11 25A21 21 0 0 1 53 25C53 41.5 37.5 53.5 32 61Z';
export const STEM = 'M32 38V26';
export const STEM_WIDTH = 3.4;
export const LEAF_SMALL = 'M32 31C25 31.5 21.5 27.5 21.5 21.5C28 21.5 32 25 32 31Z';
export const LEAF_BIG = 'M32 27C32.5 19.5 37 15.5 43 15.5C43 22.5 38.5 27 32 27Z';

// Pivot points as fractions of the grid, for animating each part from its base.
export const PIVOT = {
  pinTip: { x: 32 / 64, y: 61 / 64 },
  stemBase: { x: 32 / 64, y: 38 / 64 },
  leafSmallBase: { x: 32 / 64, y: 31 / 64 },
  leafBigBase: { x: 32 / 64, y: 27 / 64 },
} as const;

// The pin alone, cropped tight, for map markers in the motion graphics.
export const PIN_BOX = { viewBox: '11 4 42 57', ratio: 57 / 42, dot: { cx: 32, cy: 25, r: 8 } } as const;

export const pct = (f: number) => `${f * 100}%`;
