// The demo's stand-in for the backend. The rules live in shared/rules.ts and
// are the same ones the real server (server/) runs. This file only finds rows
// in the on-phone database, calls the rule, and writes what the rule decided.
// The screens never compute hours or points themselves.

import type { EventProposal, ProfileEdit, ReportBody } from '@/data/api';
import type { AppEvent, Attendance, Db, EventStatus, EventTerm, Registration, Report, User, Warning } from '@/data/types';
import { BASE_POINTS_BY_SUBTYPE } from './placeholders';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';

export { ApiError } from '../../../shared/errors';
export type { ApiErrorCode } from '../../../shared/errors';

const clone = (db: Db): Db => JSON.parse(JSON.stringify(db));
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- reads (selectors) ----------

/** Like the server's findEvent: drafts and turned-down drafts are nobody's to act on. */
export function getEvent(db: Db, eventId: string): AppEvent {
  const e = db.events.find((x) => x.id === eventId);
  if (!e || rules.isHidden(e)) throw new ApiError('not_found');
  return e;
}

/** An event as `viewerId` may see it: their own drafts included. */
export function getEventFor(db: Db, eventId: string, viewerId: string): AppEvent {
  const e = db.events.find((x) => x.id === eventId);
  if (!e || !rules.canSeeEvent({ id: viewerId }, e)) throw new ApiError('not_found');
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

export function totalPoints(db: Db, userId: string) {
  return rules.totalPoints(db.points_ledger.filter((l) => l.user_id === userId));
}

export function levelFor(db: Db, points: number) {
  return rules.levelFor(db.levels, points);
}

export function nextLevel(db: Db, points: number) {
  return rules.nextLevel(db.levels, points);
}

export function waitingProposals(db: Db, userId: string) {
  return db.events.filter((e) => e.created_by === userId && e.status === 'draft').length;
}

export function canCreateEvents(db: Db, user: User) {
  return rules.canCreateEvents(user, levelFor(db, totalPoints(db, user.id)));
}

export function confirmedHours(db: Db, userId: string) {
  return rules.round2(
    db.attendance
      .filter((a) => a.user_id === userId && a.participant_status === 'confirmed')
      .reduce((s, a) => s + (a.hours ?? 0), 0),
  );
}

export function pointsForAttendance(db: Db, a: Attendance): number {
  return rules.pointsForAttendance(getEvent(db, a.event_id), a.hours);
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

// ---------- proposing an event ----------

/**
 * An event made in the app. The demo has no admin, so a proposal stays waiting.
 * The form's fields are checked before this (demoBackend.ts), as the server's request checks do.
 */
export function proposeEvent(db: Db, userId: string, input: EventProposal, now: number): { db: Db; event: AppEvent } {
  const user = getUser(db, userId)!;
  rules.assertCanProposeEvent({
    user,
    level: levelFor(db, totalPoints(db, userId)),
    event: input,
    waitingCount: waitingProposals(db, userId),
    now,
  });
  const next = clone(db);
  const at = new Date(now).toISOString();
  const event: AppEvent = {
    id: newId('ev'),
    title: input.title,
    description: input.description,
    subtype: input.subtype,
    image_url: null,
    lat: input.lat,
    lng: input.lng,
    address_text: input.address_text,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    capacity: input.capacity,
    gender_category: input.gender_category,
    base_points: BASE_POINTS_BY_SUBTYPE[input.subtype],
    status: rules.proposalStatus(user),
    terms_locked_at: null,
    created_by: userId,
    created_at: at,
  };
  next.events.push(event);
  next.event_organizers.push({ event_id: event.id, user_id: userId });
  writeBranchesAndTerms(next, event.id, input, at);
  return { db: next, event };
}

/** Replaces an event's branches and terms (in `next`, already a copy). */
function writeBranchesAndTerms(next: Db, eventId: string, input: EventProposal, at: string) {
  next.event_branches = next.event_branches.filter((x) => x.event_id !== eventId);
  next.event_terms = next.event_terms.filter((x) => x.event_id !== eventId);
  for (const branch_id of new Set(input.branch_ids)) next.event_branches.push({ event_id: eventId, branch_id });
  input.terms.forEach((text, i) =>
    next.event_terms.push({ id: newId('term'), event_id: eventId, order_index: i + 1, text, image_url: null, audio_url: null, created_at: at }),
  );
}

/**
 * The proposer edits their event while it waits for an admin, checked like a
 * new proposal. Its supervisors stay as they are. Fields checked as for proposeEvent.
 */
export function editProposal(db: Db, userId: string, eventId: string, input: EventProposal, now: number): Db {
  const user = getUser(db, userId)!;
  rules.assertCanChangeProposal(user, db.events.find((e) => e.id === eventId));
  rules.assertCanProposeEvent({
    user,
    level: levelFor(db, totalPoints(db, userId)),
    event: input,
    // This draft is one of those waiting; editing it adds none.
    waitingCount: waitingProposals(db, userId) - 1,
    now,
  });
  const next = clone(db);
  Object.assign(next.events.find((e) => e.id === eventId)!, {
    title: input.title,
    description: input.description,
    subtype: input.subtype,
    lat: input.lat,
    lng: input.lng,
    address_text: input.address_text,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    capacity: input.capacity,
    gender_category: input.gender_category,
    base_points: BASE_POINTS_BY_SUBTYPE[input.subtype],
  });
  writeBranchesAndTerms(next, eventId, input, new Date(now).toISOString());
  return next;
}

/** Withdrawn: deleted with its own rows, as on the server (server/src/routes/events.ts says why). */
export function withdrawProposal(db: Db, userId: string, eventId: string): Db {
  rules.assertCanChangeProposal(getUser(db, userId)!, db.events.find((e) => e.id === eventId));
  const next = clone(db);
  next.events = next.events.filter((e) => e.id !== eventId);
  next.event_organizers = next.event_organizers.filter((x) => x.event_id !== eventId);
  next.event_branches = next.event_branches.filter((x) => x.event_id !== eventId);
  next.event_terms = next.event_terms.filter((x) => x.event_id !== eventId);
  return next;
}

// ---------- the profile ----------

/** The name and the city only (gender and phone never change). Checked before this with rules.cleanProfileEdit. */
export function updateProfile(db: Db, userId: string, edit: ProfileEdit): Db {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId)!;
  if (edit.full_name !== undefined) u.full_name = edit.full_name;
  if (edit.city !== undefined) u.city = edit.city;
  return next;
}

// ---------- profile photo ----------

/** The demo keeps the photo on the phone, inside its data, as a data: address. null removes it. */
export function setPhoto(db: Db, userId: string, dataUri: string | null): Db {
  const next = clone(db);
  next.users.find((u) => u.id === userId)!.avatar_url = dataUri;
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
  const a = db.attendance.find((x) => x.id === attendanceId);
  rules.assertCanConfirm(a, userId, a && db.events.find((e) => e.id === a.event_id));
  const next = clone(db);
  const row = next.attendance.find((x) => x.id === attendanceId)!;
  row.participant_status = 'confirmed';
  row.participant_acted_at = new Date(now).toISOString();
  const points = pointsForAttendance(next, row);
  if (points > 0) {
    next.points_ledger.push({
      id: newId('pl'),
      user_id: userId,
      event_id: row.event_id,
      points,
      reason: 'attendance_confirmed',
      created_at: new Date(now).toISOString(),
    });
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

// ---------- reports (بلاغ): a member tells the association ----------

/** Joined the event or supervises it (rules.wasAtEvent), as on the server. A deleted account was at nothing. */
export function wasAtEvent(db: Db, eventId: string, userId: string) {
  const u = getUser(db, userId);
  if (!u || u.deleted_at) return false;
  return rules.wasAtEvent(registrationOf(db, eventId, userId), isOrganizer(db, eventId, userId));
}

export function openReports(db: Db, userId: string) {
  return db.reports.filter((r) => r.reporter_id === userId && r.status === 'open').length;
}

export function canReport(db: Db, user: User) {
  return rules.canReport(user, levelFor(db, totalPoints(db, user.id)));
}

/**
 * A member's report. The demo has no admin, so it stays waiting. The fields
 * are checked before this (demoBackend.ts), as the server's request checks do.
 */
export function fileReport(db: Db, userId: string, input: ReportBody, now: number): { db: Db; report: Report } {
  const event = input.event_id ? getEvent(db, input.event_id) : null;
  const note = rules.cleanText(input.note);
  const subjectId = input.subject_id ?? null;
  rules.assertCanReport({
    user: getUser(db, userId)!,
    level: levelFor(db, totalPoints(db, userId)),
    category: input.category,
    note,
    event: event && {
      reporterWasThere: wasAtEvent(db, event.id, userId),
      subjectWasThere: !!subjectId && wasAtEvent(db, event.id, subjectId),
    },
    subjectId,
    openCount: openReports(db, userId),
  });
  const report: Report = {
    id: newId('rep'),
    reporter_id: userId,
    category: input.category,
    event_id: event?.id ?? null,
    subject_id: subjectId,
    note,
    status: 'open',
    created_at: new Date(now).toISOString(),
    handled_by: null,
    handled_at: null,
    handled_note: null,
  };
  const next = clone(db);
  next.reports.push(report);
  return { db: next, report };
}

// ---------- warnings (إنذار): a supervisor records one, the member may appeal ----------

/** The people one supervisor warned at one event (withdrawn warnings left out). */
export function warnedBy(db: Db, eventId: string, issuerId: string): Set<string> {
  return new Set(
    db.warnings.filter((w) => w.event_id === eventId && w.issued_by === issuerId && w.status !== 'withdrawn').map((w) => w.user_id),
  );
}

export function warn(db: Db, actorId: string, args: { eventId: string; userId: string; reason: string }, now: number): { db: Db; warning: Warning } {
  const event = getEvent(db, args.eventId);
  const reason = rules.cleanText(args.reason);
  rules.assertCanWarn({
    actorId,
    memberId: args.userId,
    actorIsOrganizer: isOrganizer(db, event.id, actorId),
    event,
    registration: registrationOf(db, event.id, args.userId),
    alreadyWarned: warnedBy(db, event.id, actorId).has(args.userId),
    reason,
    now,
  });
  const warning: Warning = {
    id: newId('warn'),
    user_id: args.userId,
    issued_by: actorId,
    event_id: event.id,
    reason: reason!,
    status: 'active',
    created_at: new Date(now).toISOString(),
    appealed_at: null,
    appeal_reason: null,
    decided_by: null,
    decided_at: null,
    decision_note: null,
  };
  const next = clone(db);
  next.warnings.push(warning);
  return { db: next, warning };
}

/** The member appeals their warning. The demo has no admin, so the appeal stays waiting. */
export function appealWarning(db: Db, userId: string, warningId: string, reason: string, now: number): Db {
  const cleaned = rules.cleanText(reason);
  rules.assertCanAppeal(db.warnings.find((w) => w.id === warningId), userId, cleaned);
  const next = clone(db);
  const w = next.warnings.find((x) => x.id === warningId)!;
  w.status = 'appealed';
  w.appealed_at = new Date(now).toISOString();
  w.appeal_reason = cleaned;
  return next;
}

// ---------- account ----------

/** App Store requires account deletion. Soft delete, as in Data_Model.md (users.deleted_at). */
export function deleteAccount(db: Db, userId: string, now: number): Db {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId);
  if (u) Object.assign(u, rules.erasedProfile(), { deleted_at: new Date(now).toISOString() });
  for (const r of next.registrations) if (r.user_id === userId) r.status = 'cancelled';
  return next;
}
