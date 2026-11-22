// The app's small smarts (owner's decisions, 2026-11-22; shared/smart.ts):
// suggesting to follow, who is told an event is almost full, and when events
// posted fill fastest.

import { and, count, eq, gt, inArray, isNull, lt, ne } from 'drizzle-orm';

import type { FollowSuggestion } from '../../shared/api';
import { classOfEvent } from '../../shared/classes';
import { canFollowPerson } from '../../shared/follows';
import * as rules from '../../shared/rules';
import {
  ALMOST_FULL_GAP_MS,
  bestPostingTime,
  FILL_WINDOW_MS,
  FOLLOW_SUGGEST_AFTER,
  isAlmostFull,
  POSTING_HINT_MIN_EVENTS,
  POSTING_HINT_MIN_USERS,
  type PostingHint,
} from '../../shared/smart';
import type { User } from '../../shared/types';
import type { Database } from './db/client';
import * as s from './db/schema';
import { joinedCounts } from './db/queries';
import { waitlistOf } from './waitlist';

// ---------- "follow this?" ----------

/**
 * The institution or supervisor whose events the person attended (confirmed)
 * most, at least FOLLOW_SUGGEST_AFTER times, that they neither follow nor were
 * asked about. Institutions first on a tie: an institution stays, a supervisor
 * may move on.
 */
export async function followSuggestion(db: Database, me: User): Promise<FollowSuggestion | null> {
  const attended = await db
    .select({ event_id: s.events.id, institution_id: s.events.institution_id, created_by: s.events.created_by })
    .from(s.attendance)
    .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
    .where(and(eq(s.attendance.user_id, me.id), eq(s.attendance.participant_status, 'confirmed')));
  if (attended.length < FOLLOW_SUGGEST_AFTER) return null;
  const tally = new Map<string, { kind: 'institution' | 'person'; id: string; events: Set<string> }>();
  const add = (kind: 'institution' | 'person', id: string, eventId: string) => {
    const key = `${kind}|${id}`;
    const entry = tally.get(key) ?? { kind, id, events: new Set<string>() };
    entry.events.add(eventId);
    tally.set(key, entry);
  };
  for (const a of attended) {
    if (a.institution_id) add('institution', a.institution_id, a.event_id);
    if (a.created_by !== me.id) add('person', a.created_by, a.event_id);
  }
  const candidates = [...tally.values()]
    .filter((x) => x.events.size >= FOLLOW_SUGGEST_AFTER)
    .sort((a, b) => b.events.size - a.events.size || (a.kind === 'institution' ? -1 : 1) - (b.kind === 'institution' ? -1 : 1));
  if (candidates.length === 0) return null;
  const followed = await db.select().from(s.follows).where(eq(s.follows.user_id, me.id));
  const asked = await db.select().from(s.follow_prompts).where(eq(s.follow_prompts.user_id, me.id));
  const done = new Set([...followed, ...asked].map((r) => `${r.kind}|${r.target_id}`));
  for (const c of candidates) {
    if (done.has(`${c.kind}|${c.id}`)) continue;
    if (c.kind === 'institution') {
      const [inst] = await db.select({ name: s.institutions.name, status: s.institutions.status }).from(s.institutions).where(eq(s.institutions.id, c.id));
      if (inst?.status === 'approved') return { kind: c.kind, id: c.id, name: inst.name, events: c.events.size };
    } else {
      const [person] = await db.select().from(s.users).where(eq(s.users.id, c.id));
      if (person && !person.deleted_at && canFollowPerson(person)) return { kind: c.kind, id: c.id, name: person.full_name, events: c.events.size };
    }
  }
  return null;
}

// ---------- almost full ----------

/**
 * Who to tell that an event is almost full (shared/smart.ts isAlmostFull):
 * those it fits (a skill it needs, or they follow its institution, proposer or
 * class) who may join it and have not joined, left, or queued for it; each once
 * per event, and at most once a day. Claims them in almost_full_notices.
 */
export async function almostFullToTell(db: Database, eventId: string, t: number): Promise<{ userIds: string[]; title: string; left: number } | null> {
  const [event] = await db.select().from(s.events).where(eq(s.events.id, eventId));
  if (!event || event.status !== 'published' || event.starts_at.getTime() <= t) return null;
  const joined = (await joinedCounts(db, [eventId])).get(eventId) ?? 0;
  const left = event.capacity - joined - rules.seatsHeld(await waitlistOf(db, eventId), t);
  if (!isAlmostFull(event.capacity, left)) return null;

  const fits = new Set<string>();
  const targets: { kind: 'class' | 'institution' | 'person'; id: string }[] = [
    { kind: 'class', id: classOfEvent(event) },
    { kind: 'person', id: event.created_by },
  ];
  if (event.institution_id) targets.push({ kind: 'institution', id: event.institution_id });
  for (const x of targets) {
    for (const r of await db.select({ id: s.follows.user_id }).from(s.follows).where(and(eq(s.follows.kind, x.kind), eq(s.follows.target_id, x.id)))) fits.add(r.id);
  }
  const needs = (await db.select({ id: s.event_skills.skill_id }).from(s.event_skills).where(eq(s.event_skills.event_id, eventId))).map((r) => r.id);
  if (needs.length) {
    for (const r of await db.select({ id: s.user_skills.user_id }).from(s.user_skills).where(inArray(s.user_skills.skill_id, needs))) fits.add(r.id);
  }
  fits.delete(event.created_by);
  for (const r of await db.select({ id: s.registrations.user_id }).from(s.registrations).where(eq(s.registrations.event_id, eventId))) fits.delete(r.id);
  for (const r of await db.select({ id: s.waitlist.user_id }).from(s.waitlist).where(eq(s.waitlist.event_id, eventId))) fits.delete(r.id);
  for (const r of await db.select({ id: s.event_organizers.user_id }).from(s.event_organizers).where(eq(s.event_organizers.event_id, eventId))) fits.delete(r.id);
  if (fits.size === 0) return { userIds: [], title: event.title, left };

  const people = (await db.select().from(s.users).where(and(inArray(s.users.id, [...fits]), isNull(s.users.deleted_at)))).filter((u) =>
    rules.canUserJoinCategory(u, event),
  );
  const recent = new Set(
    (
      await db
        .select({ id: s.almost_full_notices.user_id })
        .from(s.almost_full_notices)
        .where(and(inArray(s.almost_full_notices.user_id, people.map((p) => p.id).concat('')), gt(s.almost_full_notices.sent_at, new Date(t - ALMOST_FULL_GAP_MS))))
    ).map((r) => r.id),
  );
  const userIds: string[] = [];
  for (const p of people) {
    if (recent.has(p.id)) continue;
    const [claimed] = await db
      .insert(s.almost_full_notices)
      .values({ event_id: eventId, user_id: p.id, sent_at: new Date(t) })
      .onConflictDoNothing()
      .returning();
    if (claimed) userIds.push(p.id);
  }
  return { userIds, title: event.title, left };
}

// ---------- the best time to post ----------

/**
 * When events posted fill fastest, or null until there are POSTING_HINT_MIN_EVENTS
 * past published events and POSTING_HINT_MIN_USERS members in all. An event's
 * posting time is when it was first announced (follow_notices), else when it
 * was made; how fast it filled is the share of its places taken in the 48
 * hours after.
 */
export async function postingHint(db: Database, t: number, timeZone: string): Promise<PostingHint | null> {
  const [{ users }] = await db.select({ users: count() }).from(s.users).where(isNull(s.users.deleted_at));
  if (users < POSTING_HINT_MIN_USERS) return null;
  const past = await db
    .select({ id: s.events.id, capacity: s.events.capacity, created_at: s.events.created_at, announced: s.follow_notices.sent_at })
    .from(s.events)
    .leftJoin(s.follow_notices, eq(s.follow_notices.event_id, s.events.id))
    .where(and(inArray(s.events.status, ['published', 'finished']), lt(s.events.ends_at, new Date(t))));
  if (past.length < POSTING_HINT_MIN_EVENTS) return null;
  const regs = await db
    .select({ event_id: s.registrations.event_id, joined_at: s.registrations.joined_at })
    .from(s.registrations)
    .where(and(inArray(s.registrations.event_id, past.map((e) => e.id)), ne(s.registrations.status, 'pending_terms')));
  const rows = past.map((e) => {
    const posted = (e.announced ?? e.created_at).getTime();
    const early = regs.filter((r) => r.event_id === e.id && r.joined_at && r.joined_at.getTime() - posted <= FILL_WINDOW_MS).length;
    return { posted_at: posted, fill: Math.min(1, early / e.capacity) };
  });
  return bestPostingTime(rows, timeZone);
}
