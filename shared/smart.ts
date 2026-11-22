// The app's small smarts (owner's decisions, 2026-11-22): suggesting to follow
// what someone keeps coming back to, telling those an event fits when it is
// almost full, suggesting the skills an event's words name, and, once there is
// enough data, the time of the week events posted fill fastest. Anything that
// needs data stays hidden until there is enough of it.

/** "Follow this institution/supervisor?" after this many confirmed attendances from it; asked once. */
export const FOLLOW_SUGGEST_AFTER = 2;

/** Almost full: at most this many places left, or at most this share of them, whichever comes first. */
export const ALMOST_FULL_PLACES = 3;
export const ALMOST_FULL_SHARE = 0.2;
/** At most one "almost full" alert per person in this long. */
export const ALMOST_FULL_GAP_MS = 24 * 3_600_000;

export function isAlmostFull(capacity: number, left: number): boolean {
  return left > 0 && left < capacity && (left <= ALMOST_FULL_PLACES || left <= capacity * ALMOST_FULL_SHARE);
}

// ---------- skills named in an event's words ----------

/** Words that name each starting skill (admins edit them, and add them to new skills, in the panel). */
export const STARTING_SKILL_KEYWORDS: Record<string, string[]> = {
  teaching: ['تدريس', 'تعليم', 'دروس', 'درس', 'دورة', 'محاضرة', 'تقوية', 'teach', 'tutor', 'lesson', 'course'],
  first_aid: ['اسعاف', 'إسعاف', 'اسعافات', 'جروح', 'first aid', 'cpr'],
  nursing: ['تمريض', 'ممرض', 'مرضى', 'مسنين', 'رعاية', 'nurse', 'patients', 'elderly'],
  driving: ['توصيل', 'سيارة', 'سائق', 'نقل', 'سلال', 'driv', 'deliver', 'transport'],
  photography: ['تصوير', 'صور', 'توثيق', 'photo', 'camera'],
  design: ['تصميم', 'ملصق', 'منشور', 'لافتة', 'design', 'poster', 'flyer'],
  cooking: ['طبخ', 'وجبات', 'مطبخ', 'افطار', 'إفطار', 'طعام', 'cook', 'meal', 'kitchen', 'iftar'],
  carpentry: ['نجارة', 'صيانة', 'اصلاح', 'إصلاح', 'تركيب', 'دهان', 'repair', 'carpent', 'paint', 'fix'],
  farming: ['زراعة', 'تشجير', 'اشجار', 'أشجار', 'شتلات', 'حديقة', 'plant', 'tree', 'garden', 'farm'],
  organizing: ['تنظيم', 'تنسيق', 'حملة', 'استقبال', 'organi', 'coordinat', 'campaign'],
  languages: ['انجليزي', 'إنجليزي', 'ترجمة', 'لغة', 'english', 'translat', 'language'],
  quran: ['قران', 'قرآن', 'تحفيظ', 'تجويد', 'حفظ', 'quran', 'tajweed'],
  children: ['اطفال', 'أطفال', 'ايتام', 'أيتام', 'تلاميذ', 'طلاب', 'children', 'kids', 'orphan'],
  computers: ['حاسوب', 'كمبيوتر', 'برمجة', 'تقنية', 'انترنت', 'computer', 'coding', 'laptop'],
};

/** At most this many words per skill, each this long. */
export const SKILL_KEYWORDS_MAX = 30;
export const SKILL_KEYWORD_LENGTH = 40;

/** Arabic and English written alike: no tashkeel or tatweel, one alef, ة as ه, ى as ي, lower case. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

/** The words a skill's keywords field holds (one per line or comma), cleaned and each once. */
export function parseKeywords(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[\n,،]/);
  return [...new Set(list.map((k) => k.trim().replace(/\s+/g, ' ').slice(0, SKILL_KEYWORD_LENGTH)).filter((k) => k.length >= 2))].slice(0, SKILL_KEYWORDS_MAX);
}

/**
 * The skills whose words appear in the event's title and description, most
 * words found first. A word counts inside longer ones too («التشجير» has
 * «تشجير»), so Arabic's prefixes need no list of their own.
 */
export function skillsInText(text: string, skills: { id: string; keywords?: string[] }[]): string[] {
  const t = normalizeText(text);
  if (t.trim().length < 3) return [];
  return skills
    .map((x) => ({ id: x.id, hits: (x.keywords ?? []).filter((k) => k.length >= 2 && t.includes(normalizeText(k))).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.id);
}

// ---------- the best time to post ----------

/** Shown only once there are this many past published events and this many members, in all. */
export const POSTING_HINT_MIN_EVENTS = 50;
export const POSTING_HINT_MIN_USERS = 100;
/** A time of the week needs this many past events to be judged. */
export const POSTING_HINT_MIN_PER_SLOT = 5;
/** And must fill at least this much faster than the average to be worth saying. */
export const POSTING_HINT_MIN_LIFT = 1.2;
/** How fast an event fills: the share of its places taken in this long after it was posted. */
export const FILL_WINDOW_MS = 48 * 3_600_000;

export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface PostingHint {
  /** 0 = Sunday … 6 = Saturday, where the association is. */
  weekday: number;
  part: DayPart;
  /** How many times faster than the average (1.5 = half as fast again). */
  lift: number;
}

/** Morning 4–12, afternoon 12–17, evening 17–4 (as the greeting). */
export function dayPart(hour: number): DayPart {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function slotOf(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24;
  // The evening after midnight belongs to the day before.
  const weekday = (WEEKDAYS[parts.weekday] + (hour < 4 ? 6 : 0)) % 7;
  return { weekday, part: dayPart(hour) };
}

/**
 * The time of the week events posted then filled fastest, or null: when there
 * is not enough data (the caller checks the totals first), or no time stands out.
 */
export function bestPostingTime(events: { posted_at: number; fill: number }[], timeZone: string): PostingHint | null {
  if (events.length < POSTING_HINT_MIN_EVENTS) return null;
  const average = events.reduce((sum, e) => sum + e.fill, 0) / events.length;
  if (average <= 0) return null;
  const slots = new Map<string, { weekday: number; part: DayPart; fills: number[] }>();
  for (const e of events) {
    const slot = slotOf(e.posted_at, timeZone);
    const key = `${slot.weekday}|${slot.part}`;
    const entry = slots.get(key) ?? { ...slot, fills: [] };
    entry.fills.push(e.fill);
    slots.set(key, entry);
  }
  let best: PostingHint | null = null;
  for (const slot of slots.values()) {
    if (slot.fills.length < POSTING_HINT_MIN_PER_SLOT) continue;
    const lift = slot.fills.reduce((a, b) => a + b, 0) / slot.fills.length / average;
    if (lift >= POSTING_HINT_MIN_LIFT && (!best || lift > best.lift)) best = { weekday: slot.weekday, part: slot.part, lift: Math.round(lift * 10) / 10 };
  }
  return best;
}
