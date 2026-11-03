// The general classes of good works, used to filter events on the map and in
// the list. Every event type belongs to one class.
//
// To add a class: add it to EVENT_CLASSES, point event types at it in
// CLASS_OF_SUBTYPE, and give it an icon in mobile/src/theme/classes.ts (it
// shows a plain icon until then). Nothing in the database changes: an event's
// class comes from its type.

import { BASE_POINTS_BY_SUBTYPE } from './placeholders';

export type EventClassId = 'environment' | 'health' | 'learning' | 'community';

export interface EventClass {
  id: EventClassId;
  name_ar: string;
  name_en: string;
}

/** In the order the filter shows them. */
export const EVENT_CLASSES: EventClass[] = [
  { id: 'environment', name_ar: 'بيئة', name_en: 'Environment' },
  { id: 'health', name_ar: 'صحة', name_en: 'Health' },
  { id: 'learning', name_ar: 'تعلُّم وتعليم', name_en: 'Learning' },
  { id: 'community', name_ar: 'مجتمع', name_en: 'Community' },
];

/** The class of each event type (BASE_POINTS_BY_SUBTYPE in placeholders.ts lists the types). */
export const CLASS_OF_SUBTYPE: Record<string, EventClassId> = {
  street_cleanup: 'environment',
  beach_cleanup: 'environment',
  tree_planting: 'environment',
  mosque_cleaning: 'environment',
  first_aid_course: 'health',
  traffic_awareness: 'health',
  quran_circle: 'learning',
  tutoring: 'learning',
  charity_kitchen: 'community',
  food_baskets: 'community',
  water_coolers: 'community',
  elderly_visit: 'community',
  orphanage_visit: 'community',
};

/** A type missing from CLASS_OF_SUBTYPE counts as community work. */
export function classOf(subtype: string): EventClassId {
  return CLASS_OF_SUBTYPE[subtype] ?? 'community';
}

/** The event types a form offers, with their fixed points and their class. */
export function eventSubtypes(): { id: string; base_points: number; event_class: EventClassId }[] {
  return Object.entries(BASE_POINTS_BY_SUBTYPE).map(([id, base_points]) => ({ id, base_points, event_class: classOf(id) }));
}
