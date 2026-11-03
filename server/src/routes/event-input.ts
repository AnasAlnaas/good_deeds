// What an event form sends, checked once for both places that create events:
// the admin panel (routes/admin.ts) and the app (routes/events.ts). Also the
// writes both share: an event's branches, supervisors and terms.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { BASE_POINTS_BY_SUBTYPE } from '../../../shared/placeholders';
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

export async function writeLinks(q: Database, eventId: string, organizerIds: string[]) {
  await q.delete(s.event_organizers).where(eq(s.event_organizers.event_id, eventId));
  if (organizerIds.length) await q.insert(s.event_organizers).values(organizerIds.map((user_id) => ({ event_id: eventId, user_id })));
}

export async function writeTerms(q: Database, eventId: string, terms: string[], at: Date) {
  await q.delete(s.event_terms).where(eq(s.event_terms.event_id, eventId));
  if (terms.length) {
    await q.insert(s.event_terms).values(
      terms.map((text, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, text, created_at: at })),
    );
  }
}
