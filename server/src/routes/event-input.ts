// What an event form sends, checked once for both places that create events:
// the admin panel (routes/admin.ts) and the app (routes/events.ts). Also the
// writes both share: an event's supervisors, terms and lessons.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { BASE_POINTS_BY_SUBTYPE } from '../../../shared/placeholders';
import { LESSON_BODY_MAX, LESSON_TITLE_MAX, MAX_LESSONS } from '../../../shared/rules';
import type { Database } from '../db/client';
import { newId } from '../db/queries';
import * as s from '../db/schema';
import { HttpError } from '../http';

const subtypes = Object.keys(BASE_POINTS_BY_SUBTYPE) as [string, ...string[]];
export const isoTime = z.iso.datetime({ offset: true });

const proposalFields = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(4000),
  subtype: z.enum(subtypes),
  address_text: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  starts_at: isoTime,
  ends_at: isoTime,
  capacity: z.number().int().min(1).max(10_000),
  gender_category: z.enum(['male', 'female', 'mixed']),
  terms: z.array(z.string().trim().min(1).max(1000)).max(30),
  // Absent from a form sent by an app from before the learning corner: no lessons.
  lessons: z
    .array(z.object({ title: z.string().trim().min(1).max(LESSON_TITLE_MAX), body: z.string().trim().min(1).max(LESSON_BODY_MAX) }))
    .max(MAX_LESSONS)
    .default([]),
});

const endsAfterStart = (v: { starts_at: string; ends_at: string }) => Date.parse(v.ends_at) > Date.parse(v.starts_at);

/** The app's form (shared/api.ts EventProposal). */
export const proposalInput = proposalFields.refine(endsAfterStart);

/** The admin panel's form (shared/admin-api.ts EventInput): also names the supervisors. */
export const eventInput = proposalFields.extend({ organizer_ids: z.array(z.string()).max(20) }).refine(endsAfterStart);
export type EventInput = z.infer<typeof eventInput>;

/** Every id must name an active person, or the request is invalid. */
export async function assertIdsExist(q: Database, input: { organizer_ids: string[] }) {
  const organizerIds = [...new Set(input.organizer_ids)];
  const people = organizerIds.length
    ? await q.select({ id: s.users.id }).from(s.users).where(and(inArray(s.users.id, organizerIds), isNull(s.users.deleted_at)))
    : [];
  if (people.length !== organizerIds.length) throw new HttpError(400, 'invalid_request');
  return { organizerIds };
}

/** The event's supervisors become exactly these. Those who stay keep their row (and who added them in the app). */
export async function writeLinks(q: Database, eventId: string, organizerIds: string[]) {
  const wanted = [...new Set(organizerIds)];
  const current = await q.select({ user_id: s.event_organizers.user_id }).from(s.event_organizers).where(eq(s.event_organizers.event_id, eventId));
  const gone = current.map((r) => r.user_id).filter((id) => !wanted.includes(id));
  const added = wanted.filter((id) => !current.some((r) => r.user_id === id));
  if (gone.length) {
    await q.delete(s.event_organizers).where(and(eq(s.event_organizers.event_id, eventId), inArray(s.event_organizers.user_id, gone)));
  }
  if (added.length) await q.insert(s.event_organizers).values(added.map((user_id) => ({ event_id: eventId, user_id, added_by: null })));
}

/** Replaces the event's lessons. Only while nobody has learned one (the callers check). */
export async function writeLessons(q: Database, eventId: string, lessons: { title: string; body: string }[], at: Date) {
  await q.delete(s.event_lessons).where(eq(s.event_lessons.event_id, eventId));
  if (lessons.length) {
    await q.insert(s.event_lessons).values(
      lessons.map((l, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, title: l.title, body: l.body, created_at: at })),
    );
  }
}

export async function writeTerms(q: Database, eventId: string, terms: string[], at: Date) {
  await q.delete(s.event_terms).where(eq(s.event_terms.event_id, eventId));
  if (terms.length) {
    await q.insert(s.event_terms).values(
      terms.map((text, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, text, created_at: at })),
    );
  }
}
