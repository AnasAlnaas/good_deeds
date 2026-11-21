// The home screen's greeting (owner's decisions, 2026-11-21): by the time of
// day where the association is, or, on an occasion, the occasion instead
// («رمضان مبارك يا أحمد»). Hijri days come from shared/hijri.ts, with the
// admins' moves of month starts.

import { hijriOf, type HijriMonth } from './hijri';

export type Greeting = 'morning' | 'afternoon' | 'evening' | 'ramadan' | 'eid_fitr' | 'eid_adha' | 'hijri_new_year';

/** The hour (0–23) and the calendar day (YYYY-MM-DD) of a moment where the association is. */
function localParts(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour) % 24, day: `${parts.year}-${parts.month}-${parts.day}` };
}

/** صباح الخير 4–12, نهارك سعيد 12–17, مساء الخير 17–4. */
export function timeGreeting(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/** The occasion of a Hijri day, if it is one: Ramadan, Eid al-Fitr (1–3 Shawwal), Eid al-Adha (10–13 Dhul Hijjah), the Hijri new year (1 Muharram). */
export function occasionOf(h: { month: number; day: number } | null): Greeting | null {
  if (!h) return null;
  if (h.month === 9) return 'ramadan';
  if (h.month === 10 && h.day <= 3) return 'eid_fitr';
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return 'eid_adha';
  if (h.month === 1 && h.day === 1) return 'hijri_new_year';
  return null;
}

export function greetingFor(at: number, timeZone: string, hijri: HijriMonth[]): Greeting {
  const { hour, day } = localParts(at, timeZone);
  return occasionOf(hijriOf(day, hijri)) ?? timeGreeting(hour);
}
