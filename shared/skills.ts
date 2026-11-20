// Skills and matching (owner's decisions, 2026-11-20). Volunteers choose
// their skills (from a list admins add to) and the classes of good works they
// like; an event names the skills that help (suggested from its type, the
// proposer may change them). matchScore ranks upcoming events for a person;
// the main screen will show them later. A person's skills are seen only by
// them and the admins.

import type { EventClassId } from './classes';

/** The list the association starts with; admins add more in the panel (skills table). */
export const STARTING_SKILLS: { id: string; name_ar: string; name_en: string }[] = [
  { id: 'teaching', name_ar: 'تدريس', name_en: 'Teaching' },
  { id: 'first_aid', name_ar: 'إسعافات أولية', name_en: 'First aid' },
  { id: 'nursing', name_ar: 'تمريض', name_en: 'Nursing' },
  { id: 'driving', name_ar: 'قيادة سيارة', name_en: 'Driving' },
  { id: 'photography', name_ar: 'تصوير', name_en: 'Photography' },
  { id: 'design', name_ar: 'تصميم', name_en: 'Design' },
  { id: 'cooking', name_ar: 'طبخ', name_en: 'Cooking' },
  { id: 'carpentry', name_ar: 'نجارة وصيانة', name_en: 'Carpentry and repairs' },
  { id: 'farming', name_ar: 'زراعة', name_en: 'Farming' },
  { id: 'organizing', name_ar: 'تنظيم فعاليات', name_en: 'Organising events' },
  { id: 'languages', name_ar: 'لغات أجنبية', name_en: 'Foreign languages' },
  { id: 'quran', name_ar: 'حفظ القرآن وتجويده', name_en: 'Quran memorisation and tajweed' },
  { id: 'children', name_ar: 'العمل مع الأطفال', name_en: 'Working with children' },
  { id: 'computers', name_ar: 'حاسوب وتقنية', name_en: 'Computers and tech' },
];

/** The skills an event type suggests in the form (the proposer may change them). */
export const SKILLS_OF_SUBTYPE: Record<string, string[]> = {
  street_cleanup: ['organizing'],
  beach_cleanup: ['organizing'],
  tree_planting: ['farming'],
  mosque_cleaning: ['carpentry'],
  first_aid_course: ['first_aid', 'nursing', 'teaching'],
  traffic_awareness: ['teaching', 'design'],
  quran_circle: ['quran', 'teaching', 'children'],
  tutoring: ['teaching', 'children'],
  charity_kitchen: ['cooking', 'organizing'],
  food_baskets: ['driving', 'organizing'],
  water_coolers: ['carpentry', 'driving'],
  elderly_visit: ['nursing'],
  orphanage_visit: ['children'],
};

export const MAX_SKILLS_PER_PERSON = 10;
export const MAX_SKILLS_PER_EVENT = 6;
export const SKILL_NAME_MAX = 60;

/** The suggested skills of a type that are still offered (an admin may have hidden one). */
export function suggestedSkills(subtype: string, offered: string[]): string[] {
  return (SKILLS_OF_SUBTYPE[subtype] ?? []).filter((id) => offered.includes(id));
}

/**
 * How well an event fits a person: each skill of theirs it needs counts 2, its
 * class among those they like counts 1. 0 = no fit. The caller keeps only
 * events the person may join, and orders ties by the soonest.
 */
export function matchScore(
  event: { event_class: EventClassId; skill_ids: string[] },
  person: { skill_ids: string[]; classes: EventClassId[] },
): number {
  const skills = event.skill_ids.filter((id) => person.skill_ids.includes(id)).length;
  return skills * 2 + (person.classes.includes(event.event_class) ? 1 : 0);
}

/** A skill list as sent: known ids only, each once, at most `max`. */
export function cleanSkillIds(ids: unknown, offered: string[], max: number): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && offered.includes(x)))].slice(0, max);
}
