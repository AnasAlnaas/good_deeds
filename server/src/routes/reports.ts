// Members' reports (بلاغ), and the member's side of warnings (إنذار): reading
// their own and appealing one. Kept apart, as the master file decides. A
// supervisor gives a warning from the roster (routes/events.ts); admins handle
// reports and decide on appeals (routes/admin.ts).
// Every change runs in a transaction: the rows are read (and locked), the
// shared rule decides, and the result is written, or nothing is.

import { and, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { MyReport, MyWarning, ReportFormMeta } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import { REPORT_CATEGORIES, type Report, type User, type Warning } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { findEvent, joinedUsers, levelOf, newId, openReports, publicUser, shownTo, wasAtEvent, warningById } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';

// An empty note or reason is the rule's to judge (note_required, reason_required), as in the offline demo.
const reportBody = z.object({
  category: z.enum(REPORT_CATEGORIES),
  event_id: z.string().min(1).optional(),
  subject_id: z.string().min(1).optional(),
  note: z.string().max(rules.REPORT_NOTE_MAX).optional(),
});
const appealBody = z.object({ reason: z.string().max(rules.REASON_MAX) });

/** Reports as their author sees them: without who handled them or the admin's note. */
export async function asMyReports(db: Database, viewer: User, rows: Report[]): Promise<MyReport[]> {
  const eventIds = [...new Set(rows.flatMap((r) => (r.event_id ? [r.event_id] : [])))];
  const subjectIds = [...new Set(rows.flatMap((r) => (r.subject_id ? [r.subject_id] : [])))];
  const events = eventIds.length ? await db.select({ id: s.events.id, title: s.events.title }).from(s.events).where(inArray(s.events.id, eventIds)) : [];
  const people = subjectIds.length ? await db.select(publicUser).from(s.users).where(inArray(s.users.id, subjectIds)) : [];
  return rows.map((r) => {
    const subject = people.find((u) => u.id === r.subject_id);
    return {
      report: { id: r.id, category: r.category, note: r.note, status: r.status, created_at: r.created_at, handled_at: r.handled_at },
      event: events.find((e) => e.id === r.event_id) ?? null,
      subject: subject ? shownTo(viewer, subject) : null,
    };
  });
}

/** Warnings as the member they were given to sees them: without which admin decided. */
export async function asMyWarnings(db: Database, viewer: User, rows: Warning[]): Promise<MyWarning[]> {
  if (rows.length === 0) return [];
  const events = await db
    .select({ id: s.events.id, title: s.events.title, starts_at: s.events.starts_at })
    .from(s.events)
    .where(inArray(s.events.id, [...new Set(rows.map((w) => w.event_id))]));
  const issuers = await db
    .select(publicUser)
    .from(s.users)
    .where(inArray(s.users.id, [...new Set(rows.map((w) => w.issued_by))]));
  return rows.map(({ decided_by, ...warning }) => {
    const e = events.find((x) => x.id === warning.event_id)!;
    const issuer = issuers.find((u) => u.id === warning.issued_by);
    return {
      warning,
      event: { id: e.id, title: e.title, starts_at: e.starts_at.toISOString() },
      issued_by: issuer ? shownTo(viewer, issuer) : null,
    };
  });
}

export const reportRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // What the report screen offers: the categories, and the events the person
  // was at with the people there (a report names someone only from its event).
  .get('/form', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    if (!rules.canReport(me, await levelOf(db, me.id))) throw new ApiError('cannot_report');
    const joined = await db
      .select({ id: s.registrations.event_id })
      .from(s.registrations)
      .where(and(eq(s.registrations.user_id, me.id), eq(s.registrations.status, 'joined')));
    const organized = await db.select({ id: s.event_organizers.event_id }).from(s.event_organizers).where(eq(s.event_organizers.user_id, me.id));
    const ids = [...new Set([...joined, ...organized].map((r) => r.id))];
    const events = ids.length
      ? await db
          .select()
          .from(s.events)
          .where(and(inArray(s.events.id, ids), notInArray(s.events.status, ['draft', 'rejected'])))
          .orderBy(desc(s.events.starts_at))
          .limit(rules.REPORT_FORM_EVENTS)
      : [];
    const offered: ReportFormMeta['events'] = [];
    for (const e of events) {
      const supervisors = await db
        .select(publicUser)
        .from(s.event_organizers)
        .innerJoin(s.users, eq(s.users.id, s.event_organizers.user_id))
        .where(and(eq(s.event_organizers.event_id, e.id), isNull(s.users.deleted_at)));
      const participants = (await joinedUsers(db, e.id)).filter((u) => !supervisors.some((x) => x.id === u.id));
      offered.push({
        event: { id: e.id, title: e.title, starts_at: e.starts_at.toISOString(), ends_at: e.ends_at.toISOString() },
        people: [
          ...supervisors.map((u) => ({ user: u, supervisor: true })),
          ...participants.map((u) => ({ user: u, supervisor: false })),
        ]
          .filter((p) => p.user.id !== me.id)
          .map((p) => ({ ...p, user: shownTo(me, p.user) })),
      });
    }
    return c.json<ReportFormMeta>({
      categories: REPORT_CATEGORIES,
      events: offered,
      open: await openReports(db, me.id),
      max_open: rules.MAX_OPEN_REPORTS,
    });
  })

  .post('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, reportBody);
    const note = rules.cleanText(body.note);
    const subjectId = body.subject_id ?? null;
    const t = now();
    const id = newId();
    await db.transaction(async (tx) => {
      // Locking the person makes two reports sent at once count each other.
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, me.id)).for('update');
      const event = body.event_id ? await findEvent(tx, body.event_id) : null;
      rules.assertCanReport({
        user: me,
        level: await levelOf(tx, me.id),
        category: body.category,
        note,
        event: event && {
          reporterWasThere: await wasAtEvent(tx, event.id, me.id),
          subjectWasThere: !!subjectId && (await wasAtEvent(tx, event.id, subjectId)),
        },
        subjectId,
        openCount: await openReports(tx, me.id),
      });
      await tx.insert(s.reports).values({
        id,
        reporter_id: me.id,
        category: body.category,
        event_id: event?.id ?? null,
        subject_id: subjectId,
        note,
        status: 'open',
        created_at: new Date(t),
      });
    });
    const [row] = await db.select().from(s.reports).where(eq(s.reports.id, id));
    const [mine] = await asMyReports(db, me, [iso(row)]);
    return c.json<MyReport>(mine, 201);
  });

export const warningRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/:id', async (c) => {
    const { db } = c.var.deps;
    const w = await warningById(db, c.req.param('id'));
    if (!w) throw new ApiError('not_found');
    if (w.user_id !== c.var.user.id) throw new ApiError('not_your_warning');
    const [mine] = await asMyWarnings(db, c.var.user, [w]);
    return c.json<MyWarning>(mine);
  })

  // Once, while the warning is active. An admin then keeps it or withdraws it.
  .post('/:id/appeal', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const reason = rules.cleanText((await readBody(c, appealBody)).reason);
    const warning = await db.transaction(async (tx) => {
      const w = await warningById(tx, id, { lock: true });
      rules.assertCanAppeal(w, me.id, reason);
      await tx.update(s.warnings).set({ status: 'appealed', appealed_at: new Date(now()), appeal_reason: reason }).where(eq(s.warnings.id, id));
      return (await warningById(tx, id))!;
    });
    const [mine] = await asMyWarnings(db, me, [warning]);
    return c.json<MyWarning>(mine);
  });
