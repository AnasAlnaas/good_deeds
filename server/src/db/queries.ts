// Reads that several endpoints share. Each returns shared types (ISO times).
// Pass `{ lock: true }` inside a transaction to hold the row until it commits,
// so two requests cannot both act on the same row (e.g. the last free seat).

import { randomUUID } from 'node:crypto';

import { and, asc, count, eq, inArray, isNull, lte, ne } from 'drizzle-orm';

import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import {
  type AppEvent,
  type Attendance,
  type Branch,
  type EventTerm,
  type Level,
  PILLARS,
  type Pillar,
  type Registration,
  type User,
  type Warning,
} from '../../../shared/types';
import type { PublicUser } from '../../../shared/api';
import type { Database } from './client';
import { iso } from './rows';
import * as s from './schema';

type Lock = { lock?: boolean };

export const newId = () => randomUUID();

/** The columns of a user that other people may see (shared/api.ts PublicUser). */
export const publicUser = { id: s.users.id, full_name: s.users.full_name, avatar_url: s.users.avatar_url, gender: s.users.gender };

/** A person as `viewer` may see them: the photo only where rules.canSeePhoto allows it. */
export function shownTo(viewer: Pick<User, 'id' | 'gender' | 'role'>, person: PublicUser): PublicUser {
  return person.avatar_url && !rules.canSeePhoto(viewer, person) ? { ...person, avatar_url: null } : person;
}

/** Drafts and turned-down drafts are nobody's to act on in the app (only their creator may look: findEventFor). */
export async function findEvent(q: Database, id: string, opts: Lock = {}): Promise<AppEvent> {
  const query = q.select().from(s.events).where(eq(s.events.id, id));
  const [row] = opts.lock ? await query.for('update') : await query;
  if (!row || rules.isHidden(row)) throw new ApiError('not_found');
  return iso(row);
}

/** An event as `viewer` may see it: their own drafts included. */
export async function findEventFor(q: Database, id: string, viewer: Pick<User, 'id'>): Promise<AppEvent> {
  const [row] = await q.select().from(s.events).where(eq(s.events.id, id));
  if (!row || !rules.canSeeEvent(viewer, row)) throw new ApiError('not_found');
  return iso(row);
}

/** The branches of faith an event form offers, each with its pillars. */
export async function activeBranches(q: Database): Promise<(Branch & { pillars: Pillar[] })[]> {
  const branches = await q.select().from(s.branches).where(eq(s.branches.is_active, true)).orderBy(asc(s.branches.id));
  const links = await q.select().from(s.branch_pillars);
  return branches.map((b) => ({ ...b, pillars: PILLARS.filter((p) => links.some((l) => l.branch_id === b.id && l.pillar === p)) }));
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

/** Joined the event or supervises it (rules.wasAtEvent). A deleted account was at nothing. */
export async function wasAtEvent(q: Database, eventId: string, userId: string) {
  const user = await findUser(q, userId);
  if (!user || user.deleted_at) return false;
  return rules.wasAtEvent(await registrationOf(q, eventId, userId), await isOrganizer(q, eventId, userId));
}

/** How many of a person's reports still wait for an admin. */
export async function openReports(q: Database, userId: string) {
  const [row] = await q
    .select({ n: count() })
    .from(s.reports)
    .where(and(eq(s.reports.reporter_id, userId), eq(s.reports.status, 'open')));
  return row.n;
}

export async function warningById(q: Database, id: string, opts: Lock = {}): Promise<Warning | undefined> {
  const query = q.select().from(s.warnings).where(eq(s.warnings.id, id));
  const [row] = opts.lock ? await query.for('update') : await query;
  return row && iso(row);
}

/** The people one supervisor warned at one event (withdrawn warnings left out). */
export async function warnedBy(q: Database, eventId: string, issuerId: string): Promise<Set<string>> {
  const rows = await q
    .select({ user_id: s.warnings.user_id })
    .from(s.warnings)
    .where(and(eq(s.warnings.event_id, eventId), eq(s.warnings.issued_by, issuerId), ne(s.warnings.status, 'withdrawn')));
  return new Set(rows.map((r) => r.user_id));
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

/** A person's level by the points in their ledger (as GET /api/me shows it). */
export async function levelOf(q: Database, userId: string): Promise<Level> {
  return rules.levelFor(await allLevels(q), rules.totalOf(rules.pointsByPillar(await ledgerOf(q, userId))));
}

/** How many of a person's events still wait for an admin. */
export async function waitingProposals(q: Database, userId: string) {
  const [row] = await q
    .select({ n: count() })
    .from(s.events)
    .where(and(eq(s.events.created_by, userId), eq(s.events.status, 'draft')));
  return row.n;
}

/**
 * Adds points for confirmed hours to the ledger (one row per pillar, only ever
 * added) and updates the person's total and level.
 */
export async function creditPoints(
  q: Database,
  args: { userId: string; eventId: string; earned: Record<Pillar, number>; reason: string; at: Date },
): Promise<{ total: number; level: Level }> {
  const rows = PILLARS.filter((p) => args.earned[p] > 0).map((p) => ({
    id: newId(),
    user_id: args.userId,
    event_id: args.eventId,
    pillar: p,
    points: args.earned[p],
    reason: args.reason,
    created_at: args.at,
  }));
  if (rows.length) await q.insert(s.points_ledger).values(rows);
  const total = rules.totalOf(rules.pointsByPillar(await ledgerOf(q, args.userId)));
  const level = rules.levelFor(await allLevels(q), total);
  await q.update(s.users).set({ total_points: total, level: level.level }).where(eq(s.users.id, args.userId));
  return { total, level };
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
