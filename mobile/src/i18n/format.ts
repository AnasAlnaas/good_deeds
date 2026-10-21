// Formatting without Intl: Hermes' locale data varies by device, and DESIGN.md
// wants Western digits (123) in both languages.

import type { Strings } from './strings';

export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function num(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type Unit = Strings['units']['hour'];

/** Arabic counting forms: 1 → one, 2 → two, 3–10 whole → few, otherwise many. */
export function count(n: number, unit: Unit) {
  const r = Math.round(n * 10) / 10;
  if (r === 1) return unit.one;
  if (r === 2) return unit.two;
  if (Number.isInteger(r) && r >= 3 && r <= 10) return fmt(unit.few, { n: r });
  return fmt(unit.many, { n: num(r) });
}

export function time(iso: string | number, s: Strings) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? s.time.am : s.time.pm}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function day(iso: string | number, s: Strings, now = Date.now()) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86_400_000);
  if (diff === 0) return s.time.today;
  if (diff === 1) return s.time.tomorrow;
  if (diff === -1) return s.time.yesterday;
  return `${s.time.weekdays[d.getDay()]} ${d.getDate()} ${s.time.months[d.getMonth()]}`;
}

export function dayTimeRange(startIso: string, endIso: string, s: Strings, now = Date.now()) {
  return `${day(startIso, s, now)} · ${time(startIso, s)} – ${time(endIso, s)}`;
}
