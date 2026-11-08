// A full event's waiting list (shared/types.ts WaitlistEntry, the rules in
// shared/rules.ts planOffers). A place opens when someone leaves the event or
// the list with a place held for them, when an admin adds places, or when an
// offer runs out; each time, the next in line is offered it.

import { and, eq, inArray } from 'drizzle-orm';

import * as rules from '../../shared/rules';
import type { WaitlistEntry } from '../../shared/types';
import type { Database } from './db/client';
import { joinedCounts } from './db/queries';
import { iso } from './db/rows';
import * as s from './db/schema';

export async function waitlistOf(q: Database, eventId: string): Promise<WaitlistEntry[]> {
  const rows = await q.select().from(s.waitlist).where(eq(s.waitlist.event_id, eventId));
  return rules.sortWaitlist(rows.map(iso));
}

/**
 * Offers the event's open places to the next in line, and takes off the list
 * those whose offer ran out. Call it inside a transaction that locked the
 * event (or alone in one). Returns the new offers, to tell their people.
 */
export async function fillOpenPlaces(q: Database, eventId: string, now: number) {
  const [event] = await q.select().from(s.events).where(eq(s.events.id, eventId)).for('update');
  if (!event) return [];
  const plan = rules.planOffers({
    event: { capacity: event.capacity, starts_at: event.starts_at.toISOString(), status: event.status },
    joinedCount: (await joinedCounts(q, [eventId])).get(eventId) ?? 0,
    waitlist: await waitlistOf(q, eventId),
    now,
  });
  if (plan.expired.length) {
    await q.delete(s.waitlist).where(and(eq(s.waitlist.event_id, eventId), inArray(s.waitlist.user_id, plan.expired)));
  }
  for (const o of plan.offer) {
    await q
      .update(s.waitlist)
      .set({ offered_at: new Date(now), offer_expires_at: new Date(o.offer_expires_at) })
      .where(and(eq(s.waitlist.event_id, eventId), eq(s.waitlist.user_id, o.user_id)));
  }
  return plan.offer;
}
