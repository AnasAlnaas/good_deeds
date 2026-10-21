// The demo's stand-in for the backend. Every rule that Build_Plan.md and
// Data_Model.md say must be enforced on the server lives here, so the screens
// never compute hours or points themselves. When the real Node.js API on
// Vercel exists, these functions become HTTP calls with the same names and
// the same rules move to the server unchanged.

import type {
  AppEvent,
  Attendance,
  Db,
  EventStatus,
  EventTerm,
  Pillar,
  Registration,
  User,
} from '@/data/types';
import { PILLARS } from '@/data/types';
import { END_GRACE_MINUTES } from './placeholders';

export type ApiErrorCode =
  | 'not_found'
  | 'event_closed'
  | 'event_not_started'
  | 'event_full'
  | 'gender_not_allowed'
  | 'terms_incomplete'
  | 'term_out_of_order'
  | 'already_joined'
  | 'not_joined'
  | 'cannot_cancel_after_attendance'
  | 'not_organizer'
  | 'cannot_record_self'
  | 'start_before_event'
  | 'time_in_future'
  | 'already_started'
  | 'not_started'
  | 'already_ended'
  | 'end_before_start'
  | 'end_after_event'
  | 'not_your_attendance'
  | 'already_acted';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode) {
    super(code);
  }
}

const MS_HOUR = 3_600_000;
const t = (iso: string) => new Date(iso).getTime();
const clone = (db: Db): Db => JSON.parse(JSON.stringify(db));
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  if (e.status === 'cancelled' || e.status === 'draft') return e.status;
  if (now >= t(e.ends_at)) return 'finished';
  if (now >= t(e.starts_at)) return 'running';
  return 'published';
}

export function eventTerms(db: Db, eventId: string): EventTerm[] {
  return db.event_terms.filter((x) => x.event_id === eventId).sort((a, b) => a.order_index - b.order_index);
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
  return e.gender_category === 'mixed' || e.gender_category === user.gender;
}

// ⚠️ PLACEHOLDER: how an event's points split across pillars is not written
// down yet. Here each link in branch_pillars counts once, then normalised.
export function eventPillarWeights(db: Db, eventId: string): Record<Pillar, number> {
  const w: Record<Pillar, number> = { spiritual: 0, mental: 0, physical: 0 };
  for (const b of eventBranches(db, eventId)) {
    for (const bp of db.branch_pillars.filter((x) => x.branch_id === b.id)) w[bp.pillar] += 1;
  }
  const sum = PILLARS.reduce((s, p) => s + w[p], 0) || 1;
  for (const p of PILLARS) w[p] = w[p] / sum;
  return w;
}

export function dominantPillar(db: Db, eventId: string): Pillar {
  const w = eventPillarWeights(db, eventId);
  return PILLARS.reduce((best, p) => (w[p] > w[best] ? p : best), 'physical' as Pillar);
}

export function pointsByPillar(db: Db, userId: string): Record<Pillar, number> {
  const r: Record<Pillar, number> = { spiritual: 0, mental: 0, physical: 0 };
  for (const l of db.points_ledger) if (l.user_id === userId) r[l.pillar] += l.points;
  for (const p of PILLARS) r[p] = round2(r[p]);
  return r;
}

export function totalPoints(db: Db, userId: string) {
  const r = pointsByPillar(db, userId);
  return round2(r.spiritual + r.mental + r.physical);
}

export function levelFor(db: Db, points: number) {
  return [...db.levels].sort((a, b) => b.min_points - a.min_points).find((l) => points >= l.min_points) ?? db.levels[0];
}

export function nextLevel(db: Db, points: number) {
  return [...db.levels].sort((a, b) => a.min_points - b.min_points).find((l) => l.min_points > points);
}

export function confirmedHours(db: Db, userId: string) {
  return round2(
    db.attendance
      .filter((a) => a.user_id === userId && a.participant_status === 'confirmed')
      .reduce((s, a) => s + (a.hours ?? 0), 0),
  );
}

// ---------- the points formula (master file: points = event points × attendance ratio) ----------

export function pointsForAttendance(db: Db, a: Attendance): Record<Pillar, number> {
  const e = getEvent(db, a.event_id);
  const duration = (t(e.ends_at) - t(e.starts_at)) / MS_HOUR;
  const ratio = Math.min(1, (a.hours ?? 0) / duration);
  const total = e.base_points * ratio;
  const w = eventPillarWeights(db, e.id);
  return {
    spiritual: round2(total * w.spiritual),
    mental: round2(total * w.mental),
    physical: round2(total * w.physical),
  };
}

// ---------- scheduled job: auto-close open attendance at events.ends_at ----------

export function tick(db: Db, now: number): Db {
  const open = db.attendance.filter((a) => !a.ended_at && now >= t(getEvent(db, a.event_id).ends_at));
  if (open.length === 0) return db;
  const next = clone(db);
  for (const a of next.attendance) {
    const e = getEvent(next, a.event_id);
    if (!a.ended_at && now >= t(e.ends_at)) {
      a.ended_at = e.ends_at;
      a.end_source = 'auto_closed';
      a.hours = round2((t(e.ends_at) - t(a.started_at)) / MS_HOUR);
    }
  }
  return next;
}

// ---------- joining ----------

function assertJoinable(db: Db, user: User, e: AppEvent, now: number) {
  const status = effectiveStatus(e, now);
  if (status === 'finished' || status === 'cancelled' || status === 'draft') throw new ApiError('event_closed');
  if (!canUserJoinCategory(user, e)) throw new ApiError('gender_not_allowed');
}

/** Opens (or reopens) a registration so the user can go through the terms. */
export function startJoin(db: Db, userId: string, eventId: string, now: number): Db {
  const user = getUser(db, userId)!;
  const e = getEvent(db, eventId);
  assertJoinable(db, user, e, now);
  const existing = registrationOf(db, eventId, userId);
  if (existing?.status === 'joined') throw new ApiError('already_joined');
  if (existing?.status === 'pending_terms') return db;
  const next = clone(db);
  if (existing) {
    next.registrations.find((r) => r.id === existing.id)!.status = 'pending_terms';
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
  if (!reg || reg.status === 'cancelled') throw new ApiError('not_joined');
  const accepted = acceptedTermIds(db, reg.id);
  if (accepted.includes(termId)) return db;
  const nextTerm = eventTerms(db, eventId).find((x) => !accepted.includes(x.id));
  if (!nextTerm || nextTerm.id !== termId) throw new ApiError('term_out_of_order');
  const next = clone(db);
  next.term_acceptances.push({
    id: newId('acc'),
    registration_id: reg.id,
    term_id: termId,
    accepted_at: new Date(now).toISOString(),
  });
  // Terms are locked at the first acceptance: nobody may agree to a text that later changes.
  const e = next.events.find((x) => x.id === eventId)!;
  if (!e.terms_locked_at) e.terms_locked_at = new Date(now).toISOString();
  return next;
}

/** Turns a registration into `joined`: only after every term is accepted, and only if there is room. */
export function completeJoin(db: Db, userId: string, eventId: string, now: number): Db {
  const user = getUser(db, userId)!;
  const e = getEvent(db, eventId);
  assertJoinable(db, user, e, now);
  const reg = registrationOf(db, eventId, userId);
  if (!reg || reg.status === 'cancelled') throw new ApiError('not_joined');
  if (reg.status === 'joined') throw new ApiError('already_joined');
  const accepted = acceptedTermIds(db, reg.id);
  if (eventTerms(db, eventId).some((x) => !accepted.includes(x.id))) throw new ApiError('terms_incomplete');
  if (joinedUsers(db, eventId).length >= e.capacity) throw new ApiError('event_full');
  const next = clone(db);
  const r = next.registrations.find((x) => x.id === reg.id)!;
  r.status = 'joined';
  r.joined_at = new Date(now).toISOString();
  return next;
}

export function cancelJoin(db: Db, userId: string, eventId: string): Db {
  const reg = registrationOf(db, eventId, userId);
  if (!reg || reg.status !== 'joined') throw new ApiError('not_joined');
  if (attendanceOf(db, eventId, userId)) throw new ApiError('cannot_cancel_after_attendance');
  const next = clone(db);
  next.registrations.find((x) => x.id === reg.id)!.status = 'cancelled';
  return next;
}

// ---------- attendance (recorded by a supervisor of THIS event) ----------

function assertRecorder(db: Db, actorId: string, eventId: string, participantId: string) {
  if (!isOrganizer(db, eventId, actorId)) throw new ApiError('not_organizer');
  if (actorId === participantId) throw new ApiError('cannot_record_self');
}

export function recordStart(
  db: Db,
  actorId: string,
  args: { eventId: string; userId: string; startedAt?: number },
  now: number,
): Db {
  const e = getEvent(db, args.eventId);
  assertRecorder(db, actorId, e.id, args.userId);
  if (now < t(e.starts_at)) throw new ApiError('event_not_started');
  if (now > t(e.ends_at)) throw new ApiError('event_closed');
  if (registrationOf(db, e.id, args.userId)?.status !== 'joined') throw new ApiError('not_joined');
  if (attendanceOf(db, e.id, args.userId)) throw new ApiError('already_started');
  const startedAt = args.startedAt ?? now;
  if (startedAt < t(e.starts_at)) throw new ApiError('start_before_event');
  if (startedAt > now) throw new ApiError('time_in_future');
  const next = clone(db);
  next.attendance.push({
    id: newId('att'),
    event_id: e.id,
    user_id: args.userId,
    started_at: new Date(startedAt).toISOString(),
    start_source: now - startedAt > 60_000 ? 'backdated' : 'live',
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
  const e = getEvent(db, args.eventId);
  assertRecorder(db, actorId, e.id, args.userId);
  const a = attendanceOf(db, e.id, args.userId);
  if (!a) throw new ApiError('not_started');
  if (a.ended_at) throw new ApiError('already_ended');
  const endedAt = args.endedAt ?? now;
  if (endedAt > now) throw new ApiError('time_in_future');
  if (endedAt <= t(a.started_at)) throw new ApiError('end_before_start');
  if (endedAt > t(e.ends_at) + END_GRACE_MINUTES * 60_000) throw new ApiError('end_after_event');
  const next = clone(db);
  const row = next.attendance.find((x) => x.id === a.id)!;
  row.ended_at = new Date(endedAt).toISOString();
  row.end_source = now - endedAt > 60_000 ? 'backdated' : 'live';
  row.hours = round2((endedAt - t(a.started_at)) / MS_HOUR);
  return next;
}

// ---------- participant confirms or disputes what was recorded ----------

// ⚠️ ASSUMPTION: points are credited when the participant confirms (DESIGN.md
// puts the reward moment there). A disputed record earns nothing until an
// admin decides — that flow is not in the demo.
export function confirmAttendance(db: Db, userId: string, attendanceId: string, now: number): Db {
  const a = db.attendance.find((x) => x.id === attendanceId);
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (!a.ended_at) throw new ApiError('not_started');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
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
  const a = db.attendance.find((x) => x.id === attendanceId);
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
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
