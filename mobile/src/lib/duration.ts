import type { Strings } from '@/i18n/strings';
import { count, num } from '@/i18n/format';

/** Minutes as people say them: "2 hours 30 minutes", "45 minutes". */
export function durationText(minutes: number, s: Strings) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const parts = [h ? count(h, s.units.hour) : '', m ? `${num(m)} ${s.outsideHours.minutesLabel}` : ''].filter(Boolean);
  return parts.join(' ') || `0 ${s.outsideHours.minutesLabel}`;
}
