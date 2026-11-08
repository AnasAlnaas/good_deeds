// The app's rules, written once. The real server (server/) and the offline
// demo (mobile/src/demo/server.ts) both call these functions, so they cannot
// drift apart. Every function is pure: it gets the rows it needs and the
// current time, then either throws an ApiError or says what to write.
// Finding and saving rows is the caller's job.
//
// The order of the checks inside each function decides which error a request
// gets when several rules fail at once; mobile/scripts/check-rules.ts and
// server/scripts/check-api.ts rely on it.

import { cityOf } from './cities';
import { ApiError } from './errors';
import { END_GRACE_MINUTES } from './placeholders';
import { MEETING_PLATFORMS, NOTICE_KINDS, NOTICE_REACTIONS } from './types';
import type {
  AppEvent,
  Attendance,
  EventStatus,
  EventLesson,
  EventTerm,
  EventNotice,
  Level,
  NoticeKind,
  NoticeReaction,
  PointsLedgerEntry,
  Registration,
  ReportCategory,
  User,
  Warning,
} from './types';

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

/**
 * The proposer editing or withdrawing their own event while it still waits for
 * an admin. Someone else's draft is not found, as everywhere else. Once an admin
 * has decided (published or turned down), only admins change it, in the panel.
 * An edit is then checked like a new proposal (assertCanProposeEvent), with
 * this draft left out of the waiting count.
 */
export function assertCanChangeProposal<E extends Pick<AppEvent, 'status' | 'created_by'>>(
  user: Pick<User, 'id'>,
  e: E | undefined,
): asserts e is E {
  if (!e || !canSeeEvent(user, e)) throw new ApiError('not_found');
  if (e.created_by !== user.id || e.status !== 'draft') throw new ApiError('proposal_not_waiting');
}

// ---------- the profile ----------

// Sign-up (server/src/routes/auth.ts) and a profile edit take a name and a city alike.
export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const CITY_MAX = 60;

/** Arabic keyboards type ٠١٢… (and Persian ones ۰۱۲…); numbers are kept in 0–9. */
export function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Sign-in is for Libyan mobile numbers only: 09X then 7 digits, where 09X is
 * one of the mobile prefixes 091–095. Stored and sent as +2189X…….
 */
export const LIBYAN_MOBILE = /^\+2189[1-5]\d{7}$/;

/**
 * A phone number as people type it (091 234 5678, 0912345678, 912345678,
 * +218 91 234 5678, 00218…, Arabic digits, spaces, dashes) in the form above.
 * null = not a Libyan mobile number.
 */
export function libyanMobile(input: string): string | null {
  // Copied numbers can carry direction marks (U+200E, U+200F, U+2066–U+2069).
  let digits = latinDigits(input).replace(/[\s\-().\u200e\u200f\u2066-\u2069]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.startsWith('00218')) digits = digits.slice(5);
  else if (digits.startsWith('218')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  const phone = `+218${digits}`;
  return LIBYAN_MOBILE.test(phone) ? phone : null;
}

// ---------- the email address ----------

// Every account has an email address as well as its phone (owner's decision,
// 2026-11-04): a forgotten password is reset with a code sent to it, and one may
// sign in with either. An address is confirmed with a code before it is kept.
export const EMAIL_MAX = 254;

/**
 * An email address as people type it, in the form it is stored and compared:
 * trimmed and in lowercase. null = not an email address.
 */
export function cleanEmail(input: string): string | null {
  const email = input.replace(/[\s‎‏⁦-⁩]/g, '').toLowerCase();
  if (email.length > EMAIL_MAX) return null;
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email) ? email : null;
}

/** Repeated spaces or tabs become one space; the Arabic stretching mark (ـ) is dropped. */
const tidy = (text: string) => text.replace(/\u0640/g, '').replace(/\s+/g, ' ').trim();

// ---------- the password ----------

// There is no SMS check of the number (too costly for now): an account is its
// phone number, its confirmed email address and a password. A forgotten
// password is reset with a one-time code sent to the email, or one that an
// admin gives the person (server/src/routes/auth.ts).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * A password as it is checked and stored: the same whichever keyboard typed it
 * (\u0660\u0661\u0662 and 012 alike, one Unicode form for Arabic letters with marks).
 */
export function normalizePassword(password: string): string {
  return latinDigits(password).normalize('NFC');
}

/**
 * Why a new password is refused, or null if it may be used: at least 8
 * characters, not one or two characters over and over, not a run like
 * 12345678, and without the phone number in it ('' = the number is not known
 * yet, as when the app resets a password by email: the server checks it).
 */
export function passwordProblem(password: string, phone: string): 'password_too_short' | 'password_too_simple' | null {
  const p = normalizePassword(password);
  if ([...p].length < PASSWORD_MIN) return 'password_too_short';
  const local = phone.replace(/^\+218/, '');
  const runs = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz'];
  if (new Set(p).size < 3 || (local && p.includes(local)) || runs.some((r) => r.includes(p.toLowerCase()))) return 'password_too_simple';
  return null;
}

/**
 * A name and family name (الاسم واللقب): letters only (Arabic or Latin, with
 * their marks), at least two words, each of at least two letters; a hyphen or
 * apostrophe may join parts. null = not a name.
 */
export function cleanName(input: string): string | null {
  const name = tidy(input);
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  const words = name.split(' ');
  if (words.length < 2) return null;
  const word = /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u;
  return words.every((w) => word.test(w) && w.replace(/\P{L}/gu, '').length >= 2) ? name : null;
}

/** A city from the list (shared/cities.ts), as stored: its Arabic name. null = not in the list. */
export function cleanCity(input: string): string | null {
  return cityOf(tidy(input));
}

/**
 * A profile edit, trimmed, keeping only what may change: the name and the city.
 * Gender never changes (it decides which events a person may join and who sees
 * their photo), nor does the phone (it is how they sign in).
 * null = nothing to change, or a name or city that does not fit.
 */
export function cleanProfileEdit(edit: { full_name?: string; city?: string }): { full_name?: string; city?: string } | null {
  const out: { full_name?: string; city?: string } = {};
  if (edit.full_name !== undefined) {
    const name = cleanName(edit.full_name);
    if (!name) return null;
    out.full_name = name;
  }
  if (edit.city !== undefined) {
    const city = cleanCity(edit.city);
    if (!city) return null;
    out.city = city;
  }
  return Object.keys(out).length ? out : null;
}

// ---------- profile photos ----------

/** Owner's decision (2026-10-22): a photo is seen by its owner, by admins, and by people of the same gender. */
export function canSeePhoto(viewer: Pick<User, 'id' | 'gender' | 'role'>, owner: Pick<User, 'id' | 'gender'>) {
  return viewer.id === owner.id || viewer.role === 'admin' || viewer.gender === owner.gender;
}

/** Photos are sent as a square JPEG of this many pixels a side, and never bigger than PHOTO_MAX_BYTES. */
export const PHOTO_SIZE_PX = 512;
export const PHOTO_MAX_BYTES = 300_000;

// ---------- the event's learning corner (ركن التعلم) ----------
//
// Owner's decision (2026-11-07): an event has a few short lessons, written by
// whoever proposes it (an admin, or someone who may create events) and approved
// by an admin with the event. Anyone who can see the event may read them and
// mark them learned, before deciding to join; joining needs every one learned,
// before the terms. The profile gathers every lesson the person learned.

export const MAX_LESSONS = 10;
export const LESSON_TITLE_MAX = 120;
export const LESSON_BODY_MAX = 4000;

// Owner's decision (2026-11-08): a lesson is text, a picture (an infographic,
// a diagram), or both, from the same people who write lessons. The app and the
// panel make a picture at most LESSON_IMAGE_WIDTH_PX wide and
// LESSON_IMAGE_MAX_HEIGHT_PX tall, a JPEG of at most LESSON_IMAGE_MAX_BYTES.
export const LESSON_IMAGE_WIDTH_PX = 1080;
export const LESSON_IMAGE_MAX_HEIGHT_PX = 4320;
export const LESSON_IMAGE_MAX_BYTES = 1_000_000;

/** A lesson says something: a title, and text, a picture or a video (any of them together). */
export function lessonComplete(l: { title: string; body: string; image_id?: string | null; video_id?: string | null }) {
  return l.title.trim().length > 0 && (l.body.trim().length > 0 || !!l.image_id || !!l.video_id);
}

// Owner's decision (2026-11-08): a lesson may show a YouTube video. Only the
// video's id is kept, never the link as written, so a lesson can only ever
// open YouTube itself.

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];

export const isYoutubeId = (id: string) => YOUTUBE_ID.test(id);

/**
 * The video's id in a YouTube link: youtube.com/watch?v=…, youtu.be/…, and
 * /shorts/, /embed/, /live/ or /v/ links. null when it is no YouTube video link.
 */
export function youtubeId(link: string): string | null {
  const text = link.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (YOUTUBE_HOSTS.includes(host)) {
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (first === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(first ?? '')) id = second ?? null;
  }
  return id && isYoutubeId(id) ? id : null;
}

/** Where a lesson's video is watched on YouTube, and its still picture (YouTube's own, public). */
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function sortLessons<T extends Pick<EventLesson, 'order_index'>>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) => a.order_index - b.order_index);
}

export function learnedAll(lessons: Pick<EventLesson, 'id'>[], learnedLessonIds: string[]) {
  return lessons.every((l) => learnedLessonIds.includes(l.id));
}

/**
 * Marking one of an event's lessons learned, in any order. A draft's lessons
 * are read by its creator only, as a preview: nothing is learned from an event
 * that nobody else can see yet.
 */
export function decideLearnLesson(args: {
  event: Pick<AppEvent, 'status'>;
  lesson: Pick<EventLesson, 'id'> | undefined;
  learnedLessonIds: string[];
}): 'learn' | 'nothing' {
  if (!args.lesson) throw new ApiError('not_found');
  if (isHidden(args.event)) throw new ApiError('event_closed');
  return args.learnedLessonIds.includes(args.lesson.id) ? 'nothing' : 'learn';
}

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
  lessons: Pick<EventLesson, 'id'>[];
  learnedLessonIds: string[];
}): 'accept' | 'nothing' {
  const { registration, acceptedTermIds, termId } = args;
  if (!registration || registration.status === 'cancelled') throw new ApiError('not_joined');
  if (acceptedTermIds.includes(termId)) return 'nothing';
  // The event's lessons come first: nobody agrees to the terms of work they have not learned.
  if (!learnedAll(args.lessons, args.learnedLessonIds)) throw new ApiError('lessons_incomplete');
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
  lessons: Pick<EventLesson, 'id'>[];
  learnedLessonIds: string[];
  /** Users with a `joined` registration for this event, deleted accounts excluded. */
  joinedCount: number;
  now: number;
}) {
  assertJoinable(args.user, args.event, args.now);
  const reg = args.registration;
  if (!reg || reg.status === 'cancelled') throw new ApiError('not_joined');
  if (reg.status === 'joined') throw new ApiError('already_joined');
  if (!learnedAll(args.lessons, args.learnedLessonIds)) throw new ApiError('lessons_incomplete');
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

/**
 * A record made on the supervisor's phone without a connection reaches the
 * server later, with `recordedAt`: when it was tapped. It is judged as at that
 * moment (the event was running, the time was not in the future), not as at
 * its arrival. The phone's clock may be a little ahead of the server's; a
 * record older than this is refused, as nobody would remember it right.
 */
export const OFFLINE_RECORD_MAX_HOURS = 48;
const CLOCK_SKEW_MS = 5 * 60_000;

/** The moment a record was made: now, or when it was tapped offline (see OFFLINE_RECORD_MAX_HOURS). */
function recordingMoment(recordedAt: number | undefined, now: number): number {
  if (recordedAt === undefined) return now;
  if (recordedAt > now + CLOCK_SKEW_MS) throw new ApiError('time_in_future');
  if (recordedAt < now - OFFLINE_RECORD_MAX_HOURS * MS_HOUR) throw new ApiError('sent_too_late');
  return Math.min(recordedAt, now);
}

/**
 * Recording when a participant started. `startedAt` absent = the moment it is
 * recorded; earlier = backdated, never before the event. `recordedAt`: made
 * offline at that moment (recordingMoment).
 */
export function decideRecordStart(args: {
  actorId: string;
  participantId: string;
  actorIsOrganizer: boolean;
  event: Pick<AppEvent, 'status' | 'starts_at' | 'ends_at'>;
  registration: Registration | undefined;
  attendance: Attendance | undefined;
  startedAt?: number;
  recordedAt?: number;
  now: number;
}): Pick<Attendance, 'started_at' | 'start_source' | 'recorded_at'> {
  const { event } = args;
  assertRecorder(args);
  const at = recordingMoment(args.recordedAt, args.now);
  // A cancelled event keeps its time and its joined members, but nobody works at it.
  if (event.status === 'cancelled') throw new ApiError('event_closed');
  if (at < toMs(event.starts_at)) throw new ApiError('event_not_started');
  if (at > toMs(event.ends_at)) throw new ApiError('event_closed');
  if (args.registration?.status !== 'joined') throw new ApiError('not_joined');
  if (args.attendance) throw new ApiError('already_started');
  const startedAt = args.startedAt ?? at;
  if (startedAt < toMs(event.starts_at)) throw new ApiError('start_before_event');
  if (startedAt > at) throw new ApiError('time_in_future');
  return {
    started_at: toIso(startedAt),
    start_source: at - startedAt > BACKDATE_AFTER_MS ? 'backdated' : 'live',
    recorded_at: toIso(at),
  };
}

/**
 * Recording when a participant finished. The hours are computed here, never by
 * a screen. `recordedAt`: made offline at that moment (recordingMoment). Such
 * a record may arrive after the event's end closed the attendance by itself:
 * the supervisor's real time then replaces the automatic one, as long as the
 * participant has not answered it yet.
 */
export function decideRecordEnd(args: {
  actorId: string;
  participantId: string;
  actorIsOrganizer: boolean;
  event: Pick<AppEvent, 'status' | 'ends_at'>;
  attendance: Attendance | undefined;
  endedAt?: number;
  recordedAt?: number;
  now: number;
}): Pick<Attendance, 'ended_at' | 'end_source' | 'hours'> {
  const { attendance: a } = args;
  assertRecorder(args);
  const at = recordingMoment(args.recordedAt, args.now);
  if (args.event.status === 'cancelled') throw new ApiError('event_closed');
  if (!a) throw new ApiError('not_started');
  const replacesAutoClose = args.recordedAt !== undefined && a.end_source === 'auto_closed' && a.participant_status === 'pending';
  if (a.ended_at && !replacesAutoClose) throw new ApiError('already_ended');
  const endedAt = args.endedAt ?? at;
  if (endedAt > at) throw new ApiError('time_in_future');
  if (endedAt <= toMs(a.started_at)) throw new ApiError('end_before_start');
  if (endedAt > toMs(args.event.ends_at) + END_GRACE_MINUTES * 60_000) throw new ApiError('end_after_event');
  return {
    ended_at: toIso(endedAt),
    end_source: at - endedAt > BACKDATE_AFTER_MS ? 'backdated' : 'live',
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
/** `event` is the record's event: hours at a cancelled event earn nothing. */
export function assertCanConfirm(
  a: Attendance | undefined,
  userId: string,
  event: Pick<AppEvent, 'status'> | undefined,
): asserts a is Attendance {
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (!a.ended_at) throw new ApiError('not_started');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
  if (event?.status === 'cancelled') throw new ApiError('event_closed');
}

export function assertCanDispute(a: Attendance | undefined, userId: string): asserts a is Attendance {
  if (!a) throw new ApiError('not_found');
  if (a.user_id !== userId) throw new ApiError('not_your_attendance');
  if (a.participant_status !== 'pending') throw new ApiError('already_acted');
}

// ---------- points and levels ----------

/** The master file's formula: points = event points × attendance ratio. */
export function pointsForAttendance(event: Pick<AppEvent, 'starts_at' | 'ends_at' | 'base_points'>, hours: number | null): number {
  const duration = (toMs(event.ends_at) - toMs(event.starts_at)) / MS_HOUR;
  const ratio = Math.min(1, (hours ?? 0) / duration);
  return round2(event.base_points * ratio);
}

export function totalPoints(ledger: Pick<PointsLedgerEntry, 'points'>[]): number {
  return round2(ledger.reduce((sum, l) => sum + l.points, 0));
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
// Owner's decision (2026-10-23): how many of one person's reports may wait for an admin at once, so a flood cannot bury the others.
export const MAX_OPEN_REPORTS = 5;

/** Text someone typed, trimmed; null when nothing is left. */
export const cleanText = (text: string | null | undefined) => text?.trim() || null;

// Owner's decision (2026-10-23): like proposing events, supervisors and admins may report whatever their level.
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
  // Owner's decision (2026-10-23): the note is optional, except for "something else", which says nothing without one.
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
// Owner's decision (2026-10-23): a warning can be given from the event's start until this many days after it ends.
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
  // Owner's decision (2026-10-23): one warning per supervisor, person and event, so a second tap does not give two.
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

// ---------- an event's supervisors ----------
// Owner's decision (2026-11-03): a supervisor is not alone at an event. A
// supervisor of it, or an admin, may make one or two of the people who joined it
// supervisors too; they then do all a supervisor does there (record attendance,
// give warnings, post notices, add or take off a supervisor).

/** The supervisors one event may have: the one it was made with and up to two more. */
export const MAX_EVENT_SUPERVISORS = 3;

/** Who may run an event in the app: its supervisors, and admins. */
export function canManageEvent(user: Pick<User, 'role'>, isOrganizer: boolean) {
  return isOrganizer || user.role === 'admin';
}

/** An event still being prepared or held: one that is cancelled, a draft or over is past changing. */
function assertEventOpen(event: EventTimes, now: number) {
  if (event.status === 'cancelled' || isHidden(event) || now >= toMs(event.ends_at)) throw new ApiError('event_closed');
}

export function assertCanAddSupervisor(args: {
  actorCanManage: boolean;
  event: EventTimes;
  /** The registration of the person to add. */
  registration: Pick<Registration, 'status'> | undefined;
  alreadySupervisor: boolean;
  supervisorCount: number;
  now: number;
}) {
  if (!args.actorCanManage) throw new ApiError('not_organizer');
  assertEventOpen(args.event, args.now);
  if (args.alreadySupervisor) throw new ApiError('already_supervisor');
  // Only someone who joined: they accepted its terms and fit its category.
  if (args.registration?.status !== 'joined') throw new ApiError('not_joined');
  if (args.supervisorCount >= MAX_EVENT_SUPERVISORS) throw new ApiError('too_many_supervisors');
}

/**
 * Taking a supervisor off an event in the app: only one added in the app (the
 * ones it was made with are the admins' to change, in the panel), and never the
 * last. A supervisor may also step down this way.
 */
export function assertCanRemoveSupervisor(args: {
  actorCanManage: boolean;
  event: EventTimes;
  link: { added_by: string | null } | undefined;
  supervisorCount: number;
  now: number;
}) {
  if (!args.actorCanManage) throw new ApiError('not_organizer');
  assertEventOpen(args.event, args.now);
  if (!args.link) throw new ApiError('not_supervisor');
  if (args.link.added_by === null || args.supervisorCount <= 1) throw new ApiError('cannot_remove_supervisor');
}

// ---------- online events ----------

// Owner's decision (2026-11-07): an event is in a place or online. An online
// event has a platform and a meeting link instead of an address and a map pin.
// The link is for the people who joined, from a little before the start to the
// end, so it is not passed around; supervisors and admins always see it.
// Attendance is recorded by a supervisor, as at any event.

/** The meeting link shows this long before the start (and a notification says so). */
export const MEETING_LINK_OPENS_MINUTES = 30;
export const MEETING_URL_MAX = 500;
export const ADDRESS_MAX = 200;

/** When those who joined an online event see its link. */
export function meetingLinkOpensAt(e: Pick<AppEvent, 'starts_at'>) {
  return toIso(toMs(e.starts_at) - MEETING_LINK_OPENS_MINUTES * 60_000);
}

export function canSeeMeetingLink(args: {
  event: Pick<AppEvent, 'location_type' | 'meeting_url' | 'status' | 'starts_at' | 'ends_at'>;
  /** A supervisor of the event, or an admin (canManageEvent). */
  canManage: boolean;
  registration: Pick<Registration, 'status'> | undefined;
  now: number;
}) {
  const { event, now } = args;
  if (event.location_type !== 'online' || !event.meeting_url) return false;
  if (args.canManage) return true;
  if (event.status === 'cancelled' || isHidden(event) || args.registration?.status !== 'joined') return false;
  return now >= toMs(meetingLinkOpensAt(event)) && now < toMs(event.ends_at);
}

type PlaceFields = Pick<AppEvent, 'location_type' | 'address_text' | 'lat' | 'lng' | 'meeting_platform' | 'meeting_url'>;

/** A meeting link: an https address, as the platforms give them. */
export function isMeetingUrl(url: string) {
  if (url.length > MEETING_URL_MAX || /\s/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Where an event happens, as a form sent it: the fields its kind needs, cleaned,
 * and those of the other kind emptied. null = something needed is missing or wrong.
 */
export function cleanPlace(input: {
  location_type: string;
  address_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  meeting_platform?: string | null;
  meeting_url?: string | null;
}): PlaceFields | null {
  if (input.location_type === 'in_person') {
    const address = input.address_text?.trim() ?? '';
    const { lat, lng } = input;
    if (!address || address.length > ADDRESS_MAX) return null;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return null;
    return { location_type: 'in_person', address_text: address, lat, lng, meeting_platform: null, meeting_url: null };
  }
  if (input.location_type === 'online') {
    const url = input.meeting_url?.trim() ?? '';
    const platform = MEETING_PLATFORMS.find((p) => p === input.meeting_platform);
    if (!platform || !isMeetingUrl(url)) return null;
    return { location_type: 'online', address_text: null, lat: null, lng: null, meeting_platform: platform, meeting_url: url };
  }
  return null;
}

/** The place or the link changed: worth telling those who joined. */
export function placeChanged(before: PlaceFields, after: PlaceFields) {
  return (['location_type', 'address_text', 'lat', 'lng', 'meeting_platform', 'meeting_url'] as const).some((k) => before[k] !== after[k]);
}

// ---------- an event's notices ----------

export const NOTICE_MAX = 1000;
/** A notice can be posted until this many days after the event ends (a thank-you, a follow-up). */
export const NOTICE_DAYS_AFTER_EVENT = 7;
/** Enough for any real event; it stops a flood of notifications. */
export const MAX_NOTICES_PER_EVENT = 50;

/** Who reads an event's notices: the people who joined it, its supervisors, and admins. */
export function canReadNotices(user: Pick<User, 'role'>, registration: Pick<Registration, 'status'> | undefined, isOrganizer: boolean) {
  return canManageEvent(user, isOrganizer) || registration?.status === 'joined';
}

export function assertCanPostNotice(args: {
  actorCanManage: boolean;
  event: EventTimes;
  /** Already cleaned (cleanText). */
  body: string | null;
  kind: string;
  noticeCount: number;
  now: number;
}) {
  const { event, now } = args;
  if (!args.actorCanManage) throw new ApiError('not_organizer');
  if (event.status === 'cancelled' || isHidden(event) || now > toMs(event.ends_at) + NOTICE_DAYS_AFTER_EVENT * 24 * MS_HOUR) {
    throw new ApiError('event_closed');
  }
  if (!args.body) throw new ApiError('message_required');
  if (!(NOTICE_KINDS as string[]).includes(args.kind)) throw new ApiError('not_found');
  if (args.noticeCount >= MAX_NOTICES_PER_EVENT) throw new ApiError('too_many_notices');
}

/**
 * Reacting to a notice: whoever may read it, with one of the fixed reactions.
 * A new reaction replaces the person's earlier one; taking it back is always allowed.
 */
export function assertCanReact(args: { canRead: boolean; notice: Pick<EventNotice, 'kind'> | undefined; reaction: string }) {
  if (!args.notice || !args.canRead) throw new ApiError('not_found');
  // Only the reactions of this kind of notice: a question is not "noted", an announcement not voted on.
  if (!(NOTICE_REACTIONS[args.notice.kind] as string[]).includes(args.reaction)) throw new ApiError('not_found');
}

/** Counts per reaction of the notice's kind, in the order shown, and the viewer's own. */
export function reactionSummary(kind: NoticeKind, rows: Pick<NoticeReaction, 'user_id' | 'reaction'>[], viewerId: string) {
  return {
    reactions: NOTICE_REACTIONS[kind].map((reaction) => ({ reaction, count: rows.filter((r) => r.reaction === reaction).length })),
    my_reaction: rows.find((r) => r.user_id === viewerId)?.reaction ?? null,
  };
}

/** A notice is taken down by whoever posted it, or by an admin. */
export function assertCanDeleteNotice(notice: { author_id: string } | undefined, user: Pick<User, 'id' | 'role'>) {
  if (!notice) throw new ApiError('not_found');
  if (notice.author_id !== user.id && user.role !== 'admin') throw new ApiError('not_your_notice');
}

// ---------- deleting an account ----------

/** The name a deleted account shows wherever its records remain (reports, warnings, the admin log). */
export const DELETED_NAME = 'حساب محذوف';

/**
 * What a deleted account keeps of its profile: nothing personal. The row
 * stays, so attendance, points, reports and warnings still add up, but they
 * no longer say who it was. Gender stays: events and photos were decided by it.
 */
export function erasedProfile(): Pick<User, 'full_name' | 'phone' | 'email' | 'city' | 'avatar_url'> {
  return { full_name: DELETED_NAME, phone: '', email: null, city: '', avatar_url: null };
}
