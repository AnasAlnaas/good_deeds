// The app's rules, written once. The real server (server/) and the offline
// demo (mobile/src/demo/server.ts) both call these functions, so they cannot
// drift apart. Every function is pure: it gets the rows it needs and the
// current time, then either throws an ApiError or says what to write.
// Finding and saving rows is the caller's job.
//
// The order of the checks inside each function decides which error a request
// gets when several rules fail at once; mobile/scripts/check-rules.ts and
// server/scripts/check-api.ts rely on it.

import { ApiError } from './errors';
import { END_GRACE_MINUTES } from './placeholders';
import type {
  AppEvent,
  Attendance,
  EventStatus,
  EventTerm,
  Level,
  Pillar,
  PointsLedgerEntry,
  Registration,
  ReportCategory,
  User,
  Warning,
} from './types';
import { PILLARS } from './types';

export const MS_HOUR = 3_600_000;
export const toMs = (iso: string) => new Date(iso).getTime();
export const toIso = (ms: number) => new Date(ms).toISOString();
export const round2 = (n: number) => Math.round(n * 100) / 100;

// A time more than a minute before the moment it is recorded counts as backdated.
const BACKDATE_AFTER_MS = 60_000;

type EventTimes = Pick<AppEvent, 'status' | 'starts_at' | 'ends_at'>;
type JoinableEvent = EventTimes & Pick<AppEvent, 'gender_category'>;

// ---------- event status ----------

export function effectiveStatus(e: EventTimes, now: number): EventStatus {
  if (e.status === 'cancelled' || e.status === 'draft' || e.status === 'rejected') return e.status;
  if (now >= toMs(e.ends_at)) return 'finished';
  if (now >= toMs(e.starts_at)) return 'running';
  return 'published';
}

export function canUserJoinCategory(user: Pick<User, 'gender'>, e: Pick<AppEvent, 'gender_category'>) {
  return e.gender_category === 'mixed' || e.gender_category === user.gender;
}

export function sortTerms<T extends Pick<EventTerm, 'order_index'>>(terms: T[]): T[] {
  return [...terms].sort((a, b) => a.order_index - b.order_index);
}

/** Drafts and turned-down drafts are seen only by whoever created them. */
export function isHidden(e: Pick<AppEvent, 'status'>) {
  return e.status === 'draft' || e.status === 'rejected';
}

export function canSeeEvent(viewer: Pick<User, 'id'>, e: Pick<AppEvent, 'status' | 'created_by'>) {
  return !isHidden(e) || e.created_by === viewer.id;
}

// ---------- creating events in the app ----------

// Owner's decision (2026-10-22): the master file's "level + direct nomination"
// means a level that allows it (level 5 in placeholders.ts), or being named a
// supervisor or admin by the association.
export function canCreateEvents(user: Pick<User, 'role'>, level: Pick<Level, 'can_create_events'>) {
  return level.can_create_events || user.role === 'supervisor' || user.role === 'admin';
}

// Owner's decision (2026-10-22): how many proposals one person may have waiting for an admin at once.
export const MAX_WAITING_PROPOSALS = 3;

/**
 * A member proposing an event. The creator becomes its supervisor, so they may
 * choose only an event they could take part in themselves: their own men /
 * women category, or mixed (owner's decision, 2026-10-22). It must start in the future.
 */
export function assertCanProposeEvent(args: {
  user: Pick<User, 'role' | 'gender'>;
  level: Pick<Level, 'can_create_events'>;
  event: Pick<AppEvent, 'starts_at' | 'gender_category'>;
  /** The creator's events still waiting for an admin (drafts). */
  waitingCount: number;
  now: number;
}) {
  const { user, event } = args;
  if (!canCreateEvents(user, args.level)) throw new ApiError('cannot_create_events');
  if (!canUserJoinCategory(user, event)) throw new ApiError('category_not_allowed');
  if (toMs(event.starts_at) <= args.now) throw new ApiError('starts_in_past');
  if (user.role !== 'admin' && args.waitingCount >= MAX_WAITING_PROPOSALS) throw new ApiError('too_many_proposals');
}

/** Owner's decision (2026-10-22): an admin approves every event made in the app; an admin's own is published at once. */
export function proposalStatus(user: Pick<User, 'role'>): 'draft' | 'published' {
  return user.role === 'admin' ? 'published' : 'draft';
}

// ---------- profile photos ----------

/** Owner's decision (2026-10-22): a photo is seen by its owner, by admins, and by people of the same gender. */
export function canSeePhoto(viewer: Pick<User, 'id' | 'gender' | 'role'>, owner: Pick<User, 'id' | 'gender'>) {
  return viewer.id === owner.id || viewer.role === 'admin' || viewer.gender === owner.gender;
}

/** Photos are sent as a square JPEG of this many pixels a side, and never bigger than PHOTO_MAX_BYTES. */
export const PHOTO_SIZE_PX = 512;
export const PHOTO_MAX_BYTES = 300_000;

// ---------- joining ----------

function assertJoinable(user: Pick<User, 'gender'>, e: JoinableEvent, now: number) {
  const status = effectiveStatus(e, now);
  if (status !== 'published' && status !== 'running') throw new ApiError('event_closed');
  if (!canUserJoinCategory(user, e)) throw new ApiError('gender_not_allowed');
}

/**
 * Opening (or reopening) a registration so the user can go through the terms.
 * `create`: insert a pending_terms registration · `reopen`: set the cancelled one
 * back to pending_terms · `nothing`: it is already pending.
 */
export function decideStartJoin(args: {
  user: Pick<User, 'gender'>;
  event: JoinableEvent;
  registration: Registration | undefined;
  now: number;
}): 'create' | 'reopen' | 'nothing' {
  assertJoinable(args.user, args.event, args.now);
  const reg = args.registration;
  if (reg?.status === 'joined') throw new ApiError('already_joined');
  if (reg?.status === 'pending_terms') return 'nothing';
  return reg ? 'reopen' : 'create';
}

/**
 * Accepting one term. Terms are accepted strictly in order, one at a time.
 * On `accept`, the caller also sets events.terms_locked_at if it is still
 * empty: nobody may agree to a text that later changes.
 */
export function decideAcceptTerm(args: {
  registration: Registration | undefined;
  terms: EventTerm[];
  acceptedTermIds: string[];
  termId: string;
}): 'accept' | 'nothing' {
  const { registration, acceptedTermIds, termId } = args;
  if (!registration || registration.status === 'cancelled') throw new ApiError('not_joined');
  if (acceptedTermIds.includes(termId)) return 'nothing';
  const next = sortTerms(args.terms).find((x) => !acceptedTermIds.includes(x.id));
  if (!next || next.id !== termId) throw new ApiError('term_out_of_order');
  return 'accept';
}

/** Turning a registration into `joined`: only after every term is accepted, and only if there is room. */
export function assertCompleteJoin(args: {
  user: Pick<User, 'gender'>;
  event: JoinableEvent & Pick<AppEvent, 'capacity'>;
  registration: Registration | undefined;
  terms: EventTerm[];
  acceptedTermIds: string[];
  /** Users with a `joined` registration for this event, deleted accounts excluded. */
  joinedCount: number;
  now: number;
}) {
  assertJoinable(args.user, args.event, args.now);
  const reg = args.registration;
  if (!reg || reg.status === 'cancelled') throw new ApiError('not_joined');
  if (reg.status === 'joined') throw new ApiError('already_joined');
  if (args.terms.some((x) => !args.acceptedTermIds.includes(x.id))) throw new ApiError('terms_incomplete');
  if (args.joinedCount >= args.event.capacity) throw new ApiError('event_full');
}

export function assertCancelJoin(args: { registration: Registration | undefined; hasAttendance: boolean }) {
  if (!args.registration || args.registration.status !== 'joined') throw new ApiError('not_joined');
  if (args.hasAttendance) throw new ApiError('cannot_cancel_after_attendance');
}

// ---------- attendance (recorded by a supervisor of THIS event) ----------

function assertRecorder(args: { actorId: string; participantId: string; actorIsOrganizer: boolean }) {
  if (!args.actorIsOrganizer) throw new ApiError('not_organizer');
  if (args.actorId === args.participantId) throw new ApiError('cannot_record_self');
}

/** Recording when a participant started. `startedAt` absent = now; earlier = backdated, never before the event. */
export function decideRecordStart(args: {
  actorId: string;
  participantId: string;
  actorIsOrganizer: boolean;
  event: Pick<AppEvent, 'starts_at' | 'ends_at'>;
  registration: Registration | undefined;
  attendance: Attendance | undefined;
  startedAt?: number;
  now: number;
}): Pick<Attendance, 'started_at' | 'start_source'> {
  const { event, now } = args;
  assertRecorder(args);
  if (now < toMs(event.starts_at)) throw new ApiError('event_not_started');
  if (now > toMs(event.ends_at)) throw new ApiError('event_closed');
  if (args.registration?.status !== 'joined') throw new ApiError('not_joined');
  if (args.attendance) throw new ApiError('already_started');
  const startedAt = args.startedAt ?? now;
  if (startedAt < toMs(event.starts_at)) throw new ApiError('start_before_event');
  if (startedAt > now) throw new ApiError('time_in_future');
  return {
    started_at: toIso(startedAt),
    start_source: now - startedAt > BACKDATE_AFTER_MS ? 'backdated' : 'live',
  };
}

/** Recording when a participant finished. The hours are computed here, never by a screen. */
export function decideRecordEnd(args: {
  actorId: string;
  participantId: string;
  actorIsOrganizer: boolean;
  event: Pick<AppEvent, 'ends_at'>;
  attendance: Attendance | undefined;
  endedAt?: number;
  now: number;
}): Pick<Attendance, 'ended_at' | 'end_source' | 'hours'> {
  const { attendance: a, now } = args;
  assertRecorder(args);
  if (!a) throw new ApiError('not_started');
  if (a.ended_at) throw new ApiError('already_ended');
  const endedAt = args.endedAt ?? now;
  if (endedAt > now) throw new ApiError('time_in_future');
  if (endedAt <= toMs(a.started_at)) throw new ApiError('end_before_start');
  if (endedAt > toMs(args.event.ends_at) + END_GRACE_MINUTES * 60_000) throw new ApiError('end_after_event');
  return {
    ended_at: toIso(endedAt),
    end_source: now - endedAt > BACKDATE_AFTER_MS ? 'backdated' : 'live',
    hours: round2((endedAt - toMs(a.started_at)) / MS_HOUR),
  };
}

/** Scheduled job: attendance still open when its event ends is closed at the event's end. `null` = leave it. */
export function decideAutoClose(
  a: Pick<Attendance, 'started_at' | 'ended_at'>,
  event: Pick<AppEvent, 'ends_at'>,
  now: number,
): Pick<Attendance, 'ended_at' | 'end_source' | 'hours'> | null {
  if (a.ended_at || now < toMs(event.ends_at)) return null;
  return {
    ended_at: event.ends_at,
    end_source: 'auto_closed',
    hours: round2((toMs(event.ends_at) - toMs(a.started_at)) / MS_HOUR),
  };
}

// ---------- participant confirms or disputes what was recorded ----------

// ⚠️ ASSUMPTION: points are credited when the participant confirms (DESIGN.md
// puts the reward moment there). A disputed record earns nothing until an
// admin decides — that flow is not built yet.
export function assertCanConfirm(a: Attendance | undefined, userId: string): asserts a is Attendance {
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (!a.ended_at) throw new ApiError('not_started');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
}

export function assertCanDispute(a: Attendance | undefined, userId: string): asserts a is Attendance {
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
}

// ---------- points and levels ----------

// ⚠️ PLACEHOLDER: how an event's points split across pillars is not written
// down yet. Here each branch→pillar link of the event's branches counts once,
// then the weights are normalised to sum to 1.
export function pillarWeights(links: Pillar[]): Record<Pillar, number> {
  const w: Record<Pillar, number> = { spiritual: 0, mental: 0, physical: 0 };
  for (const p of links) w[p] += 1;
  const sum = PILLARS.reduce((s, p) => s + w[p], 0) || 1;
  for (const p of PILLARS) w[p] = w[p] / sum;
  return w;
}

export function dominantPillar(w: Record<Pillar, number>): Pillar {
  return PILLARS.reduce((best, p) => (w[p] > w[best] ? p : best), 'physical' as Pillar);
}

/** The master file's formula: points = event points × attendance ratio, split by pillar weight. */
export function pointsForAttendance(
  event: Pick<AppEvent, 'starts_at' | 'ends_at' | 'base_points'>,
  hours: number | null,
  weights: Record<Pillar, number>,
): Record<Pillar, number> {
  const duration = (toMs(event.ends_at) - toMs(event.starts_at)) / MS_HOUR;
  const ratio = Math.min(1, (hours ?? 0) / duration);
  const total = event.base_points * ratio;
  return {
    spiritual: round2(total * weights.spiritual),
    mental: round2(total * weights.mental),
    physical: round2(total * weights.physical),
  };
}

export function pointsByPillar(ledger: Pick<PointsLedgerEntry, 'pillar' | 'points'>[]): Record<Pillar, number> {
  const r: Record<Pillar, number> = { spiritual: 0, mental: 0, physical: 0 };
  for (const l of ledger) r[l.pillar] += l.points;
  for (const p of PILLARS) r[p] = round2(r[p]);
  return r;
}

export function totalOf(byPillar: Record<Pillar, number>) {
  return round2(byPillar.spiritual + byPillar.mental + byPillar.physical);
}

export function levelFor(levels: Level[], points: number): Level {
  return [...levels].sort((a, b) => b.min_points - a.min_points).find((l) => points >= l.min_points) ?? levels[0];
}

export function nextLevel(levels: Level[], points: number): Level | undefined {
  return [...levels].sort((a, b) => a.min_points - b.min_points).find((l) => l.min_points > points);
}

// ---------- reports (بلاغ): a member tells the association ----------
//
// Kept apart from warnings, as the master file decides ("فصل البلاغ (عضو) عن
// الإنذار (مشرف)"). Owner's decision (2026-10-22): a report may be about
// anything, by category, with an optional note. It may be tied to an event the
// reporter was at, and name someone at that event. Only admins read reports;
// the person named is never told and never sees it.

export const REPORT_NOTE_MAX = 1000;
/** How many of the events a person was at the report screen offers, latest first. */
export const REPORT_FORM_EVENTS = 20;
// ⚠️ ASSUMPTION: how many of one person's reports may wait for an admin at once, so a flood cannot bury the others.
export const MAX_OPEN_REPORTS = 5;

/** Text someone typed, trimmed; null when nothing is left. */
export const cleanText = (text: string | null | undefined) => text?.trim() || null;

// ⚠️ ASSUMPTION: like proposing events, supervisors and admins may report whatever their level.
export function canReport(user: Pick<User, 'role'>, level: Pick<Level, 'can_report'>) {
  return level.can_report || user.role === 'supervisor' || user.role === 'admin';
}

/** Someone "at" an event: they joined it or they supervise it. */
export function wasAtEvent(registration: Pick<Registration, 'status'> | undefined, isOrganizer: boolean) {
  return isOrganizer || registration?.status === 'joined';
}

export function assertCanReport(args: {
  user: Pick<User, 'id' | 'role'>;
  level: Pick<Level, 'can_report'>;
  category: ReportCategory;
  /** Already cleaned (cleanText). */
  note: string | null;
  /** The event it is about (null = none), and which of the two people were at it. */
  event: { reporterWasThere: boolean; subjectWasThere: boolean } | null;
  subjectId: string | null;
  /** The reporter's reports still waiting for an admin. */
  openCount: number;
}) {
  if (!canReport(args.user, args.level)) throw new ApiError('cannot_report');
  // ⚠️ ASSUMPTION: the note is optional, except for "something else", which says nothing without one.
  if (args.category === 'other' && !args.note) throw new ApiError('note_required');
  if (args.subjectId === args.user.id) throw new ApiError('cannot_report_self');
  if (args.event && !args.event.reporterWasThere) throw new ApiError('not_at_event');
  // Someone is named only as one of the people at that event.
  if (args.subjectId && !args.event?.subjectWasThere) throw new ApiError('person_not_at_event');
  if (args.openCount >= MAX_OPEN_REPORTS) throw new ApiError('too_many_reports');
}

// ---------- warnings (إنذار): a supervisor records one ----------
//
// Owner's decisions (2026-10-22/23): a supervisor of an event warns someone who
// joined that event, with a reason. A warning is recorded only: it takes no
// points and blocks nothing; admins decide what to do about it. The member is
// told and sees it, and so do admins, nobody else (Superseded_Decisions.md: a
// warning stays between the association and the member). One kind, no severity.
// The member may appeal once; an admin keeps the warning or withdraws it.
// (Build_Plan.md said "the primary supervisor only"; the owner chose any supervisor of the event.)

export const REASON_MAX = 500;
// ⚠️ ASSUMPTION: a warning can be given from the event's start until this many days after it ends.
export const WARN_DAYS_AFTER_EVENT = 7;

export function assertCanWarn(args: {
  actorId: string;
  memberId: string;
  actorIsOrganizer: boolean;
  event: Pick<AppEvent, 'status' | 'starts_at' | 'ends_at'>;
  registration: Pick<Registration, 'status'> | undefined;
  /** This supervisor already warned this person at this event (a withdrawn warning does not count). */
  alreadyWarned: boolean;
  /** Already cleaned (cleanText). */
  reason: string | null;
  now: number;
}) {
  const { event, now } = args;
  if (!args.actorIsOrganizer) throw new ApiError('not_organizer');
  if (args.actorId === args.memberId) throw new ApiError('cannot_warn_self');
  if (now < toMs(event.starts_at)) throw new ApiError('event_not_started');
  if (event.status === 'cancelled' || now > toMs(event.ends_at) + WARN_DAYS_AFTER_EVENT * 24 * MS_HOUR) {
    throw new ApiError('event_closed');
  }
  if (args.registration?.status !== 'joined') throw new ApiError('not_joined');
  // ⚠️ ASSUMPTION: one warning per supervisor, person and event, so a second tap does not give two.
  // Kept per supervisor so one supervisor's refusal never tells another that a warning exists.
  if (args.alreadyWarned) throw new ApiError('already_warned');
  if (!args.reason) throw new ApiError('reason_required');
}

/** The member appeals their own warning, once, with a reason. */
export function assertCanAppeal(w: Warning | undefined, userId: string, reason: string | null): asserts w is Warning {
  if (!w) throw new ApiError('not_found');
  if (w.user_id !== userId) throw new ApiError('not_your_warning');
  if (w.status === 'withdrawn') throw new ApiError('warning_withdrawn');
  if (w.status !== 'active') throw new ApiError('already_appealed');
  if (!reason) throw new ApiError('reason_required');
}
