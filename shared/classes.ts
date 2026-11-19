// The general classes of good works, used to filter events on the map and in
// the list. Every event type belongs to one class.
//
// To add a class: add it to EVENT_CLASSES, point event types at it in
// CLASS_OF_SUBTYPE, and give it an icon in mobile/src/theme/classes.ts (it
// shows a plain icon until then). Nothing in the database changes: an event's
// class comes from its type (or was chosen with a written tag: classOfEvent).

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

/** The event types, each with its class. */
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

export function isEventClass(x: unknown): x is EventClassId {
  return EVENT_CLASSES.some((c) => c.id === x);
}

/**
 * An event's class: its type's, or, when its tag is one a person wrote
 * (shared/tags.ts), the class they put it under.
 */
export function classOfEvent(e: { subtype: string; event_class?: EventClassId | null }): EventClassId {
  return CLASS_OF_SUBTYPE[e.subtype] ?? e.event_class ?? 'community';
}

/** The event types a form offers, with their class. */
export function eventSubtypes(): { id: string; event_class: EventClassId }[] {
  return Object.entries(CLASS_OF_SUBTYPE).map(([id, event_class]) => ({ id, event_class }));
}
