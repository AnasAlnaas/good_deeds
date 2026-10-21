// ⚠️ PLACEHOLDER VALUES — Points_And_Levels.md was not available when the demo
// was built. Everything in this file is a stand-in and must be replaced with
// the numbers from that file before anything real is built on it.
// Build_Plan.md: "do not let the tool decide the points formula".

import type { Level } from '@/data/types';

// base_points per event subtype (the "fixed table" in Points_And_Levels.md).
export const BASE_POINTS_BY_SUBTYPE: Record<string, number> = {
  street_cleanup: 30,
  beach_cleanup: 30,
  tree_planting: 30,
  charity_kitchen: 25,
  food_baskets: 25,
  quran_circle: 20,
  tutoring: 20,
  first_aid_course: 20,
  elderly_visit: 15,
  orphanage_visit: 20,
  mosque_cleaning: 25,
  traffic_awareness: 15,
  water_coolers: 30,
};

// Levels by total points. Level 5 unlocks creating events (master file).
export const LEVELS: Level[] = [
  { level: 1, min_points: 0, can_create_events: false, can_report: true },
  { level: 2, min_points: 50, can_create_events: false, can_report: true },
  { level: 3, min_points: 150, can_create_events: false, can_report: true },
  { level: 4, min_points: 300, can_create_events: false, can_report: true },
  { level: 5, min_points: 500, can_create_events: true, can_report: true },
  { level: 6, min_points: 800, can_create_events: true, can_report: true },
  { level: 7, min_points: 1200, can_create_events: true, can_report: true },
];

// Grace period after events.ends_at for recording an end time (Data_Model.md
// says "a short grace period" without a number).
export const END_GRACE_MINUTES = 15;
