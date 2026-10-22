// The demo's stand-in for the backend. The rules live in shared/rules.ts and
// are the same ones the real server (server/) runs. This file only finds rows
// in the on-phone database, calls the rule, and writes what the rule decided.
// The screens never compute hours or points themselves.

import type { AppEvent, Attendance, Db, EventStatus, EventTerm, Pillar, Registration, User } from '@/data/types';
import { PILLARS } from '@/data/types';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';

export { ApiError } from '../../../shared/errors';
export type { ApiErrorCode } from '../../../shared/errors';

const clone = (db: Db): Db => JSON.parse(JSON.stringify(db));
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- reads (selectors) ----------

export function getEvent(db: Db, eventId: string): AppEvent {
  const e = db.events.find((x) => x.id === eventId);
  if (!e) throw new ApiError('not_found');
  return e;
}

export function getUser(db: Db, userId: string): User | undefined {
  return db.users.find((u) => u.id === userId);
}

export function effectiveStatus(e: AppEvent, now: number): EventStatus {
  return rules.effectiveStatus(e, now);
}

export function eventTerms(db: Db, eventId: string): EventTerm[] {
  return rules.sortTerms(db.event_terms.filter((x) => x.event_id === eventId));
}

export function eventBranches(db: Db, eventId: string) {
  const ids = db.event_branches.filter((x) => x.event_id === eventId).map((x) => x.branch_id);
  return db.branches.filter((b) => ids.includes(b.id));
}

export function isOrganizer(db: Db, eventId: string, userId: string) {
  return db.event_organizers.some((o) => o.event_id === eventId && o.user_id === userId);
}

export function registrationOf(db: Db, eventId: string, userId: string): Registration | undefined {
  return db.registrations.find((r) => r.event_id === eventId && r.user_id === userId);
}

export function joinedUsers(db: Db, eventId: string): User[] {
  const ids = db.registrations.filter((r) => r.event_id === eventId && r.status === 'joined').map((r) => r.user_id);
  return db.users.filter((u) => ids.includes(u.id) && !u.deleted_at);
}

export function attendanceOf(db: Db, eventId: string, userId: string): Attendance | undefined {
  return db.attendance.find((a) => a.event_id === eventId && a.user_id === userId);
}

export function acceptedTermIds(db: Db, registrationId: string): string[] {
  return db.term_acceptances.filter((a) => a.registration_id === registrationId).map((a) => a.term_id);
}

export function canUserJoinCategory(user: User, e: AppEvent) {
  return rules.canUserJoinCategory(user, e);
}

export function eventPillarWeights(db: Db, eventId: string): Record<Pillar, number> {
  const links = eventBranches(db, eventId).flatMap((b) =>
    db.branch_pillars.filter((x) => x.branch_id === b.id).map((x) => x.pillar),
  );
  return rules.pillarWeights(links);
}

export function dominantPillar(db: Db, eventId: string): Pillar {
  return rules.dominantPillar(eventPillarWeights(db, eventId));
}

export function pointsByPillar(db: Db, userId: string): Record<Pillar, number> {
  return rules.pointsByPillar(db.points_ledger.filter((l) => l.user_id === userId));
}

export function totalPoints(db: Db, userId: string) {
  return rules.totalOf(pointsByPillar(db, userId));
}

export function levelFor(db: Db, points: number) {
  return rules.levelFor(db.levels, points);
}

export function nextLevel(db: Db, points: number) {
  return rules.nextLevel(db.levels, points);
}

export function confirmedHours(db: Db, userId: string) {
  return rules.round2(
    db.attendance
      .filter((a) => a.user_id === userId && a.participant_status === 'confirmed')
      .reduce((s, a) => s + (a.hours ?? 0), 0),
  );
}

export function pointsForAttendance(db: Db, a: Attendance): Record<Pillar, number> {
  return rules.pointsForAttendance(getEvent(db, a.event_id), a.hours, eventPillarWeights(db, a.event_id));
}

// ---------- scheduled job: auto-close open attendance at events.ends_at ----------

export function tick(db: Db, now: number): Db {
  const due = db.attendance.filter((a) => rules.decideAutoClose(a, getEvent(db, a.event_id), now));
  if (due.length === 0) return db;
  const next = clone(db);
  for (const a of next.attendance) {
    const close = rules.decideAutoClose(a, getEvent(next, a.event_id), now);
    if (close) Object.assign(a, close);
  }
  return next;
}

// ---------- joining ----------

/** Opens (or reopens) a registration so the user can go through the terms. */
export function startJoin(db: Db, userId: string, eventId: string, now: number): Db {
  const user = getUser(db, userId)!;
  const event = getEvent(db, eventId);
  const existing = registrationOf(db, eventId, userId);
  const action = rules.decideStartJoin({ user, event, registration: existing, now });
  if (action === 'nothing') return db;
  const next = clone(db);
  if (action === 'reopen') {
    next.registrations.find((r) => r.id === existing!.id)!.status = 'pending_terms';
  } else {
    next.registrations.push({
      id: newId('reg'),
      event_id: eventId,
      user_id: userId,
      status: 'pending_terms',
      joined_at: null,
      created_at: new Date(now).toISOString(),
    });
  }
  return next;
}

/** Accepts one term. Terms are accepted strictly in order, one at a time. */
export function acceptTerm(db: Db, userId: string, eventId: string, termId: string, now: number): Db {
  const reg = registrationOf(db, eventId, userId);
  const action = rules.decideAcceptTerm({
    registration: reg,
    terms: eventTerms(db, eventId),
    acceptedTermIds: reg ? acceptedTermIds(db, reg.id) : [],
    termId,
  });
  if (action === 'nothing') return db;
  const next = clone(db);
  next.term_acceptances.push({
    id: newId('acc'),
    registration_id: reg!.id,
    term_id: termId,
    accepted_at: new Date(now).toISOString(),
  });
  const e = next.events.find((x) => x.id === eventId)!;
  if (!e.terms_locked_at) e.terms_locked_at = new Date(now).toISOString();
  return next;
}

/** Turns a registration into `joined`: only after every term is accepted, and only if there is room. */
export function completeJoin(db: Db, userId: string, eventId: string, now: number): Db {
  const user = getUser(db, userId)!;
  const event = getEvent(db, eventId);
  const reg = registrationOf(db, eventId, userId);
  rules.assertCompleteJoin({
    user,
    event,
    registration: reg,
    terms: eventTerms(db, eventId),
    acceptedTermIds: reg ? acceptedTermIds(db, reg.id) : [],
    joinedCount: joinedUsers(db, eventId).length,
    now,
  });
  const next = clone(db);
  const r = next.registrations.find((x) => x.id === reg!.id)!;
  r.status = 'joined';
  r.joined_at = new Date(now).toISOString();
  return next;
}

export function cancelJoin(db: Db, userId: string, eventId: string): Db {
  const reg = registrationOf(db, eventId, userId);
  rules.assertCancelJoin({ registration: reg, hasAttendance: !!attendanceOf(db, eventId, userId) });
  const next = clone(db);
  next.registrations.find((x) => x.id === reg!.id)!.status = 'cancelled';
  return next;
}

// ---------- attendance (recorded by a supervisor of THIS event) ----------

export function recordStart(
  db: Db,
  actorId: string,
  args: { eventId: string; userId: string; startedAt?: number },
  now: number,
): Db {
  const event = getEvent(db, args.eventId);
  const start = rules.decideRecordStart({
    actorId,
    participantId: args.userId,
    actorIsOrganizer: isOrganizer(db, event.id, actorId),
    event,
    registration: registrationOf(db, event.id, args.userId),
    attendance: attendanceOf(db, event.id, args.userId),
    startedAt: args.startedAt,
    now,
  });
  const next = clone(db);
  next.attendance.push({
    id: newId('att'),
    event_id: event.id,
    user_id: args.userId,
    ...start,
    ended_at: null,
    end_source: null,
    hours: null,
    recorded_by: actorId,
    recorded_at: new Date(now).toISOString(),
    participant_status: 'pending',
    participant_acted_at: null,
  });
  return next;
}

export function recordEnd(
  db: Db,
  actorId: string,
  args: { eventId: string; userId: string; endedAt?: number },
  now: number,
): Db {
  const event = getEvent(db, args.eventId);
  const a = attendanceOf(db, event.id, args.userId);
  const end = rules.decideRecordEnd({
    actorId,
    participantId: args.userId,
    actorIsOrganizer: isOrganizer(db, event.id, actorId),
    event,
    attendance: a,
    endedAt: args.endedAt,
    now,
  });
  const next = clone(db);
  Object.assign(next.attendance.find((x) => x.id === a!.id)!, end);
  return next;
}

// ---------- participant confirms or disputes what was recorded ----------

export function confirmAttendance(db: Db, userId: string, attendanceId: string, now: number): Db {
  rules.assertCanConfirm(db.attendance.find((x) => x.id === attendanceId), userId);
  const next = clone(db);
  const row = next.attendance.find((x) => x.id === attendanceId)!;
  row.participant_status = 'confirmed';
  row.participant_acted_at = new Date(now).toISOString();
  const pts = pointsForAttendance(next, row);
  for (const p of PILLARS) {
    if (pts[p] > 0) {
      next.points_ledger.push({
        id: newId('pl'),
        user_id: userId,
        event_id: row.event_id,
        pillar: p,
        points: pts[p],
        reason: 'attendance_confirmed',
        created_at: new Date(now).toISOString(),
      });
    }
  }
  const u = next.users.find((x) => x.id === userId)!;
  u.total_points = totalPoints(next, userId);
  u.level = levelFor(next, u.total_points).level;
  return next;
}

export function disputeAttendance(db: Db, userId: string, attendanceId: string, now: number): Db {
  rules.assertCanDispute(db.attendance.find((x) => x.id === attendanceId), userId);
  const next = clone(db);
  const row = next.attendance.find((x) => x.id === attendanceId)!;
  row.participant_status = 'disputed';
  row.participant_acted_at = new Date(now).toISOString();
  return next;
}

// ---------- account ----------

/** App Store requires account deletion. Soft delete, as in Data_Model.md (users.deleted_at). */
export function deleteAccount(db: Db, userId: string, now: number): Db {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId);
  if (u) u.deleted_at = new Date(now).toISOString();
  for (const r of next.registrations) if (r.user_id === userId) r.status = 'cancelled';
  return next;
}
