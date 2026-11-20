// The demo's stand-in for the backend. The rules live in shared/rules.ts and
// are the same ones the real server (server/) runs. This file only finds rows
// in the on-phone database, calls the rule, and writes what the rule decided.
// The screens never compute hours or points themselves.

import type { CertificateResponse, EventMatch, MySkillsResponse, SkillRef, EventProposal, InstitutionHoursReport, LeaderboardResponse, ProfileEdit, ReportBody } from '@/data/api';
import type {
  AppEvent,
  Attendance,
  Db,
  EventLesson,
  EventNotice,
  EventStatus,
  EventTerm,
  InstitutionKind,
  NoticeKind,
  NoticeReactionKind,
  Registration,
  Report,
  User,
  OutsideHours,
  Warning,
} from '@/data/types';
import { NOTICE_REACTIONS } from '@/data/types';
import { badgesEarned } from '../../../shared/badges';
import { classOfEvent, isEventClass } from '../../../shared/classes';
import { cleanSkillIds, matchScore, MAX_SKILLS_PER_EVENT, MAX_SKILLS_PER_PERSON, suggestedSkills } from '../../../shared/skills';
import { ApiError } from '../../../shared/errors';
import { hijriMonths } from '../../../shared/hijri';
import * as rules from '../../../shared/rules';
import { cleanKind } from '../../../shared/tags';

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

export function eventLessons(db: Db, eventId: string): EventLesson[] {
  return rules.sortLessons(db.event_lessons.filter((x) => x.event_id === eventId));
}

/** The lessons of these this person learned (lesson id → when). */
export function learnedAt(db: Db, userId: string): Map<string, string> {
  return new Map(db.lesson_completions.filter((c) => c.user_id === userId).map((c) => [c.lesson_id, c.learned_at]));
}

function learnedIds(db: Db, userId: string, eventId: string) {
  const learned = learnedAt(db, userId);
  return eventLessons(db, eventId)
    .map((l) => l.id)
    .filter((id) => learned.has(id));
}

export function isOrganizer(db: Db, eventId: string, userId: string) {
  return db.event_organizers.some((o) => o.event_id === eventId && o.user_id === userId);
}

/** The person's supervisor row at this event, with when they took the pledge. */
export function organizerLink(db: Db, eventId: string, userId: string) {
  return db.event_organizers.find((o) => o.event_id === eventId && o.user_id === userId);
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

/** Who may open the event form: by level or role, or as a representative of an approved institution (rules.mayProposeEvents). */
export function mayProposeEvents(db: Db, user: User) {
  return rules.mayProposeEvents(user, levelFor(db, totalPoints(db, user.id)), representedInstitutions(db, user.id).length > 0);
}

// ---------- institutions (reads) ----------

export function institutionOf(db: Db, id: string | null | undefined) {
  return id ? db.institutions.find((i) => i.id === id) : undefined;
}

export function membershipOf(db: Db, institutionId: string, userId: string) {
  return db.institution_members.find((m) => m.institution_id === institutionId && m.user_id === userId);
}

/** The approved institutions a person represents. */
export function representedInstitutions(db: Db, userId: string) {
  return db.institutions.filter((i) => i.status === 'approved' && rules.isRepresentative(membershipOf(db, i.id, userId)));
}

/** Requests to belong waiting for this representative. */
export function requestsForRepresentative(db: Db, userId: string) {
  const mine = new Set(representedInstitutions(db, userId).map((i) => i.id));
  return db.institution_members.filter((m) => mine.has(m.institution_id) && m.status === 'pending').length;
}

/** The institution an event is to be in the name of, and the proposer's place in it (rules.assertCanProposeEvent). */
function institutionFor(db: Db, userId: string, institutionId: string | null | undefined) {
  if (!institutionId) return null;
  return { id: institutionId, institution: institutionOf(db, institutionId), membership: membershipOf(db, institutionId, userId) };
}

export function confirmedHours(db: Db, userId: string) {
  return rules.round2(
    db.attendance
      .filter((a) => a.user_id === userId && a.participant_status === 'confirmed')
      .reduce((s, a) => s + (a.hours ?? 0), 0),
  );
}

/** What a record is worth (rules.pointsForHours): a point a minute. */
export function pointsForAttendance(_db: Db, a: Attendance): number {
  return rules.pointsForHours(a.hours);
}

/** How far back the job looks for events whose only supervisor has hours to be credited (as the server's). */
const SOLE_SUPERVISOR_LOOKBACK_MS = 7 * 24 * rules.MS_HOUR;

/** An event that ended with a single supervisor credits them its whole time (rules.decideSoleSupervisorHours). */
function soleSupervisorCredits(db: Db, now: number) {
  return db.events.flatMap((e) => {
    if (e.status !== 'published' || rules.toMs(e.ends_at) < now - SOLE_SUPERVISOR_LOOKBACK_MS) return [];
    const supervisors = db.event_organizers.filter((o) => o.event_id === e.id && getUser(db, o.user_id) && !getUser(db, o.user_id)!.deleted_at);
    const credit = rules.decideSoleSupervisorHours({
      event: e,
      supervisorIds: supervisors.map((o) => o.user_id),
      recordedUserIds: db.attendance.filter((a) => a.event_id === e.id).map((a) => a.user_id),
      now,
    });
    return credit ? [{ event_id: e.id, ...credit }] : [];
  });
}

// ---------- scheduled job: auto-close open attendance at events.ends_at ----------

export function tick(db: Db, now: number): Db {
  const due = db.attendance.filter((a) => rules.decideAutoClose(a, getEvent(db, a.event_id), now));
  // Waiting lists whose offers ran out, or with a place to offer.
  const listed = [...new Set(db.waitlist.map((w) => w.event_id))].filter((id) => {
    const plan = planOffers(db, id, now);
    return plan.expired.length > 0 || plan.offer.length > 0;
  });
  if (due.length === 0 && listed.length === 0 && soleSupervisorCredits(db, now).length === 0) return db;
  const next = clone(db);
  for (const a of next.attendance) {
    const close = rules.decideAutoClose(a, getEvent(next, a.event_id), now);
    if (close) Object.assign(a, close);
  }
  for (const credit of soleSupervisorCredits(next, now)) {
    next.attendance.push({ id: newId('att'), ...credit, participant_status: 'pending', participant_acted_at: null });
  }
  for (const id of listed) fillOpenPlaces(next, id, now);
  return next;
}

// ---------- proposing an event ----------

/**
 * An event made in the app. The demo has no admin, so a proposal stays waiting.
 * The form's fields are checked before this (demoBackend.ts), as the server's request checks do.
 */
export function proposeEvent(db: Db, userId: string, input: EventProposal, now: number): { db: Db; event: AppEvent } {
  const user = getUser(db, userId)!;
  const institution = institutionFor(db, userId, input.institution_id);
  rules.assertCanProposeEvent({
    user,
    level: levelFor(db, totalPoints(db, userId)),
    event: input,
    waitingCount: waitingProposals(db, userId),
    now,
    institution,
  });
  const next = clone(db);
  const at = new Date(now).toISOString();
  const event: AppEvent = {
    id: newId('ev'),
    title: input.title,
    description: input.description,
    ...kindOf(input),
    image_url: null,
    ...placeOf(input),
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    capacity: input.capacity,
    gender_category: input.gender_category,
    status: rules.proposalStatus(
      user,
      institution ? { institution: rules.institutionApprovedEvents(db.events, institution.id) } : { own: rules.ownApprovedEvents(db.events, userId) },
    ),
    terms_locked_at: null,
    created_by: userId,
    created_at: at,
    institution_id: institution?.id ?? null,
    cover_image_id: input.cover_image_id ?? null,
  };
  next.events.push(event);
  next.event_organizers.push({ event_id: event.id, user_id: userId, added_by: null, pledged_at: null });
  writeTerms(next, event.id, input, at);
  writeLessons(next, event.id, input, at);
  writeSkills(next, event.id, input.skill_ids, input.subtype, true);
  return { db: next, event };
}

/** Replaces an event's lessons (in `next`, already a copy). Only while nobody learned one: a draft's. */
function writeLessons(next: Db, eventId: string, input: EventProposal, at: string) {
  const before = removeLessons(next, eventId);
  input.lessons.forEach((l, i) =>
    next.event_lessons.push({
      id: newId('lesson'),
      event_id: eventId,
      order_index: i + 1,
      title: l.title,
      body: l.body,
      image_id: l.image_id,
      video_id: l.video_id,
      created_at: at,
    }),
  );
  dropUnusedImages(next, before);
}

/** Deletes the event's lessons (in `next`, already a copy); returns the pictures they showed. */
function removeLessons(next: Db, eventId: string) {
  const images = next.event_lessons.filter((x) => x.event_id === eventId).map((x) => x.image_id);
  next.event_lessons = next.event_lessons.filter((x) => x.event_id !== eventId);
  return images;
}

/** Pictures a lesson shows, or an event uses as its cover. */
function shownImages(db: Db) {
  return new Set([...db.event_lessons.map((x) => x.image_id), ...db.events.map((e) => e.cover_image_id), ...(db.outside_hours ?? []).map((c) => c.image_id)]);
}

/** Those of these pictures no lesson or cover shows any more are removed, as on the server (server/src/lesson-images.ts). */
function dropUnusedImages(next: Db, ids: (string | null)[]) {
  const shown = shownImages(next);
  next.lesson_images = next.lesson_images.filter((x) => !ids.includes(x.id) || shown.has(x.id));
}

/** Pictures sent for a lesson and never used are kept this long (a form may still be open). */
const UNUSED_IMAGE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * A lesson's picture, from whoever may write lessons. The demo has no
 * scheduled job, so sending one also removes those never used for days.
 */
export function addLessonImage(db: Db, userId: string, image: { data_url: string; width: number; height: number }, now: number) {
  const user = getUser(db, userId)!;
  // Also anyone who belongs to an institution: a photo as proof of outside-app hours.
  if (!mayProposeEvents(db, user) && !belongsToAny(db, userId)) throw new ApiError('cannot_create_events');
  const next = clone(db);
  const shown = shownImages(next);
  next.lesson_images = next.lesson_images.filter((x) => shown.has(x.id) || rules.toMs(x.created_at) > now - UNUSED_IMAGE_MS);
  const id = newId('img');
  next.lesson_images.push({ id, ...image, uploaded_by: userId, created_at: new Date(now).toISOString() });
  return { db: next, id };
}

/** The event's tag and class, as the server checks them (the form only sends a tag that is one). */
function kindOf(input: EventProposal) {
  const kind = cleanKind(input);
  if (!kind) throw new Error('The event form sent a tag that is not one.');
  return kind;
}

/** Where the event happens, as the server checks it (the form only sends a place that holds together). */
function placeOf(input: EventProposal) {
  const place = rules.cleanPlace(input);
  if (!place) throw new Error('The event form sent a place that does not hold together.');
  return place;
}

/** Replaces an event's terms (in `next`, already a copy). */
function writeTerms(next: Db, eventId: string, input: EventProposal, at: string) {
  next.event_terms = next.event_terms.filter((x) => x.event_id !== eventId);
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
  const row = db.events.find((e) => e.id === eventId);
  rules.assertCanChangeProposal(user, row);
  const institution = institutionFor(db, userId, input.institution_id === undefined ? row.institution_id : input.institution_id);
  rules.assertCanProposeEvent({
    user,
    level: levelFor(db, totalPoints(db, userId)),
    event: input,
    // This draft is one of those waiting; editing it adds none.
    waitingCount: waitingProposals(db, userId) - 1,
    now,
    institution,
  });
  const next = clone(db);
  // An app from before covers sends none: the event keeps the one it has.
  const cover = input.cover_image_id === undefined ? row.cover_image_id : input.cover_image_id;
  Object.assign(next.events.find((e) => e.id === eventId)!, {
    title: input.title,
    description: input.description,
    ...kindOf(input),
    ...placeOf(input),
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    capacity: input.capacity,
    gender_category: input.gender_category,
    institution_id: institution?.id ?? null,
    cover_image_id: cover ?? null,
  });
  if (cover !== row.cover_image_id) dropUnusedImages(next, [row.cover_image_id]);
  writeTerms(next, eventId, input, new Date(now).toISOString());
  writeLessons(next, eventId, input, new Date(now).toISOString());
  writeSkills(next, eventId, input.skill_ids, input.subtype, false);
  return next;
}

/** Withdrawn: deleted with its own rows, as on the server (server/src/routes/events.ts says why). */
export function withdrawProposal(db: Db, userId: string, eventId: string): Db {
  const row = db.events.find((e) => e.id === eventId);
  rules.assertCanChangeProposal(getUser(db, userId)!, row);
  const next = clone(db);
  next.events = next.events.filter((e) => e.id !== eventId);
  next.event_organizers = next.event_organizers.filter((x) => x.event_id !== eventId);
  next.event_terms = next.event_terms.filter((x) => x.event_id !== eventId);
  next.event_skills = (next.event_skills ?? []).filter((x) => x.event_id !== eventId);
  dropUnusedImages(next, [...removeLessons(next, eventId), row.cover_image_id]);
  return next;
}

// ---------- the profile ----------

/** The name and the city only (gender and phone never change). Checked before this with rules.cleanProfileEdit. */
export function updateProfile(db: Db, userId: string, edit: ProfileEdit): Db {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId)!;
  if (edit.full_name !== undefined) u.full_name = edit.full_name;
  if (edit.city !== undefined) u.city = edit.city;
  if (edit.show_on_leaderboards !== undefined) u.show_on_leaderboards = edit.show_on_leaderboards;
  return next;
}

// ---------- profile photo ----------

/** The demo keeps the photo on the phone, inside its data, as a data: address. null removes it. */
export function setPhoto(db: Db, userId: string, dataUri: string | null): Db {
  const next = clone(db);
  next.users.find((u) => u.id === userId)!.avatar_url = dataUri;
  return next;
}

// ---------- the learning corner ----------

/** Anyone who can see the event learns one of its lessons, joined or not. */
export function learnLesson(db: Db, userId: string, eventId: string, lessonId: string, now: number): Db {
  const event = getEventFor(db, eventId, userId);
  const action = rules.decideLearnLesson({
    event,
    lesson: eventLessons(db, eventId).find((l) => l.id === lessonId),
    learnedLessonIds: learnedIds(db, userId, eventId),
  });
  if (action === 'nothing') return db;
  const next = clone(db);
  next.lesson_completions.push({ lesson_id: lessonId, user_id: userId, learned_at: new Date(now).toISOString() });
  awardBadges(next, userId, now);
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
    lessons: eventLessons(db, eventId),
    learnedLessonIds: learnedIds(db, userId, eventId),
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
    lessons: eventLessons(db, eventId),
    learnedLessonIds: learnedIds(db, userId, eventId),
    joinedCount: joinedUsers(db, eventId).length,
    heldForOthers: rules.seatsHeld(waitlistOf(db, eventId), now, userId),
    now,
  });
  const next = clone(db);
  const r = next.registrations.find((x) => x.id === reg!.id)!;
  r.status = 'joined';
  r.joined_at = new Date(now).toISOString();
  // Joined: off the waiting list, and the place held for them is theirs now.
  next.waitlist = next.waitlist.filter((w) => !(w.event_id === eventId && w.user_id === userId));
  return next;
}

export function cancelJoin(db: Db, userId: string, eventId: string, now = Date.now()): Db {
  const reg = registrationOf(db, eventId, userId);
  rules.assertCancelJoin({ registration: reg, hasAttendance: !!attendanceOf(db, eventId, userId) });
  const next = clone(db);
  next.registrations.find((x) => x.id === reg!.id)!.status = 'cancelled';
  // The place they leave goes to the next on the waiting list.
  fillOpenPlaces(next, eventId, now);
  return next;
}

// ---------- the waiting list of a full event (as server/src/waitlist.ts) ----------

export function waitlistOf(db: Db, eventId: string) {
  return rules.sortWaitlist(db.waitlist.filter((w) => w.event_id === eventId));
}

function planOffers(db: Db, eventId: string, now: number) {
  const event = getEvent(db, eventId);
  return rules.planOffers({ event, joinedCount: joinedUsers(db, eventId).length, waitlist: waitlistOf(db, eventId), now });
}

/** Offers the event's open places to the next in line, and takes off those whose offer ran out (in `next`, already a copy). */
function fillOpenPlaces(next: Db, eventId: string, now: number) {
  const plan = planOffers(next, eventId, now);
  next.waitlist = next.waitlist.filter((w) => !(w.event_id === eventId && plan.expired.includes(w.user_id)));
  for (const o of plan.offer) {
    const w = next.waitlist.find((x) => x.event_id === eventId && x.user_id === o.user_id)!;
    w.offered_at = new Date(now).toISOString();
    w.offer_expires_at = o.offer_expires_at;
  }
}

export function joinWaitlist(db: Db, userId: string, eventId: string, now: number): Db {
  const list = waitlistOf(db, eventId);
  const action = rules.decideJoinWaitlist({
    user: getUser(db, userId)!,
    event: getEvent(db, eventId),
    registration: registrationOf(db, eventId, userId),
    onList: list.some((w) => w.user_id === userId),
    joinedCount: joinedUsers(db, eventId).length,
    heldCount: rules.seatsHeld(list, now),
    now,
  });
  if (action === 'nothing') return db;
  const next = clone(db);
  next.waitlist.push({ event_id: eventId, user_id: userId, created_at: new Date(now).toISOString(), offered_at: null, offer_expires_at: null });
  return next;
}

/** Leaving the list; a place held for them goes to the next in line. */
export function leaveWaitlist(db: Db, userId: string, eventId: string, now: number): Db {
  const next = clone(db);
  next.waitlist = next.waitlist.filter((w) => !(w.event_id === eventId && w.user_id === userId));
  fillOpenPlaces(next, eventId, now);
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
  const link = organizerLink(db, event.id, actorId);
  const start = rules.decideRecordStart({
    actorId,
    participantId: args.userId,
    actorIsOrganizer: !!link,
    pledged: !!link?.pledged_at,
    participantIsOrganizer: isOrganizer(db, event.id, args.userId),
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
  const link = organizerLink(db, event.id, actorId);
  const end = rules.decideRecordEnd({
    actorId,
    participantId: args.userId,
    actorIsOrganizer: !!link,
    pledged: !!link?.pledged_at,
    event,
    attendance: a,
    endedAt: args.endedAt,
    now,
  });
  const next = clone(db);
  Object.assign(next.attendance.find((x) => x.id === a!.id)!, end);
  return next;
}

/** A supervisor of the event takes the pledge to record attendance faithfully (إنها أمانة), once. */
export function pledge(db: Db, actorId: string, eventId: string, now: number): Db {
  const link = organizerLink(db, eventId, actorId);
  if (rules.decidePledge({ actorIsOrganizer: !!link, event: getEvent(db, eventId), pledged: !!link?.pledged_at }) === 'nothing') return db;
  const next = clone(db);
  organizerLink(next, eventId, actorId)!.pledged_at = new Date(now).toISOString();
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
      outside_hours_id: null,
      points,
      reason: 'attendance_confirmed',
      created_at: new Date(now).toISOString(),
    });
  }
  const u = next.users.find((x) => x.id === userId)!;
  u.total_points = totalPoints(next, userId);
  u.level = levelFor(next, u.total_points).level;
  awardBadges(next, userId, now);
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

// ---------- an event's supervisors and notices ----------

/** Like the server's supervisorsOf: deleted accounts left out, those the event was made with first. */
export function supervisorsOf(db: Db, eventId: string): (User & { added_by: string | null })[] {
  return db.event_organizers
    .filter((o) => o.event_id === eventId)
    .flatMap((o) => {
      const u = getUser(db, o.user_id);
      return u && !u.deleted_at ? [{ ...u, added_by: o.added_by }] : [];
    })
    .sort((a, b) => Number(a.added_by !== null) - Number(b.added_by !== null));
}

export function addSupervisor(db: Db, actorId: string, eventId: string, userId: string, now: number): Db {
  const event = getEvent(db, eventId);
  const links = db.event_organizers.filter((o) => o.event_id === eventId);
  rules.assertCanAddSupervisor({
    actorCanManage: rules.canManageEvent(getUser(db, actorId)!, isOrganizer(db, eventId, actorId)),
    event,
    registration: registrationOf(db, eventId, userId),
    alreadySupervisor: links.some((l) => l.user_id === userId),
    supervisorCount: links.length,
    now,
  });
  const next = clone(db);
  next.event_organizers.push({ event_id: eventId, user_id: userId, added_by: actorId, pledged_at: null });
  return next;
}

export function removeSupervisor(db: Db, actorId: string, eventId: string, userId: string, now: number): Db {
  const event = getEvent(db, eventId);
  const links = db.event_organizers.filter((o) => o.event_id === eventId);
  rules.assertCanRemoveSupervisor({
    actorCanManage: rules.canManageEvent(getUser(db, actorId)!, isOrganizer(db, eventId, actorId)),
    event,
    link: links.find((l) => l.user_id === userId),
    supervisorCount: links.length,
    now,
  });
  const next = clone(db);
  next.event_organizers = next.event_organizers.filter((o) => !(o.event_id === eventId && o.user_id === userId));
  return next;
}

/** Newest first. */
export function noticesOf(db: Db, eventId: string): EventNotice[] {
  return db.event_notices.filter((n) => n.event_id === eventId).sort((a, b) => rules.toMs(b.created_at) - rules.toMs(a.created_at));
}

export function postNotice(db: Db, actorId: string, eventId: string, body: string, kind: NoticeKind, now: number): { db: Db; notice: EventNotice } {
  const event = getEvent(db, eventId);
  const cleaned = rules.cleanText(body);
  rules.assertCanPostNotice({
    actorCanManage: rules.canManageEvent(getUser(db, actorId)!, isOrganizer(db, eventId, actorId)),
    event,
    body: cleaned,
    kind,
    noticeCount: noticesOf(db, eventId).length,
    now,
  });
  const notice: EventNotice = { id: newId('notice'), event_id: eventId, author_id: actorId, kind, body: cleaned!, created_at: new Date(now).toISOString() };
  const next = clone(db);
  next.event_notices.push(notice);
  return { db: next, notice };
}

export function deleteNotice(db: Db, actorId: string, eventId: string, noticeId: string): Db {
  getEvent(db, eventId);
  rules.assertCanDeleteNotice(db.event_notices.find((n) => n.id === noticeId && n.event_id === eventId), getUser(db, actorId)!);
  const next = clone(db);
  next.event_notices = next.event_notices.filter((n) => n.id !== noticeId);
  next.notice_reactions = next.notice_reactions.filter((r) => r.notice_id !== noticeId);
  return next;
}

/** A reaction replaces the person's earlier one; null takes it back (rules.assertCanReact). */
export function reactToNotice(db: Db, userId: string, eventId: string, noticeId: string, reaction: NoticeReactionKind | null, now: number): Db {
  getEvent(db, eventId);
  const user = getUser(db, userId)!;
  const notice = db.event_notices.find((n) => n.id === noticeId && n.event_id === eventId);
  rules.assertCanReact({
    canRead: rules.canReadNotices(user, registrationOf(db, eventId, userId), isOrganizer(db, eventId, userId)),
    notice,
    // Taking a reaction back needs none named: any the notice offers passes the check.
    reaction: reaction ?? (notice ? NOTICE_REACTIONS[notice.kind][0] : ''),
  });
  const next = clone(db);
  next.notice_reactions = next.notice_reactions.filter((r) => !(r.notice_id === noticeId && r.user_id === userId));
  if (reaction) next.notice_reactions.push({ notice_id: noticeId, user_id: userId, reaction, created_at: new Date(now).toISOString() });
  return next;
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
  next.institution_members = next.institution_members.filter((m) => m.user_id !== userId);
  return next;
}

// ---------- institutions (changes; the server's routes/institutions.ts) ----------

/** Asking for a new institution. The demo has no admin, so it stays waiting. */
export function requestInstitution(db: Db, userId: string, body: { name: string; kind: string }, now: number) {
  const name = rules.cleanInstitutionName(body.name);
  rules.assertCanRequestInstitution({
    name,
    kind: body.kind,
    existing: db.institutions,
    waitingCount: db.institutions.filter((i) => i.requested_by === userId && i.status === 'pending').length,
    membershipsCount: db.institution_members.filter((m) => m.user_id === userId).length,
  });
  const next = clone(db);
  const at = new Date(now).toISOString();
  const id = newId('inst');
  next.institutions.push({
    id,
    name: name!,
    kind: body.kind as InstitutionKind,
    status: 'pending',
    requested_by: userId,
    created_at: at,
    decided_by: null,
    decided_at: null,
    decision_note: null,
  });
  next.institution_members.push({ institution_id: id, user_id: userId, role: 'representative', status: 'confirmed', created_at: at, confirmed_by: null, confirmed_at: at });
  return { db: next, id };
}

export function askToJoinInstitution(db: Db, userId: string, institutionId: string, now: number): Db {
  rules.assertCanAskToJoin({
    institution: institutionOf(db, institutionId),
    membership: membershipOf(db, institutionId, userId),
    membershipsCount: db.institution_members.filter((m) => m.user_id === userId).length,
  });
  const next = clone(db);
  next.institution_members.push({
    institution_id: institutionId,
    user_id: userId,
    role: 'member',
    status: 'pending',
    created_at: new Date(now).toISOString(),
    confirmed_by: null,
    confirmed_at: null,
  });
  return next;
}

export function leaveInstitution(db: Db, userId: string, institutionId: string): Db {
  rules.assertCanLeaveInstitution(membershipOf(db, institutionId, userId), institutionOf(db, institutionId));
  const next = clone(db);
  next.institution_members = next.institution_members.filter((m) => !(m.institution_id === institutionId && m.user_id === userId));
  return next;
}

/** Only its representatives (and admins) manage who belongs to it. */
export function assertMayManageInstitution(db: Db, user: User, institutionId: string) {
  if (!institutionOf(db, institutionId)) throw new ApiError('not_found');
  if (user.role !== 'admin' && !rules.isRepresentative(membershipOf(db, institutionId, user.id))) throw new ApiError('not_representative');
}

export function confirmMember(db: Db, userId: string, institutionId: string, memberId: string, now: number): Db {
  const user = getUser(db, userId)!;
  const member = membershipOf(db, institutionId, memberId);
  rules.assertCanManageMember({ user, mine: membershipOf(db, institutionId, userId), member });
  if (member!.status === 'confirmed') return db;
  const next = clone(db);
  Object.assign(membershipOf(next, institutionId, memberId)!, { status: 'confirmed', confirmed_by: userId, confirmed_at: new Date(now).toISOString() });
  return next;
}

/** Turning a request down, or taking a member off. */
export function removeMember(db: Db, userId: string, institutionId: string, memberId: string): Db {
  const user = getUser(db, userId)!;
  rules.assertCanManageMember({ user, mine: membershipOf(db, institutionId, userId), member: membershipOf(db, institutionId, memberId) });
  const next = clone(db);
  next.institution_members = next.institution_members.filter((m) => !(m.institution_id === institutionId && m.user_id === memberId));
  return next;
}

// ---------- hours outside the app's events (server/src/routes/outside-hours.ts) ----------

export function belongsToAny(db: Db, userId: string) {
  return db.institution_members.some((m) => m.user_id === userId && m.status === 'confirmed' && institutionOf(db, m.institution_id)?.status === 'approved');
}

export function claimOutsideHours(db: Db, userId: string, input: rules.OutsideHoursInput, now: number) {
  const pending = (db.outside_hours ?? []).filter((c) => c.user_id === userId && c.institution_id === input.institution_id && c.status === 'pending').length;
  const imageId = input.image_id && db.lesson_images.some((x) => x.id === input.image_id) ? input.image_id : null;
  const claim = rules.assertCanClaimOutsideHours({
    input: { ...input, image_id: imageId },
    institution: institutionOf(db, input.institution_id),
    membership: membershipOf(db, input.institution_id, userId),
    pendingForInstitution: pending,
    now,
    timeZone: rules.ASSOCIATION_TIME_ZONE,
  });
  const next = clone(db);
  const id = newId('oh');
  const row: OutsideHours = {
    id, user_id: userId, ...claim, status: 'pending', created_at: new Date(now).toISOString(), decided_by: null, decided_at: null, decision_note: null,
  };
  next.outside_hours = [...(next.outside_hours ?? []), row];
  return { db: next, id };
}

export function decideOutsideHours(db: Db, userId: string, institutionId: string, claimId: string, decision: 'approved' | 'rejected', note: string | undefined, now: number) {
  const user = getUser(db, userId)!;
  const claim = (db.outside_hours ?? []).find((c) => c.id === claimId && c.institution_id === institutionId);
  const reason = rules.assertCanDecideOutsideHours({ user, mine: membershipOf(db, institutionId, userId), claim, decision, note });
  const next = clone(db);
  const row = next.outside_hours.find((c) => c.id === claimId)!;
  Object.assign(row, { status: decision, decided_by: userId, decided_at: new Date(now).toISOString(), decision_note: reason });
  if (decision === 'approved') {
    const points = rules.pointsForOutsideHours(row);
    if (points > 0) {
      next.points_ledger.push({
        id: newId('pl'), user_id: row.user_id, event_id: null, outside_hours_id: row.id, points, reason: 'outside_hours_approved', created_at: new Date(now).toISOString(),
      });
    }
    const u = next.users.find((x) => x.id === row.user_id)!;
    u.total_points = totalPoints(next, row.user_id);
    u.level = levelFor(next, u.total_points).level;
    awardBadges(next, row.user_id, now);
  }
  return next;
}

/** Its members' confirmed hours between two days: at its own events, and outside them for it (as GET /institutions/:id/hours-report). */
export function institutionHoursReport(db: Db, viewer: User, id: string, from: string, to: string): InstitutionHoursReport {
  const i = institutionOf(db, id)!;
  const members = db.institution_members
    .filter((m) => m.institution_id === id && m.status === 'confirmed')
    .map((m) => getUser(db, m.user_id))
    .filter((u): u is User => !!u && !u.deleted_at);
  const tz = rules.ASSOCIATION_TIME_ZONE;
  const rows = members
    .map((u) => {
      const attended = db.attendance.filter((a) => {
        if (a.user_id !== u.id || a.participant_status !== 'confirmed') return false;
        if (db.events.find((e) => e.id === a.event_id)?.institution_id !== id) return false;
        const d = rules.dayIn(rules.toMs(a.started_at), tz);
        return d >= from && d <= to;
      });
      const outside = (db.outside_hours ?? []).filter((c) => c.user_id === u.id && c.institution_id === id && c.status === 'approved' && c.done_on >= from && c.done_on <= to);
      const eventHours = rules.round2(attended.reduce((sum, a) => sum + (a.hours ?? 0), 0));
      const outsideHours = rules.round2(outside.reduce((sum, c) => sum + c.minutes, 0) / 60);
      const shown = !u.avatar_url || rules.canSeePhoto(viewer, u) ? u.avatar_url : null;
      return {
        user: { id: u.id, full_name: u.full_name, avatar_url: shown, gender: u.gender },
        events: new Set(attended.map((a) => a.event_id)).size,
        event_hours: eventHours,
        outside_hours: outsideHours,
        hours: rules.round2(eventHours + outsideHours),
      };
    })
    .sort((a, b) => b.hours - a.hours || a.user.full_name.localeCompare(b.user.full_name, 'ar'));
  return { institution: { id: i.id, name: i.name, kind: i.kind }, from, to, rows };
}

/** What a certificate says, as the server counts it (server/src/routes/certificates.ts); the demo keeps none. */
export function demoCertificate(db: Db, me: User, institutionId: string | null, now: number): CertificateResponse {
  const institution = institutionId ? institutionOf(db, institutionId) : undefined;
  if (institutionId && (!institution || membershipOf(db, institutionId, me.id)?.status !== 'confirmed')) throw new ApiError('not_found');
  const attended = db.attendance.filter(
    (a) => a.user_id === me.id && a.participant_status === 'confirmed' && (a.hours ?? 0) > 0 && (!institutionId || db.events.find((e) => e.id === a.event_id)?.institution_id === institutionId),
  );
  const outside = (db.outside_hours ?? []).filter((c) => c.user_id === me.id && c.status === 'approved' && (!institutionId || c.institution_id === institutionId));
  const outsideHours = rules.round2(outside.reduce((sum, c) => sum + c.minutes, 0) / 60);
  const hours = rules.round2(attended.reduce((sum, a) => sum + (a.hours ?? 0), 0) + outsideHours);
  return {
    certificate: { id: 'DEMO', user_id: me.id, institution_id: institutionId, hours, events: new Set(attended.map((a) => a.event_id)).size, outside_hours: outsideHours, issued_at: new Date(now).toISOString() },
    institution: institution ? { id: institution.id, name: institution.name, kind: institution.kind } : null,
    verify_url: null,
  };
}

// ---------- badges (as server/src/db/queries.ts awardBadges) ----------

/** Adds to `next` (a copy being changed) the badges the person's record now earns. Returns the new ones. */
export function awardBadges(next: Db, userId: string, now: number): string[] {
  next.user_badges ??= [];
  const confirmed = next.attendance
    .filter((a) => a.user_id === userId && a.participant_status === 'confirmed')
    .flatMap((a) => {
      const e = next.events.find((x) => x.id === a.event_id);
      return e ? [{ event_id: e.id, event_class: classOfEvent(e), day: rules.dayIn(rules.toMs(a.started_at), rules.ASSOCIATION_TIME_ZONE) }] : [];
    });
  const earned = badgesEarned({
    confirmed,
    lessonsLearned: next.lesson_completions.filter((l) => l.user_id === userId).length,
    hijri: hijriMonths(next.hijri_adjustments ?? []),
  });
  const had = new Set(next.user_badges.filter((b) => b.user_id === userId).map((b) => b.badge_id));
  const added = earned.filter((id) => !had.has(id));
  // The demo sends no push: the celebration in the app tells them.
  for (const badge_id of added) next.user_badges.push({ user_id: userId, badge_id, earned_at: new Date(now).toISOString(), seen_at: null, pushed_at: new Date(now).toISOString() });
  return added;
}

export function markBadgesSeen(db: Db, userId: string, now: number): Db {
  const next = clone(db);
  for (const b of next.user_badges ?? []) if (b.user_id === userId && !b.seen_at) b.seen_at = new Date(now).toISOString();
  return next;
}

// ---------- leaderboards (as server/src/routes/leaderboards.ts) ----------

export function leaderboard(db: Db, me: User, institutionId: string | null, now: number): LeaderboardResponse {
  const institution = institutionId ? institutionOf(db, institutionId) : undefined;
  if (institutionId && (!institution || institution.status !== 'approved' || membershipOf(db, institutionId, me.id)?.status !== 'confirmed')) throw new ApiError('not_found');
  const tz = rules.ASSOCIATION_TIME_ZONE;
  const month = rules.dayIn(now, tz).slice(0, 7);
  const members = institutionId ? new Set(db.institution_members.filter((m) => m.institution_id === institutionId && m.status === 'confirmed').map((m) => m.user_id)) : null;
  const totals = new Map<string, number>();
  for (const a of db.attendance) {
    if (a.participant_status !== 'confirmed' || (members && !members.has(a.user_id))) continue;
    if (rules.dayIn(rules.toMs(a.started_at), tz).slice(0, 7) === month) totals.set(a.user_id, (totals.get(a.user_id) ?? 0) + (a.hours ?? 0));
  }
  for (const o of db.outside_hours ?? []) {
    if (o.status !== 'approved' || (members && !members.has(o.user_id)) || o.done_on.slice(0, 7) !== month) continue;
    totals.set(o.user_id, (totals.get(o.user_id) ?? 0) + o.minutes / 60);
  }
  const ranked = [...totals]
    .map(([id, hours]) => ({ u: getUser(db, id), hours: rules.round2(hours) }))
    .filter((r): r is { u: User; hours: number } => !!r.u && !r.u.deleted_at && r.u.show_on_leaderboards && r.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.u.full_name.localeCompare(b.u.full_name, 'ar'));
  const rankOf = (i: number) => ranked.findIndex((r) => r.hours === ranked[i].hours) + 1;
  const mine = ranked.findIndex((r) => r.u.id === me.id);
  const shown = (u: User) => ({ id: u.id, full_name: u.full_name, avatar_url: !u.avatar_url || rules.canSeePhoto(me, u) ? u.avatar_url : null, gender: u.gender });
  return {
    institution: institution ? { id: institution.id, name: institution.name, kind: institution.kind } : null,
    month,
    rows: ranked.slice(0, 20).map((r, i) => ({ rank: rankOf(i), user: shown(r.u), hours: r.hours })),
    me: { hours: rules.round2(totals.get(me.id) ?? 0), rank: mine >= 0 ? rankOf(mine) : null, shown: me.show_on_leaderboards },
  };
}

// ---------- skills and matching (as server/src/routes/skills.ts) ----------

export const offeredSkills = (db: Db) => (db.skills ?? []).filter((x) => x.is_active).map((x) => x.id);
export const skillList = (db: Db): SkillRef[] => (db.skills ?? []).filter((x) => x.is_active).map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en }));
export const skillsOfEvent = (db: Db, eventId: string) => (db.event_skills ?? []).filter((x) => x.event_id === eventId).map((x) => x.skill_id);

function writeSkills(next: Db, eventId: string, sent: string[] | undefined, subtype: string, isNew: boolean) {
  if (sent === undefined && !isNew) return;
  const offered = offeredSkills(next);
  const ids = sent === undefined ? suggestedSkills(subtype, offered) : cleanSkillIds(sent, offered, MAX_SKILLS_PER_EVENT);
  next.event_skills = [...(next.event_skills ?? []).filter((x) => x.event_id !== eventId), ...ids.map((skill_id) => ({ event_id: eventId, skill_id }))];
}

export function mySkills(db: Db, userId: string): MySkillsResponse {
  return {
    skill_ids: (db.user_skills ?? []).filter((x) => x.user_id === userId).map((x) => x.skill_id),
    classes: (db.user_interests ?? []).filter((x) => x.user_id === userId).map((x) => x.event_class),
    offered: skillList(db),
  };
}

export function setMySkills(db: Db, userId: string, body: { skill_ids: string[]; classes: string[] }): Db {
  const offered = offeredSkills(db);
  const had = mySkills(db, userId).skill_ids;
  const kept = had.filter((id) => !offered.includes(id) && body.skill_ids.includes(id));
  const skills = [...new Set([...kept, ...cleanSkillIds(body.skill_ids, offered, MAX_SKILLS_PER_PERSON)])].slice(0, MAX_SKILLS_PER_PERSON);
  const classes = [...new Set(body.classes.filter(isEventClass))];
  const next = clone(db);
  next.user_skills = [...(next.user_skills ?? []).filter((x) => x.user_id !== userId), ...skills.map((skill_id) => ({ user_id: userId, skill_id }))];
  next.user_interests = [...(next.user_interests ?? []).filter((x) => x.user_id !== userId), ...classes.map((event_class) => ({ user_id: userId, event_class }))];
  return next;
}

export function skillMatches(db: Db, me: User, now: number): EventMatch[] {
  const mine = mySkills(db, me.id);
  if (mine.skill_ids.length === 0 && mine.classes.length === 0) return [];
  return db.events
    .filter((e) => effectiveStatus(e, now) === 'published' && rules.toMs(e.starts_at) > now)
    .filter((e) => registrationOf(db, e.id, me.id)?.status !== 'joined' && canUserJoinCategory(me, e))
    .map((e) => {
      const skillIds = skillsOfEvent(db, e.id);
      return {
        event_id: e.id,
        starts_at: e.starts_at,
        score: matchScore({ event_class: classOfEvent(e), skill_ids: skillIds }, mine),
        matched_skill_ids: skillIds.filter((id) => mine.skill_ids.includes(id)),
        class_liked: mine.classes.includes(classOfEvent(e)),
      };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.starts_at.localeCompare(b.starts_at))
    .slice(0, 20);
}
