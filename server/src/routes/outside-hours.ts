// Hours a volunteer did outside the app's events (owner's decisions,
// 2026-11-19; shared/types.ts OutsideHours): claimed for one of their
// institutions here, and decided by its representatives (routes/institutions.ts).

import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { OutsideHoursItem } from '../../../shared/api';
import * as rules from '../../../shared/rules';
import type { OutsideHours, User } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { findInstitution, lessonImageRefs, membershipOf, newId, publicUser, shownTo } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';
import { notifyOutsideHoursClaimed } from '../notify';

const claimBody = z.object({
  institution_id: z.string().min(1).max(80),
  done_on: z.string().max(20),
  minutes: z.number(),
  description: z.string().max(rules.OUTSIDE_HOURS_DESCRIPTION_MAX + 200),
  place: z.string().max(rules.OUTSIDE_HOURS_PLACE_MAX + 100).nullish(),
  image_id: z.string().max(80).nullish(),
});

/** Claims as their volunteer or the institution's representatives see them. */
export async function outsideHoursItems(db: Database, viewer: User, claims: OutsideHours[]): Promise<OutsideHoursItem[]> {
  if (claims.length === 0) return [];
  const people = [...new Set(claims.flatMap((c) => [c.user_id, ...(c.decided_by ? [c.decided_by] : [])]))];
  const users = new Map((await db.select(publicUser).from(s.users).where(inArray(s.users.id, people))).map((u) => [u.id, u]));
  const institutionIds = [...new Set(claims.map((c) => c.institution_id))];
  const institutions = new Map(
    (await db.select({ id: s.institutions.id, name: s.institutions.name, kind: s.institutions.kind }).from(s.institutions).where(inArray(s.institutions.id, institutionIds))).map(
      (i) => [i.id, i],
    ),
  );
  const images = await lessonImageRefs(db, claims);
  return claims.map((claim) => {
    const decider = claim.decided_by ? users.get(claim.decided_by) : undefined;
    return {
      claim,
      institution: institutions.get(claim.institution_id)!,
      image: (claim.image_id && images.get(claim.image_id)) || null,
      user: shownTo(viewer, users.get(claim.user_id)!),
      decided_by: decider ? shownTo(viewer, decider) : null,
    };
  });
}

export async function findClaim(q: Database, id: string, opts: { lock?: boolean } = {}) {
  const query = q.select().from(s.outside_hours).where(eq(s.outside_hours.id, id));
  const [row] = opts.lock ? await query.for('update') : await query;
  return row ? iso(row) : undefined;
}

export const outsideHoursRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const rows = await db.select().from(s.outside_hours).where(eq(s.outside_hours.user_id, me.id)).orderBy(desc(s.outside_hours.created_at));
    return c.json<OutsideHoursItem[]>(await outsideHoursItems(db, me, rows.map(iso)));
  })

  .post('/', async (c) => {
    const { db, now, timeZone } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, claimBody);
    const id = newId();
    await db.transaction(async (tx) => {
      // Locking the person makes two claims sent at once count each other.
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, me.id)).for('update');
      const [pending] = await tx
        .select({ n: count() })
        .from(s.outside_hours)
        .where(and(eq(s.outside_hours.user_id, me.id), eq(s.outside_hours.institution_id, body.institution_id), eq(s.outside_hours.status, 'pending')));
      if (body.image_id) {
        const [image] = await tx.select({ id: s.lesson_images.id }).from(s.lesson_images).where(eq(s.lesson_images.id, body.image_id));
        if (!image) body.image_id = null;
      }
      const claim = rules.assertCanClaimOutsideHours({
        input: body,
        institution: await findInstitution(tx, body.institution_id),
        membership: await membershipOf(tx, body.institution_id, me.id),
        pendingForInstitution: pending.n,
        now: now(),
        timeZone,
      });
      await tx.insert(s.outside_hours).values({ id, user_id: me.id, ...claim, status: 'pending', created_at: new Date(now()) });
    });
    notifyOutsideHoursClaimed(c.var.deps, id);
    return c.json<OutsideHoursItem>((await outsideHoursItems(db, me, [(await findClaim(db, id))!]))[0], 201);
  });
