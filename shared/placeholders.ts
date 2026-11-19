// Points and levels. Owner's decisions (2026-11-18, the point made a minute on 2026-11-19):
// - A point is a minute of confirmed work, to the nearest minute
//   (rules.pointsForHours). An event's type no longer sets its points.
// - Ten levels, 7500 points (125 hours) in all; reaching level 5 (1500 points,
//   25 hours) unlocks proposing events. Everyone starts at level 0, before the first.
// - More levels come after the tenth; they are not set yet, and the profile
//   shows them hidden (HIDDEN_LEVELS_SHOWN) so people look forward to them.
// - Every level may report (بلاغ).
// - The levels' names are chosen later (mobile/src/i18n/strings.ts levelNames).

import type { Level } from './types';

/** Points needed for each level from 1 to 10: this level's share, added up below. */
const LEVEL_STEPS = [150, 210, 300, 390, 450, 600, 900, 1200, 1500, 1800];
/** The level that unlocks proposing events (1500 points). */
export const CREATE_EVENTS_LEVEL = 5;

export const LEVELS: Level[] = [
  { level: 0, min_points: 0, can_create_events: false, can_report: true },
  ...LEVEL_STEPS.map((_, i) => ({
    level: i + 1,
    min_points: LEVEL_STEPS.slice(0, i + 1).reduce((a, b) => a + b, 0),
    can_create_events: i + 1 >= CREATE_EVENTS_LEVEL,
    can_report: true,
  })),
];

/** How many of the levels to come the profile's road shows, hidden. */
export const HIDDEN_LEVELS_SHOWN = 3;

// Grace period after events.ends_at for recording an end time (Data_Model.md
// says "a short grace period" without a number).
export const END_GRACE_MINUTES = 15;
