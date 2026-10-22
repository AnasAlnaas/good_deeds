// The admin panel's endpoints (/api/admin/…). Admins only. Every change runs
// in a transaction with its audit row, so a decision and its record of who
// made it land together or not at all.

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import type {
  AdminEventDetail,
  AdminEventRow,
  AdminMeta,
  AdminOverview,
  AdminUserRow,
  AuditEntry,
  DisputeRow,
  HoursReportRow,
} from '../../../shared/admin-api';
import * as adminRules from '../../../shared/admin-rules';
import { AdminError, ApiError } from '../../../shared/errors';
import { BASE_POINTS_BY_SUBTYPE } from '../../../shared/placeholders';
import * as rules from '../../../shared/rules';
import { type AppEvent, type Attendance, PILLARS, type Pillar } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { creditPoints, joinedCounts, newId, pillarWeights, publicUser } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, HttpError, readBody } from '../http';
import { notifyDisputeSettled, notifyEventCancelled, notifyEventChanged } from '../notify';

const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.role !== 'admin') throw new AdminError('forbidden');
  await next();
});

// ---------- request bodies ----------

const subtypes = Object.keys(BASE_POINTS_BY_SUBTYPE) as [string, ...string[]];
const isoTime = z.iso.datetime({ offset: true });

const eventInput = z
  .object({
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
    branch_ids: z.array(z.string()).min(1).max(20),
    organizer_ids: z.array(z.string()).max(20),
    terms: z.array(z.string().trim().min(1).max(1000)).max(30),
  })
  .refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at));
type EventInput = z.infer<typeof eventInput>;

const createEventBody = eventInput.and(z.object({ publish: z.boolean() }));
const roleBody = z.object({ role: z.enum(['member', 'supervisor', 'admin']) });
const resolveBody = z.object({
  decision: z.enum(['accept', 'correct', 'reject']),
  hours: z.number().optional(),
  note: z.string().trim().min(1).max(500),
});

// ---------- helpers ----------

async function audit(
  q: Database,
  row: { actorId: string | null; action: (typeof s.adminAction.enumValues)[number]; targetId: string; details: Record<string, unknown>; at: Date },
) {
  await q.insert(s.admin_actions).values({
    id: newId(),
    actor_id: row.actorId,
    action: row.action,
    target_id: row.targetId,
    details: row.details,
    created_at: row.at,
  });
}

/** Any event, drafts included (the app's findEvent hides drafts). */
async function anyEvent(q: Database, id: string, lock = false): Promise<AppEvent> {
  const query = q.select().from(s.events).where(eq(s.events.id, id));
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw new ApiError('not_found');
  return iso(row);
}

async function organizersOf(q: Database, eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, ReturnType<typeof toPublic>[]>();
  const rows = await q
    .select({ event_id: s.event_organizers.event_id, ...publicUser })
    .from(s.event_organizers)
    .innerJoin(s.users, eq(s.users.id, s.event_organizers.user_id))
    .where(inArray(s.event_organizers.event_id, eventIds));
  const map = new Map<string, ReturnType<typeof toPublic>[]>();
  for (const r of rows) map.set(r.event_id, [...(map.get(r.event_id) ?? []), toPublic(r)]);
  return map;
}
const toPublic = (r: { id: string; full_name: string; avatar_url: string | null; gender: 'male' | 'female' }) => ({
  id: r.id,
  full_name: r.full_name,
  avatar_url: r.avatar_url,
  gender: r.gender,
});

async function hasAttendance(q: Database, eventId: string) {
  const [row] = await q.select({ n: count() }).from(s.attendance).where(eq(s.attendance.event_id, eventId));
  return row.n > 0;
}

async function termTexts(q: Database, eventId: string) {
  const rows = await q.select().from(s.event_terms).where(eq(s.event_terms.event_id, eventId)).orderBy(asc(s.event_terms.order_index));
  return rows.map((r) => r.text ?? '');
}

/** Every id must name an existing branch / an active person, or the request is invalid. */
async function assertIdsExist(q: Database, input: Pick<EventInput, 'branch_ids' | 'organizer_ids'>) {
  const branchIds = [...new Set(input.branch_ids)];
  const organizerIds = [...new Set(input.organizer_ids)];
  const branches = await q.select({ id: s.branches.id }).from(s.branches).where(inArray(s.branches.id, branchIds));
  const people = organizerIds.length
    ? await q.select({ id: s.users.id }).from(s.users).where(and(inArray(s.users.id, organizerIds), isNull(s.users.deleted_at)))
    : [];
  if (branches.length !== branchIds.length || people.length !== organizerIds.length) throw new HttpError(400, 'invalid_request');
  return { branchIds, organizerIds };
}

async function writeLinks(q: Database, eventId: string, branchIds: string[], organizerIds: string[]) {
  await q.delete(s.event_branches).where(eq(s.event_branches.event_id, eventId));
  await q.delete(s.event_organizers).where(eq(s.event_organizers.event_id, eventId));
  await q.insert(s.event_branches).values(branchIds.map((branch_id) => ({ event_id: eventId, branch_id })));
  if (organizerIds.length) await q.insert(s.event_organizers).values(organizerIds.map((user_id) => ({ event_id: eventId, user_id })));
}

async function writeTerms(q: Database, eventId: string, terms: string[], at: Date) {
  await q.delete(s.event_terms).where(eq(s.event_terms.event_id, eventId));
  if (terms.length) {
    await q.insert(s.event_terms).values(
      terms.map((text, i) => ({ id: newId(), event_id: eventId, order_index: i + 1, text, created_at: at })),
    );
  }
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// ---------- routes ----------

export const adminRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)

  .get('/overview', async (c) => {
    const { db, now } = c.var.deps;
    const t = now();
    const [users] = await db.select({ n: count() }).from(s.users).where(isNull(s.users.deleted_at));
    const events = (await db.select({ status: s.events.status, starts_at: s.events.starts_at, ends_at: s.events.ends_at }).from(s.events)).map(iso);
    const statuses = events.map((e) => rules.effectiveStatus(e, t));
    const [awaiting] = await db
      .select({ n: count() })
      .from(s.attendance)
      .where(and(eq(s.attendance.participant_status, 'pending'), isNotNull(s.attendance.ended_at)));
    const [disputes] = await db.select({ n: count() }).from(s.attendance).where(eq(s.attendance.participant_status, 'disputed'));
    return c.json<AdminOverview>({
      users: users.n,
      upcoming_events: statuses.filter((x) => x === 'published').length,
      running_events: statuses.filter((x) => x === 'running').length,
      draft_events: statuses.filter((x) => x === 'draft').length,
      awaiting_confirmation: awaiting.n,
      open_disputes: disputes.n,
    });
  })

  .get('/meta', async (c) => {
    const { db } = c.var.deps;
    const branches = await db.select().from(s.branches).where(eq(s.branches.is_active, true)).orderBy(asc(s.branches.id));
    const links = await db.select().from(s.branch_pillars);
    const people = await db
      .select({ ...publicUser, role: s.users.role, phone: s.users.phone })
      .from(s.users)
      .where(isNull(s.users.deleted_at))
      .orderBy(asc(s.users.full_name));
    return c.json<AdminMeta>({
      branches: branches.map((b) => ({ ...b, pillars: PILLARS.filter((p) => links.some((l) => l.branch_id === b.id && l.pillar === p)) })),
      subtypes: Object.entries(BASE_POINTS_BY_SUBTYPE).map(([id, base_points]) => ({ id, base_points })),
      people,
    });
  })

  // ---------- users ----------

  .get('/users', async (c) => {
    const { db } = c.var.deps;
    const q = c.req.query('q')?.trim();
    const match = q ? or(ilike(s.users.full_name, `%${escapeLike(q)}%`), ilike(s.users.phone, `%${escapeLike(q)}%`)) : undefined;
    const users = await db
      .select()
      .from(s.users)
      .where(and(isNull(s.users.deleted_at), match))
      .orderBy(asc(s.users.full_name))
      .limit(500);
    const ids = users.map((u) => u.id);
    const hours = ids.length
      ? await db
          .select({ user_id: s.attendance.user_id, hours: s.attendance.hours })
          .from(s.attendance)
          .where(and(inArray(s.attendance.user_id, ids), eq(s.attendance.participant_status, 'confirmed')))
      : [];
    return c.json<AdminUserRow[]>(
      users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        phone: u.phone,
        gender: u.gender,
        city: u.city,
        role: u.role,
        level: u.level,
        total_points: u.total_points,
        is_association_member: u.is_association_member,
        created_at: u.created_at.toISOString(),
        confirmed_hours: rules.round2(hours.filter((h) => h.user_id === u.id).reduce((sum, h) => sum + (h.hours ?? 0), 0)),
      })),
    );
  })

  .patch('/users/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, roleBody);
    await db.transaction(async (tx) => {
      const [target] = await tx.select().from(s.users).where(eq(s.users.id, id)).for('update');
      if (!target || target.deleted_at) throw new ApiError('not_found');
      adminRules.assertCanChangeRole(me.id, id, body.role);
      if (target.role === body.role) return;
      await tx.update(s.users).set({ role: body.role }).where(eq(s.users.id, id));
      await audit(tx, { actorId: me.id, action: 'change_role', targetId: id, details: { name: target.full_name, from: target.role, to: body.role }, at: new Date(now()) });
    });
    return c.body(null, 204);
  })

  // ---------- events ----------

  .get('/events', async (c) => {
    const { db, now } = c.var.deps;
    const t = now();
    const events = (await db.select().from(s.events).orderBy(desc(s.events.starts_at))).map((e) => iso(e) as AppEvent);
    const ids = events.map((e) => e.id);
    const counts = await joinedCounts(db, ids);
    const organizers = await organizersOf(db, ids);
    return c.json<AdminEventRow[]>(
      events.map((event) => ({
        event,
        effective_status: rules.effectiveStatus(event, t),
        joined_count: counts.get(event.id) ?? 0,
        organizers: organizers.get(event.id) ?? [],
      })),
    );
  })

  .get('/events/:id', async (c) => {
    const { db, now } = c.var.deps;
    const id = c.req.param('id');
    const event = await anyEvent(db, id);
    const branches = await db
      .select({ branch: s.branches })
      .from(s.event_branches)
      .innerJoin(s.branches, eq(s.branches.id, s.event_branches.branch_id))
      .where(eq(s.event_branches.event_id, id));
    const links = branches.length
      ? await db.select().from(s.branch_pillars).where(inArray(s.branch_pillars.branch_id, branches.map((b) => b.branch.id)))
      : [];
    const terms = await db.select().from(s.event_terms).where(eq(s.event_terms.event_id, id)).orderBy(asc(s.event_terms.order_index));
    const registrations = await db
      .select({ registration: s.registrations, ...publicUser, phone: s.users.phone })
      .from(s.registrations)
      .innerJoin(s.users, eq(s.users.id, s.registrations.user_id))
      .where(eq(s.registrations.event_id, id))
      .orderBy(asc(s.registrations.created_at));
    const attendance = await db.select().from(s.attendance).where(eq(s.attendance.event_id, id));
    return c.json<AdminEventDetail>({
      event,
      effective_status: rules.effectiveStatus(event, now()),
      joined_count: (await joinedCounts(db, [id])).get(id) ?? 0,
      organizers: (await organizersOf(db, [id])).get(id) ?? [],
      branches: branches.map(({ branch }) => ({
        ...branch,
        pillars: PILLARS.filter((p) => links.some((l) => l.branch_id === branch.id && l.pillar === p)),
      })),
      terms: terms.map(iso),
      participants: registrations.map((r) => {
        const a = attendance.find((x) => x.user_id === r.id);
        return {
          user: { ...toPublic(r), phone: r.phone },
          registration: iso(r.registration),
          attendance: a ? (iso(a) as Attendance) : null,
        };
      }),
    });
  })

  .post('/events', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, createEventBody);
    const t = new Date(now());
    const id = newId();
    await db.transaction(async (tx) => {
      const { branchIds, organizerIds } = await assertIdsExist(tx, body);
      if (body.publish && organizerIds.length === 0) throw new AdminError('needs_organizer');
      await tx.insert(s.events).values({
        id,
        title: body.title,
        description: body.description,
        subtype: body.subtype,
        image_url: null,
        lat: body.lat,
        lng: body.lng,
        address_text: body.address_text,
        starts_at: new Date(body.starts_at),
        ends_at: new Date(body.ends_at),
        capacity: body.capacity,
        gender_category: body.gender_category,
        base_points: BASE_POINTS_BY_SUBTYPE[body.subtype],
        status: body.publish ? 'published' : 'draft',
        created_by: me.id,
        created_at: t,
      });
      await writeLinks(tx, id, branchIds, organizerIds);
      await writeTerms(tx, id, body.terms, t);
      await audit(tx, { actorId: me.id, action: 'create_event', targetId: id, details: { title: body.title, published: body.publish }, at: t });
    });
    return c.json({ id }, 201);
  })

  .put('/events/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, eventInput);
    const t = now();
    const edit = await db.transaction(async (tx) => {
      // Locking the event makes joins wait, so the joined count below stays true.
      const event = await anyEvent(tx, id, true);
      const { branchIds, organizerIds } = await assertIdsExist(tx, body);
      const currentTerms = await termTexts(tx, id);
      adminRules.assertEventEdit({
        event,
        next: { ...body, organizerCount: organizerIds.length },
        currentTerms,
        joinedCount: (await joinedCounts(tx, [id])).get(id) ?? 0,
        hasAttendance: await hasAttendance(tx, id),
        now: t,
      });
      const fields = ['title', 'description', 'subtype', 'address_text', 'lat', 'lng', 'capacity', 'gender_category'] as const;
      const changed: string[] = fields.filter((k) => body[k] !== event[k]);
      if (rules.toMs(body.starts_at) !== rules.toMs(event.starts_at)) changed.push('starts_at');
      if (rules.toMs(body.ends_at) !== rules.toMs(event.ends_at)) changed.push('ends_at');
      await tx
        .update(s.events)
        .set({
          title: body.title,
          description: body.description,
          subtype: body.subtype,
          // An event keeps its points unless its type changes.
          base_points: body.subtype === event.subtype ? event.base_points : BASE_POINTS_BY_SUBTYPE[body.subtype],
          address_text: body.address_text,
          lat: body.lat,
          lng: body.lng,
          starts_at: new Date(body.starts_at),
          ends_at: new Date(body.ends_at),
          capacity: body.capacity,
          gender_category: body.gender_category,
        })
        .where(eq(s.events.id, id));
      await writeLinks(tx, id, branchIds, organizerIds);
      const termsChanged = body.terms.length !== currentTerms.length || body.terms.some((x, i) => x !== currentTerms[i]);
      if (termsChanged) await writeTerms(tx, id, body.terms, new Date(t));
      await audit(tx, {
        actorId: me.id,
        action: 'update_event',
        targetId: id,
        details: { title: body.title, changed: termsChanged ? [...changed, 'terms'] : changed },
        at: new Date(t),
      });
      return { wasDraft: event.status === 'draft', changed };
    });
    // A draft has nobody to tell yet.
    if (!edit.wasDraft) {
      notifyEventChanged(c.var.deps, id, me.id, {
        time: edit.changed.includes('starts_at') || edit.changed.includes('ends_at'),
        place: ['address_text', 'lat', 'lng'].some((k) => edit.changed.includes(k)),
      });
    }
    return c.body(null, 204);
  })

  .post('/events/:id/:action{publish|cancel}', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const action = c.req.param('action') as 'publish' | 'cancel';
    const t = now();
    const wasDraft = await db.transaction(async (tx) => {
      const event = await anyEvent(tx, id, true);
      const [organizers] = await tx.select({ n: count() }).from(s.event_organizers).where(eq(s.event_organizers.event_id, id));
      const status = adminRules.decideStatusChange({ event, action, organizerCount: organizers.n, hasAttendance: await hasAttendance(tx, id), now: t });
      await tx.update(s.events).set({ status }).where(eq(s.events.id, id));
      await audit(tx, {
        actorId: me.id,
        action: action === 'publish' ? 'publish_event' : 'cancel_event',
        targetId: id,
        details: { title: event.title },
        at: new Date(t),
      });
      return event.status === 'draft';
    });
    if (action === 'cancel' && !wasDraft) notifyEventCancelled(c.var.deps, id, me.id);
    return c.body(null, 204);
  })

  // ---------- disputed hours ----------

  .get('/disputes', async (c) => {
    const { db } = c.var.deps;
    const rows = await db
      .select({ attendance: s.attendance, event: s.events, ...publicUser, phone: s.users.phone })
      .from(s.attendance)
      .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
      .innerJoin(s.users, eq(s.users.id, s.attendance.user_id))
      .where(eq(s.attendance.participant_status, 'disputed'))
      .orderBy(asc(s.attendance.participant_acted_at));
    const recorderIds = [...new Set(rows.map((r) => r.attendance.recorded_by))];
    const recorders = recorderIds.length ? await db.select(publicUser).from(s.users).where(inArray(s.users.id, recorderIds)) : [];
    return c.json<DisputeRow[]>(
      rows.map((r) => ({
        attendance: iso(r.attendance) as Attendance,
        user: { ...toPublic(r), phone: r.phone },
        event: {
          id: r.event.id,
          title: r.event.title,
          starts_at: r.event.starts_at.toISOString(),
          ends_at: r.event.ends_at.toISOString(),
          base_points: r.event.base_points,
        },
        recorded_by: recorders.find((u) => u.id === r.attendance.recorded_by) ?? null,
      })),
    );
  })

  .post('/disputes/:id/resolve', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, resolveBody);
    const t = new Date(now());
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(s.attendance).where(eq(s.attendance.id, id)).for('update');
      if (!row) throw new ApiError('not_found');
      const a = iso(row) as Attendance;
      const event = await anyEvent(tx, a.event_id);
      const { hours } = adminRules.decideResolution({ attendance: a, event, decision: body.decision, hours: body.hours });
      await tx.update(s.attendance).set({ hours, participant_status: 'confirmed' }).where(eq(s.attendance.id, id));
      const earned = rules.pointsForAttendance(event, hours, (await pillarWeights(tx, [event.id])).get(event.id)!);
      await creditPoints(tx, { userId: a.user_id, eventId: event.id, earned, reason: 'dispute_resolved', at: t });
      await audit(tx, {
        actorId: me.id,
        action: 'resolve_dispute',
        targetId: id,
        details: { decision: body.decision, hours_before: a.hours, hours_after: hours, note: body.note, user_id: a.user_id, event_title: event.title },
        at: t,
      });
      return { hours };
    });
    notifyDisputeSettled(c.var.deps, id, body.decision, result.hours);
    return c.body(null, 204);
  })

  // ---------- hours report ----------

  .get('/reports/hours', async (c) => {
    const { db } = c.var.deps;
    const range = z.object({ from: isoTime, to: isoTime }).safeParse(c.req.query());
    if (!range.success || Date.parse(range.data.to) <= Date.parse(range.data.from)) throw new HttpError(400, 'invalid_request');
    const rows = await db
      .select({ a: s.attendance, user: s.users })
      .from(s.attendance)
      .innerJoin(s.users, eq(s.users.id, s.attendance.user_id))
      .where(
        and(
          eq(s.attendance.participant_status, 'confirmed'),
          gte(s.attendance.started_at, new Date(range.data.from)),
          lt(s.attendance.started_at, new Date(range.data.to)),
          isNull(s.users.deleted_at),
        ),
      );
    const userIds = [...new Set(rows.map((r) => r.a.user_id))];
    const ledger = userIds.length
      ? await db.select().from(s.points_ledger).where(inArray(s.points_ledger.user_id, userIds))
      : [];
    const report = new Map<string, HoursReportRow>();
    for (const { a, user } of rows) {
      const entry = report.get(user.id) ?? {
        user_id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        city: user.city,
        gender: user.gender,
        events: 0,
        hours: 0,
        points: { spiritual: 0, mental: 0, physical: 0 } as Record<Pillar, number>,
        total_points: 0,
      };
      entry.events += 1;
      entry.hours = rules.round2(entry.hours + (a.hours ?? 0));
      // The points these hours earned: the ledger rows for this person at this event.
      for (const l of ledger.filter((x) => x.user_id === user.id && x.event_id === a.event_id)) {
        entry.points[l.pillar] = rules.round2(entry.points[l.pillar] + l.points);
      }
      entry.total_points = rules.totalOf(entry.points);
      report.set(user.id, entry);
    }
    return c.json<HoursReportRow[]>([...report.values()].sort((x, y) => y.hours - x.hours));
  })

  // ---------- audit log ----------

  .get('/audit', async (c) => {
    const { db } = c.var.deps;
    const rows = await db.select().from(s.admin_actions).orderBy(desc(s.admin_actions.created_at)).limit(300);
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
    const actors = actorIds.length ? await db.select(publicUser).from(s.users).where(inArray(s.users.id, actorIds)) : [];
    return c.json<AuditEntry[]>(
      rows.map((r) => ({
        id: r.id,
        actor: actors.find((u) => u.id === r.actor_id) ?? null,
        action: r.action,
        target_id: r.target_id,
        details: r.details,
        created_at: r.created_at.toISOString(),
      })),
    );
  });
