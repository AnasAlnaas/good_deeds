// Badges (owner's decisions, 2026-11-19/20). Each is earned once, from the
// person's own record: confirmed events (in all, in one class, across classes,
// month after month, in the blessed times) and lessons learned. Pure: the
// server and the offline demo call badgesEarned with the rows, and store the
// new ones (a push and a celebration tell the person).

import { EVENT_CLASSES, type EventClassId } from './classes';
import { hijriOf, isFirstTenOfDhulHijjah, isRamadan, type HijriMonth } from './hijri';

export const EVENT_MILESTONES = [1, 5, 10, 25, 50] as const;
/** Seed → Tree → Forest in one class of good works. */
export const CLASS_MILESTONES = [5, 10, 20] as const;
export const VARIETY_MILESTONES = [2, 3, 4] as const;
/** Months in a row with a confirmed event. */
export const STREAK_MILESTONES = [3, 6, 12] as const;
export const LESSON_MILESTONES = [10, 25] as const;

export type BadgeKind = 'events' | 'class' | 'variety' | 'streak' | 'lessons' | 'ramadan' | 'dhul_hijjah';

export interface BadgeDef {
  id: string;
  kind: BadgeKind;
  /** How many it takes (events, classes, months or lessons); 1 for a blessed time. */
  count: number;
  /** The class, for a class badge. */
  event_class?: EventClassId;
  /** 1, 2, 3…: its step among the badges of its kind (the class badges: seed, tree, forest). */
  step: number;
}

/** Every badge there is, in the order the profile shows them. */
export const BADGES: BadgeDef[] = [
  ...EVENT_MILESTONES.map((count, i) => ({ id: `events_${count}`, kind: 'events' as const, count, step: i + 1 })),
  ...EVENT_CLASSES.flatMap((c) =>
    CLASS_MILESTONES.map((count, i) => ({ id: `class_${c.id}_${count}`, kind: 'class' as const, count, event_class: c.id, step: i + 1 })),
  ),
  ...VARIETY_MILESTONES.map((count, i) => ({ id: `variety_${count}`, kind: 'variety' as const, count, step: i + 1 })),
  ...STREAK_MILESTONES.map((count, i) => ({ id: `streak_${count}`, kind: 'streak' as const, count, step: i + 1 })),
  ...LESSON_MILESTONES.map((count, i) => ({ id: `lessons_${count}`, kind: 'lessons' as const, count, step: i + 1 })),
  { id: 'ramadan', kind: 'ramadan', count: 1, step: 1 },
  { id: 'dhul_hijjah', kind: 'dhul_hijjah', count: 1, step: 1 },
];

export const badgeDef = (id: string) => BADGES.find((b) => b.id === id);

export interface ConfirmedEvent {
  event_id: string;
  event_class: EventClassId | null;
  /** Its day where the association is (YYYY-MM-DD). */
  day: string;
}

/** The longest run of calendar months in a row with a day in `days`. */
function longestMonthRun(days: string[]) {
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].map((m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < months.length; i++) {
    run = i > 0 && months[i] === months[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The ids of every badge this record earns (whether stored yet or not). */
export function badgesEarned(args: { confirmed: ConfirmedEvent[]; lessonsLearned: number; hijri: HijriMonth[] }): string[] {
  const events = new Map(args.confirmed.map((e) => [e.event_id, e]));
  const list = [...events.values()];
  const byClass = new Map<string, number>();
  for (const e of list) if (e.event_class) byClass.set(e.event_class, (byClass.get(e.event_class) ?? 0) + 1);
  const streak = longestMonthRun(list.map((e) => e.day));
  const hijri = list.map((e) => hijriOf(e.day, args.hijri));
  return BADGES.filter((b) => {
    switch (b.kind) {
      case 'events':
        return list.length >= b.count;
      case 'class':
        return (byClass.get(b.event_class!) ?? 0) >= b.count;
      case 'variety':
        return byClass.size >= b.count;
      case 'streak':
        return streak >= b.count;
      case 'lessons':
        return args.lessonsLearned >= b.count;
      case 'ramadan':
        return hijri.some(isRamadan);
      case 'dhul_hijjah':
        return hijri.some(isFirstTenOfDhulHijjah);
    }
  }).map((b) => b.id);
}

// ---------- their names (owner's decision: Seed → Tree → Forest for a class) ----------

type Lang = 'ar' | 'en';

const CLASS_NAME: Record<EventClassId, Record<Lang, string>> = {
  environment: { ar: 'البيئة', en: 'the environment' },
  health: { ar: 'الصحة', en: 'health' },
  learning: { ar: 'التعلّم والتعليم', en: 'learning' },
  community: { ar: 'المجتمع', en: 'the community' },
};

const NAMES: Record<Lang, Record<string, string>> = {
  ar: {
    events_1: 'الخطوة الأولى',
    events_5: 'متطوّع نشيط',
    events_10: 'عشر فعاليات',
    events_25: 'خمس وعشرون فعالية',
    events_50: 'خمسون فعالية',
    class_1: 'بذرة خير في {class}',
    class_2: 'غرسة {class}',
    class_3: 'شجرة {class} المثمرة',
    variety_2: 'عطاء في مجالين',
    variety_3: 'عطاء في ثلاثة مجالات',
    variety_4: 'عطاء في كل المجالات',
    streak_3: 'مداوم: ٣ أشهر متتالية',
    streak_6: 'مداوم: ٦ أشهر متتالية',
    streak_12: 'مداوم: عام كامل',
    lessons_10: 'طالب علم: ١٠ دروس',
    lessons_25: 'طالب علم: ٢٥ درساً',
    ramadan: 'متطوّع رمضان',
    dhul_hijjah: 'العشر من ذي الحجة',
  },
  en: {
    events_1: 'First step',
    events_5: 'Active volunteer',
    events_10: 'Ten events',
    events_25: 'Twenty-five events',
    events_50: 'Fifty events',
    class_1: 'A seed of good in {class}',
    class_2: 'A sapling of {class}',
    class_3: 'A fruitful tree of {class}',
    variety_2: 'Giving in two fields',
    variety_3: 'Giving in three fields',
    variety_4: 'Giving in every field',
    streak_3: 'Steady: 3 months in a row',
    streak_6: 'Steady: 6 months in a row',
    streak_12: 'Steady: a whole year',
    lessons_10: 'Learner: 10 lessons',
    lessons_25: 'Learner: 25 lessons',
    ramadan: 'Ramadan volunteer',
    dhul_hijjah: 'The ten days of Dhul Hijjah',
  },
};

const HOW: Record<Lang, Record<BadgeKind, string>> = {
  ar: {
    events: '{n} فعالية مؤكدة',
    class: '{n} فعاليات مؤكدة في {class}',
    variety: 'فعاليات مؤكدة في {n} من مجالات العمل الصالح',
    streak: 'فعالية مؤكدة كل شهر، {n} أشهر متتالية',
    lessons: 'تعلّم {n} درساً من أركان التعلم',
    ramadan: 'فعالية مؤكدة في شهر رمضان',
    dhul_hijjah: 'فعالية مؤكدة في العشر الأوائل من ذي الحجة',
  },
  en: {
    events: '{n} confirmed events',
    class: '{n} confirmed events in {class}',
    variety: 'Confirmed events in {n} fields of good works',
    streak: 'A confirmed event every month, {n} months in a row',
    lessons: 'Learned {n} lessons in the learning corners',
    ramadan: 'A confirmed event in Ramadan',
    dhul_hijjah: 'A confirmed event in the first ten days of Dhul Hijjah',
  },
};

/** A badge's name, as the profile and the push show it. */
export function badgeName(id: string, lang: Lang): string {
  const b = badgeDef(id);
  if (!b) return id;
  if (b.kind === 'class') return NAMES[lang][`class_${b.step}`].replace('{class}', CLASS_NAME[b.event_class!][lang]);
  return NAMES[lang][id] ?? id;
}

/** What earns it, in a sentence. */
export function badgeHow(id: string, lang: Lang): string {
  const b = badgeDef(id);
  if (!b) return '';
  return HOW[lang][b.kind].replace('{n}', String(b.count)).replace('{class}', b.event_class ? CLASS_NAME[b.event_class][lang] : '');
}
