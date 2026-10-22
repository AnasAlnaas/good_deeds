// Dates and numbers in Arabic words with Western digits (123), as DESIGN.md
// asks, in the browser's time zone (the association works in Tripoli).

const LOCALE = 'ar-LY-u-nu-latn';

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });

export const dateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const date = (iso: string) => dateFmt.format(new Date(iso));
export const time = (iso: string) => timeFmt.format(new Date(iso));

/** "الأحد 25 أكتوبر، 9:00 ص – 12:00 م" */
export function range(startIso: string, endIso: string) {
  const sameDay = new Date(startIso).toDateString() === new Date(endIso).toDateString();
  return sameDay ? `${dateTime(startIso)} – ${time(endIso)}` : `${dateTime(startIso)} – ${dateTime(endIso)}`;
}

export function num(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Keeps a phone number left-to-right inside Arabic text. */
export const ltr = (text: string) => `⁦${text}⁩`;

/** <input type="datetime-local"> works in local time without a zone. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString();
}

/** <input type="date"> value for a day, in local time. */
export function dayInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
