// Reads that several endpoints share. Each returns shared types (ISO times).
// Pass `{ lock: true }` inside a transaction to hold the row until it commits,
// so two requests cannot both act on the same row (e.g. the last free seat).

import { randomUUID } from 'node:crypto';

import { and, asc, count, eq, inArray, isNull, lte } from 'drizzle-orm';

import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import type { AppEvent, Attendance, EventTerm, Level, Pillar, Registration, User } from '../../../shared/types';
import type { PublicUser } from '../../../shared/api';
import type { Database } from './client';
import { iso } from './rows';
import * as s from './schema';

type Lock = { lock?: boolean };

export const newId = () => randomUUID();

/** The columns of a user that other people may see (shared/api.ts PublicUser). */
export const publicUser = { id: s.users.id, full_name: s.users.full_name, avatar_url: s.users.avatar_url, gender: s.users.gender };

/** Drafts are not visible to anyone yet. */
export async function findEvent(q: Database, id: string, opts: Lock = {}): Promise<AppEvent> {
  const query = q.select().from(s.events).where(eq(s.events.id, id));
  const [row] = opts.lock ? await query.for('update') : await query;
  if (!row || row.status === 'draft') throw new ApiError('not_found');
  return iso(row);
}

export async function findUser(q: Database, id: string): Promise<User | undefined> {
  const [row] = await q.select().from(s.users).where(eq(s.users.id, id));
  return row && iso(row);
}

export async function registrationOf(q: Database, eventId: string, userId: string, opts: Lock = {}) {
  const query = q
    .select()
    .from(s.registrations)
    .where(and(eq(s.registrations.event_id, eventId), eq(s.registrations.user_id, userId)));
  const [row] = opts.lock ? await query.for('update') : await query;
  return row ? (iso(row) as Registration) : undefined;
}

export async function attendanceOf(q: Database, eventId: string, userId: string, opts: Lock = {}) {
  const query = q
    .select()
    .from(s.attendance)
    .where(and(eq(s.attendance.event_id, eventId), eq(s.attendance.user_id, userId)));
  const [row] = opts.lock ? await query.for('update') : await query;
  return row ? (iso(row) as Attendance) : undefined;
}

export async function attendanceById(q: Database, id: string, opts: Lock = {}) {
  const query = q.select().from(s.attendance).where(eq(s.attendance.id, id));
  const [row] = opts.lock ? await query.for('update') : await query;
  return row ? (iso(row) as Attendance) : undefined;
}

export async function termsOf(q: Database, eventId: string): Promise<EventTerm[]> {
  const rows = await q.select().from(s.event_terms).where(eq(s.event_terms.event_id, eventId)).orderBy(asc(s.event_terms.order_index));
  return rows.map(iso);
}

export async function acceptedTermIds(q: Database, registrationId: string | undefined): Promise<string[]> {
  if (!registrationId) return [];
  const rows = await q
    .select({ term_id: s.term_acceptances.term_id })
    .from(s.term_acceptances)
    .where(eq(s.term_acceptances.registration_id, registrationId));
  return rows.map((r) => r.term_id);
}

export async function isOrganizer(q: Database, eventId: string, userId: string) {
  const rows = await q
    .select()
    .from(s.event_organizers)
    .where(and(eq(s.event_organizers.event_id, eventId), eq(s.event_organizers.user_id, userId)));
  return rows.length > 0;
}

/** People with a `joined` registration, deleted accounts left out. */
export async function joinedUsers(q: Database, eventId: string): Promise<PublicUser[]> {
  return q
    .select(publicUser)
    .from(s.registrations)
    .innerJoin(s.users, eq(s.users.id, s.registrations.user_id))
    .where(and(eq(s.registrations.event_id, eventId), eq(s.registrations.status, 'joined'), isNull(s.users.deleted_at)))
    .orderBy(asc(s.registrations.joined_at));
}

export async function joinedCounts(q: Database, eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await q
    .select({ event_id: s.registrations.event_id, n: count() })
    .from(s.registrations)
    .innerJoin(s.users, eq(s.users.id, s.registrations.user_id))
    .where(and(inArray(s.registrations.event_id, eventIds), eq(s.registrations.status, 'joined'), isNull(s.users.deleted_at)))
    .groupBy(s.registrations.event_id);
  return new Map(rows.map((r) => [r.event_id, r.n]));
}

/** Each event's pillar weights, from the pillars of its branches of faith. */
export async function pillarWeights(q: Database, eventIds: string[]): Promise<Map<string, Record<Pillar, number>>> {
  const links = new Map<string, Pillar[]>(eventIds.map((id) => [id, []]));
  if (eventIds.length > 0) {
    const rows = await q
      .select({ event_id: s.event_branches.event_id, pillar: s.branch_pillars.pillar })
      .from(s.event_branches)
      .innerJoin(s.branch_pillars, eq(s.branch_pillars.branch_id, s.event_branches.branch_id))
      .where(inArray(s.event_branches.event_id, eventIds));
    for (const r of rows) links.get(r.event_id)!.push(r.pillar);
  }
  return new Map([...links].map(([id, pillars]) => [id, rules.pillarWeights(pillars)]));
}

export async function allLevels(q: Database): Promise<Level[]> {
  return q.select().from(s.levels).orderBy(asc(s.levels.min_points));
}

export async function ledgerOf(q: Database, userId: string) {
  return q.select({ pillar: s.points_ledger.pillar, points: s.points_ledger.points }).from(s.points_ledger).where(eq(s.points_ledger.user_id, userId));
}

/**
 * The scheduled job: attendance still open when its event ends is closed at
 * the event's end. It also runs before every signed-in request, so the answer
 * never depends on when the timer last fired (the offline demo does the same).
 * Returns the records it closed; only one caller can close each one.
 */
export async function closeDueAttendance(q: Database, now: number): Promise<string[]> {
  const due = await q
    .select({ a: s.attendance, ends_at: s.events.ends_at })
    .from(s.attendance)
    .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
    .where(and(isNull(s.attendance.ended_at), lte(s.events.ends_at, new Date(now))));
  const closed: string[] = [];
  for (const { a, ends_at } of due) {
    const close = rules.decideAutoClose(iso(a), { ends_at: ends_at.toISOString() }, now);
    if (!close) continue;
    const updated = await q
      .update(s.attendance)
      .set({ ended_at: new Date(close.ended_at!), end_source: close.end_source, hours: close.hours })
      .where(and(eq(s.attendance.id, a.id), isNull(s.attendance.ended_at)))
      .returning({ id: s.attendance.id });
    closed.push(...updated.map((r) => r.id));
  }
  return closed;
}
