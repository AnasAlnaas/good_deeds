// An example name for a new event, shown in the event form's name field
// (the app's and the admin panel's): one that fits the tag chosen above it,
// else its class (a tag someone wrote). Event content is written by people in
// their own language, so these are only examples, never saved.

import type { EventClassId } from './classes';

type Lang = 'ar' | 'en';

const BY_TYPE: Record<Lang, Record<string, string>> = {
  ar: {
    street_cleanup: 'مثلاً: تنظيف شارع السوق القديم',
    beach_cleanup: 'مثلاً: تنظيف شاطئ الحي قبل الصيف',
    tree_planting: 'مثلاً: غرس أشجار الزيتون في مدخل الحي',
    charity_kitchen: 'مثلاً: إعداد وجبات الإفطار للأسر المحتاجة',
    food_baskets: 'مثلاً: تجهيز سلال رمضان وتوزيعها',
    quran_circle: 'مثلاً: حلقة تحفيظ جزء عمّ للأطفال',
    tutoring: 'مثلاً: دروس تقوية في الرياضيات للشهادة الإعدادية',
    first_aid_course: 'مثلاً: دورة إسعافات أولية للشباب',
    elderly_visit: 'مثلاً: زيارة دار المسنين وقضاء العصر معهم',
    orphanage_visit: 'مثلاً: يوم ترفيهي مع أطفال دار الأيتام',
    mosque_cleaning: 'مثلاً: تنظيف مسجد الحي وفرشه قبل الجمعة',
    traffic_awareness: 'مثلاً: حملة توعية مرورية عند مدارس الحي',
    water_coolers: 'مثلاً: تركيب برّادات ماء في الطريق العام',
  },
  en: {
    street_cleanup: 'For example: Clean up the old market street',
    beach_cleanup: 'For example: Clean the neighbourhood beach before summer',
    tree_planting: 'For example: Plant olive trees at the neighbourhood entrance',
    charity_kitchen: 'For example: Cook iftar meals for families in need',
    food_baskets: 'For example: Pack and hand out Ramadan food baskets',
    quran_circle: 'For example: A Juz Amma memorisation circle for children',
    tutoring: 'For example: Maths tutoring for the middle-school exam',
    first_aid_course: 'For example: A first aid course for young people',
    elderly_visit: 'For example: An afternoon at the elderly care home',
    orphanage_visit: 'For example: A fun day with the orphanage children',
    mosque_cleaning: 'For example: Clean the neighbourhood mosque before Friday',
    traffic_awareness: 'For example: Road safety awareness at the local schools',
    water_coolers: 'For example: Install water coolers along the main road',
  },
};

const BY_CLASS: Record<Lang, Record<EventClassId, string>> = {
  ar: {
    environment: 'مثلاً: حملة نظافة في الحي',
    health: 'مثلاً: يوم صحي للتوعية في الحي',
    learning: 'مثلاً: دروس مجانية لطلاب الحي',
    community: 'مثلاً: زيارة الأسر المحتاجة في الحي',
  },
  en: {
    environment: 'For example: A clean-up campaign in the neighbourhood',
    health: 'For example: A health awareness day in the neighbourhood',
    learning: 'For example: Free lessons for the neighbourhood students',
    community: 'For example: Visit families in need in the neighbourhood',
  },
};

/** The example for this tag (a known type's id), else for its class; null with neither. */
export function nameExample(lang: Lang, subtype: string, eventClass: EventClassId | null): string | null {
  return BY_TYPE[lang][subtype] ?? (eventClass ? BY_CLASS[lang][eventClass] : null);
}
