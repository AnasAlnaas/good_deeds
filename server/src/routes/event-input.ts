// What an event form sends, checked once for both places that create events:
// the admin panel (routes/admin.ts) and the app (routes/events.ts). Also the
// writes both share: an event's supervisors, terms and lessons.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { BASE_POINTS_BY_SUBTYPE } from '../../../shared/placeholders';
import * as rules from '../../../shared/rules';
import { LESSON_BODY_MAX, LESSON_TITLE_MAX, MAX_LESSONS } from '../../../shared/rules';
import type { Database } from '../db/client';
import { newId } from '../db/queries';
import * as s from '../db/schema';
import { HttpError } from '../http';
import { dropUnusedImages } from '../lesson-images';

const subtypes = Object.keys(BASE_POINTS_BY_SUBTYPE) as [string, ...string[]];
export const isoTime = z.iso.datetime({ offset: true });

const proposalFields = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(4000),
  subtype: z.enum(subtypes),
  // Checked together, as rules.cleanPlace decides: what one kind needs, and the other kind's fields empty.
  location_type: z.enum(['in_person', 'online']).default('in_person'),
  address_text: z.string().max(rules.ADDRESS_MAX).nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  meeting_platform: z.string().nullish(),
  meeting_url: z.string().max(rules.MEETING_URL_MAX).nullish(),
  starts_at: isoTime,
  ends_at: isoTime,
  capacity: z.number().int().min(1).max(10_000),
  gender_category: z.enum(['male', 'female', 'mixed']),
  terms: z.array(z.string().trim().min(1).max(1000)).max(30),
  // Absent from a form sent by an app from before the learning corner: no lessons.
  // A lesson has text, a picture (POST /lesson-images), or both; an older app sends no picture.
  lessons: z
    .array(
      z
        .object({
          title: z.string().trim().min(1).max(LESSON_TITLE_MAX),
          body: z.string().trim().max(LESSON_BODY_MAX),
          image_id: z
            .string()
            .min(1)
            .nullish()
            .transform((v) => v ?? null),
          // The app and the panel send the id read from the link; an older app sends none.
          video_id: z
            .string()
            .refine(rules.isYoutubeId)
            .nullish()
            .transform((v) => v ?? null),
        })
        .refine(rules.lessonComplete),
    )
    .max(MAX_LESSONS)
    .default([]),
});

const endsAfterStart = (v: { starts_at: string; ends_at: string }) => Date.parse(v.ends_at) > Date.parse(v.starts_at);

/** The place fields replaced by their cleaned values; a place that does not hold together is an invalid request. */
function withPlace<T extends Parameters<typeof rules.cleanPlace>[0]>(v: T, ctx: z.RefinementCtx) {
  const place = rules.cleanPlace(v);
  if (!place) {
    ctx.addIssue({ code: 'custom', message: 'place' });
    return z.NEVER;
  }
  return { ...v, ...place };
}

/** The app's form (shared/api.ts EventProposal). */
export const proposalInput = proposalFields.refine(endsAfterStart).transform(withPlace);

/** The admin panel's form (shared/admin-api.ts EventInput): also names the supervisors. */
const adminFields = proposalFields.extend({ organizer_ids: z.array(z.string()).max(20) });
export const eventInput = adminFields.refine(endsAfterStart).transform(withPlace);

/** A new event from the panel: published at once, or saved as a draft. */
export const createEventInput = adminFields.extend({ publish: z.boolean() }).refine(endsAfterStart).transform(withPlace);
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

type LessonFields = { title: string; body: string; image_id: string | null; video_id: string | null };

/**
 * Replaces the event's lessons. Only while nobody has learned one (the callers
 * check). Every picture named must have been sent; the ones the old lessons
 * showed and the new ones do not are removed.
 */
export async function writeLessons(q: Database, eventId: string, lessons: LessonFields[], at: Date) {
  const wanted = [...new Set(lessons.flatMap((l) => (l.image_id ? [l.image_id] : [])))];
  const found = wanted.length ? await q.select({ id: s.lesson_images.id }).from(s.lesson_images).where(inArray(s.lesson_images.id, wanted)) : [];
  if (found.length !== wanted.length) throw new HttpError(400, 'invalid_request');
  const before = await removeLessons(q, eventId, false);
  if (lessons.length) {
    await q.insert(s.event_lessons).values(
      lessons.map((l, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, title: l.title, body: l.body, image_id: l.image_id, video_id: l.video_id, created_at: at })),
    );
  }
  await dropUnusedImages(q, before);
}

/** Deletes the event's lessons, and, unless told not to, the pictures no other lesson shows. Returns the pictures they showed. */
export async function removeLessons(q: Database, eventId: string, dropImages = true) {
  const gone = await q.delete(s.event_lessons).where(eq(s.event_lessons.event_id, eventId)).returning({ image_id: s.event_lessons.image_id });
  const images = gone.map((l) => l.image_id);
  if (dropImages) await dropUnusedImages(q, images);
  return images;
}

export async function writeTerms(q: Database, eventId: string, terms: string[], at: Date) {
  await q.delete(s.event_terms).where(eq(s.event_terms.event_id, eventId));
  if (terms.length) {
    await q.insert(s.event_terms).values(
      terms.map((text, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, text, created_at: at })),
    );
  }
}

/** The columns that say where an event happens, from a checked form. */
export function placeOf(body: Pick<EventInput, 'location_type' | 'address_text' | 'lat' | 'lng' | 'meeting_platform' | 'meeting_url'>) {
  const { location_type, address_text, lat, lng, meeting_platform, meeting_url } = body;
  return { location_type, address_text, lat, lng, meeting_platform, meeting_url };
}
