// The signed-in person: profile, points and level, their attendance records,
// confirming or disputing recorded hours, and deleting the account.

import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AttendanceItem, AttendanceResponse, ConfirmResponse, MeResponse } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import type { Attendance } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { allLevels, attendanceById, creditPoints, findEvent, ledgerOf, pillarWeights, publicUser } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';

const pushToken = z.string().regex(/^Expo(nent)?PushToken\[[^\]]+\]$/);
const pushTokenBody = z.object({ token: pushToken, lang: z.enum(['ar', 'en']) });

async function toItems(db: Database, records: Attendance[]): Promise<AttendanceItem[]> {
  if (records.length === 0) return [];
  const eventIds = [...new Set(records.map((a) => a.event_id))];
  const events = await db.select().from(s.events).where(inArray(s.events.id, eventIds));
  const recorders = await db
    .select(publicUser)
    .from(s.users)
    .where(inArray(s.users.id, [...new Set(records.map((a) => a.recorded_by))]));
  const weights = await pillarWeights(db, eventIds);
  const eventById = new Map(events.map((e) => [e.id, iso(e)]));
  const recorderById = new Map(recorders.map((u) => [u.id, u]));
  return records.map((a) => {
    const e = eventById.get(a.event_id)!;
    return {
      attendance: a,
      event: { id: e.id, title: e.title, address_text: e.address_text, starts_at: e.starts_at, ends_at: e.ends_at, base_points: e.base_points },
      recorded_by: recorderById.get(a.recorded_by) ?? null,
      points: rules.pointsForAttendance(e, a.hours, weights.get(e.id)!),
    };
  });
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => {
    const { db } = c.var.deps;
    const user = c.var.user;
    const byPillar = rules.pointsByPillar(await ledgerOf(db, user.id));
    const total = rules.totalOf(byPillar);
    const levels = await allLevels(db);
    const confirmed = await db
      .select({ hours: s.attendance.hours })
      .from(s.attendance)
      .where(and(eq(s.attendance.user_id, user.id), eq(s.attendance.participant_status, 'confirmed')));
    return c.json<MeResponse>({
      user,
      points_by_pillar: byPillar,
      total_points: total,
      level: rules.levelFor(levels, total),
      next_level: rules.nextLevel(levels, total) ?? null,
      confirmed_hours: rules.round2(confirmed.reduce((sum, r) => sum + (r.hours ?? 0), 0)),
    });
  })

  .get('/attendance', async (c) => {
    const { db } = c.var.deps;
    const rows = await db
      .select()
      .from(s.attendance)
      .where(eq(s.attendance.user_id, c.var.user.id))
      .orderBy(desc(s.attendance.started_at));
    return c.json<AttendanceItem[]>(await toItems(db, rows.map((r) => iso(r) as Attendance)));
  })

  // App Store and Google Play require account deletion. Soft delete, as in Data_Model.md.
  .delete('/', async (c) => {
    const { db, now } = c.var.deps;
    const userId = c.var.user.id;
    await db.transaction(async (tx) => {
      await tx.update(s.users).set({ deleted_at: new Date(now()) }).where(eq(s.users.id, userId));
      await tx.update(s.registrations).set({ status: 'cancelled' }).where(eq(s.registrations.user_id, userId));
      await tx.delete(s.push_tokens).where(eq(s.push_tokens.user_id, userId));
    });
    return c.body(null, 204);
  })

  // The phone signed in (or its token or language changed). A phone belongs to
  // whoever signed in on it last, so its token moves to this account.
  .put('/push-token', async (c) => {
    const { db, now } = c.var.deps;
    const body = await readBody(c, pushTokenBody);
    const t = new Date(now());
    await db
      .insert(s.push_tokens)
      .values({ token: body.token, user_id: c.var.user.id, lang: body.lang, created_at: t, updated_at: t })
      .onConflictDoUpdate({ target: s.push_tokens.token, set: { user_id: c.var.user.id, lang: body.lang, updated_at: t } });
    return c.body(null, 204);
  })

  // The phone signed out: stop sending this account's notifications to it.
  .delete('/push-token', async (c) => {
    const { db } = c.var.deps;
    const body = await readBody(c, z.object({ token: pushToken }));
    await db.delete(s.push_tokens).where(and(eq(s.push_tokens.token, body.token), eq(s.push_tokens.user_id, c.var.user.id)));
    return c.body(null, 204);
  });

export const attendanceRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/:id', async (c) => {
    const { db } = c.var.deps;
    const a = await attendanceById(db, c.req.param('id'));
    if (!a) throw new ApiError('not_found');
    if (a.user_id !== c.var.user.id) throw new ApiError('not_your_attendance');
    const [item] = await toItems(db, [a]);
    return c.json<AttendanceItem>(item);
  })

  .post('/:id/confirm', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const t = now();
    const result = await db.transaction(async (tx) => {
      const a = await attendanceById(tx, id, { lock: true });
      rules.assertCanConfirm(a, me.id);
      const event = await findEvent(tx, a.event_id);
      const earned = rules.pointsForAttendance(event, a.hours, (await pillarWeights(tx, [event.id])).get(event.id)!);
      await tx
        .update(s.attendance)
        .set({ participant_status: 'confirmed', participant_acted_at: new Date(t) })
        .where(eq(s.attendance.id, id));
      const { total, level } = await creditPoints(tx, {
        userId: me.id,
        eventId: event.id,
        earned,
        reason: 'attendance_confirmed',
        at: new Date(t),
      });
      return { attendance: (await attendanceById(tx, id))!, points_earned: earned, total_points: total, level };
    });
    return c.json<ConfirmResponse>(result);
  })

  .post('/:id/dispute', async (c) => {
    const { db, now } = c.var.deps;
    const id = c.req.param('id');
    const attendance = await db.transaction(async (tx) => {
      rules.assertCanDispute(await attendanceById(tx, id, { lock: true }), c.var.user.id);
      await tx
        .update(s.attendance)
        .set({ participant_status: 'disputed', participant_acted_at: new Date(now()) })
        .where(eq(s.attendance.id, id));
      return (await attendanceById(tx, id))!;
    });
    return c.json<AttendanceResponse>({ attendance });
  });

