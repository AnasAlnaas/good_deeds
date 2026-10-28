// Events, proposing one in the app (and the proposer editing or withdrawing it
// while it waits for an admin), joining (with the terms one by one) and
// the supervisor's roster, where they record attendance and give warnings.
// Every change runs in a transaction: the rows are read (and locked), the
// shared rule decides, and the result is written, or nothing is.

import { and, asc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type {
  AcceptTermResponse,
  AttendanceResponse,
  EventDetail,
  EventFormMeta,
  EventSummary,
  ProposeEventResponse,
  RegistrationResponse,
  RosterResponse,
  WarningResponse,
} from '../../../shared/api';
import { classOf, eventSubtypes } from '../../../shared/classes';
import { ApiError } from '../../../shared/errors';
import { BASE_POINTS_BY_SUBTYPE } from '../../../shared/placeholders';
import * as rules from '../../../shared/rules';
import { type AppEvent, type Registration, type User } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import {
  acceptedTermIds,
  activeBranches,
  attendanceOf,
  findEvent,
  findEventFor,
  isOrganizer,
  joinedCounts,
  joinedUsers,
  levelOf,
  newId,
  registrationOf,
  shownTo,
  termsOf,
  waitingProposals,
  warnedBy,
} from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';
import { notifyHoursToConfirm, notifyWarningGiven } from '../notify';
import { assertIdsExist, proposalInput, writeLinks, writeTerms } from './event-input';

const recordTimeBody = z.object({ at: z.iso.datetime({ offset: true }).optional() });
// An empty reason is the rule's to refuse (reason_required), as in the offline demo.
const warnBody = z.object({ reason: z.string().max(rules.REASON_MAX) });

async function summarize(db: Database, me: User, events: AppEvent[], now: number): Promise<EventSummary[]> {
  const ids = events.map((e) => e.id);
  if (ids.length === 0) return [];
  const counts = await joinedCounts(db, ids);
  const mine = await db
    .select({ event_id: s.registrations.event_id, status: s.registrations.status })
    .from(s.registrations)
    .where(and(eq(s.registrations.user_id, me.id), inArray(s.registrations.event_id, ids)));
  const organized = await db
    .select({ event_id: s.event_organizers.event_id })
    .from(s.event_organizers)
    .where(and(eq(s.event_organizers.user_id, me.id), inArray(s.event_organizers.event_id, ids)));
  const myStatus = new Map(mine.map((r) => [r.event_id, r.status]));
  const iOrganize = new Set(organized.map((r) => r.event_id));

  return events.map((e) => {
    const { description, status, terms_locked_at, created_by, created_at, ...shown } = e;
    return {
      ...shown,
      status: rules.effectiveStatus(e, now),
      joined_count: counts.get(e.id) ?? 0,
      event_class: classOf(e.subtype),
      can_join_category: rules.canUserJoinCategory(me, e),
      my_registration_status: myStatus.get(e.id) ?? null,
      i_organize: iOrganize.has(e.id),
      i_created: e.created_by === me.id,
    };
  });
}

export const eventRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    // Drafts and turned-down drafts: only their creator sees them.
    const visible = or(notInArray(s.events.status, ['draft', 'rejected']), eq(s.events.created_by, me.id));
    const rows = await db.select().from(s.events).where(visible).orderBy(asc(s.events.starts_at));
    return c.json<EventSummary[]>(await summarize(db, me, rows.map(iso), now()));
  })

  // ---------- proposing an event (before /:id, which would take "form" for an id) ----------

  .get('/form', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    if (!rules.canCreateEvents(me, await levelOf(db, me.id))) throw new ApiError('cannot_create_events');
    return c.json<EventFormMeta>({
      branches: await activeBranches(db),
      subtypes: eventSubtypes(),
      publishes_directly: rules.proposalStatus(me) === 'published',
      waiting: await waitingProposals(db, me.id),
      max_waiting: rules.MAX_WAITING_PROPOSALS,
    });
  })

  .post('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, proposalInput);
    const t = now();
    const id = newId();
    const status = rules.proposalStatus(me);
    await db.transaction(async (tx) => {
      // Locking the person makes two proposals sent at once count each other.
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, me.id)).for('update');
      rules.assertCanProposeEvent({
        user: me,
        level: await levelOf(tx, me.id),
        event: body,
        waitingCount: await waitingProposals(tx, me.id),
        now: t,
      });
      const { branchIds } = await assertIdsExist(tx, { branch_ids: body.branch_ids, organizer_ids: [] });
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
        status,
        created_by: me.id,
        created_at: new Date(t),
      });
      // Whoever proposes an event supervises it; an admin can add others from the panel.
      await writeLinks(tx, id, branchIds, [me.id]);
      await writeTerms(tx, id, body.terms, new Date(t));
    });
    return c.json<ProposeEventResponse>({ id, status }, 201);
  })

  // ---------- the proposer's own event, while it waits for an admin ----------

  // The same form and checks as proposing it. The supervisors stay as they are (an admin may have added some).
  .put('/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, proposalInput);
    const t = now();
    await db.transaction(async (tx) => {
      // Locking the event makes an admin's decision on it wait for this edit, or this edit see the decision.
      const [row] = await tx.select().from(s.events).where(eq(s.events.id, id)).for('update');
      rules.assertCanChangeProposal(me, row);
      rules.assertCanProposeEvent({
        user: me,
        level: await levelOf(tx, me.id),
        event: body,
        // This draft is one of those waiting; editing it adds none.
        waitingCount: (await waitingProposals(tx, me.id)) - 1,
        now: t,
      });
      const { branchIds } = await assertIdsExist(tx, { branch_ids: body.branch_ids, organizer_ids: [] });
      const organizers = await tx
        .select({ user_id: s.event_organizers.user_id })
        .from(s.event_organizers)
        .where(eq(s.event_organizers.event_id, id));
      await tx
        .update(s.events)
        .set({
          title: body.title,
          description: body.description,
          subtype: body.subtype,
          lat: body.lat,
          lng: body.lng,
          address_text: body.address_text,
          starts_at: new Date(body.starts_at),
          ends_at: new Date(body.ends_at),
          capacity: body.capacity,
          gender_category: body.gender_category,
          base_points: BASE_POINTS_BY_SUBTYPE[body.subtype],
        })
        .where(eq(s.events.id, id));
      await writeLinks(tx, id, branchIds, organizers.map((o) => o.user_id));
      // Nobody can join a draft, so nobody has accepted its terms yet.
      await writeTerms(tx, id, body.terms, new Date(t));
    });
    return c.json<ProposeEventResponse>({ id, status: 'draft' });
  })

  // Withdrawn: the draft is deleted, with its own rows (branches, supervisors, terms).
  // Nothing else can point at a draft: nobody can join it or be at it (findEvent
  // hides it), so it has no registrations, attendance, points, reports or warnings;
  // should anything ever, its foreign key refuses the delete and nothing changes.
  // Marking it 'rejected' instead would tell its proposer "not approved", and
  // admins of a decision nobody made. An admin's earlier edit of it stays in the
  // audit log under its title (admin_actions.target_id is not a foreign key).
  .delete('/:id', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(s.events).where(eq(s.events.id, id)).for('update');
      rules.assertCanChangeProposal(me, row);
      await tx.delete(s.event_terms).where(eq(s.event_terms.event_id, id));
      await tx.delete(s.event_branches).where(eq(s.event_branches.event_id, id));
      await tx.delete(s.event_organizers).where(eq(s.event_organizers.event_id, id));
      await tx.delete(s.events).where(eq(s.events.id, id));
    });
    return c.body(null, 204);
  })

  .get('/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const event = await findEventFor(db, id, me);
    const [summary] = await summarize(db, me, [event], now());
    const branches = await db
      .select({ branch: s.branches })
      .from(s.event_branches)
      .innerJoin(s.branches, eq(s.branches.id, s.event_branches.branch_id))
      .where(eq(s.event_branches.event_id, id));
    const registration = await registrationOf(db, id, me.id);
    return c.json<EventDetail>({
      ...summary,
      description: event.description,
      terms_locked_at: event.terms_locked_at,
      branches: branches.map((r) => r.branch),
      terms: await termsOf(db, id),
      participants: (await joinedUsers(db, id)).map((u) => shownTo(me, u)),
      my_registration: registration ?? null,
      my_accepted_term_ids: await acceptedTermIds(db, registration?.id),
      my_attendance: (await attendanceOf(db, id, me.id)) ?? null,
    });
  })

  // ---------- joining ----------

  .post('/:id/join', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const t = now();
    const registration = await db.transaction(async (tx) => {
      const event = await findEvent(tx, id);
      const existing = await registrationOf(tx, id, me.id, { lock: true });
      const action = rules.decideStartJoin({ user: me, event, registration: existing, now: t });
      if (action === 'reopen') {
        await tx.update(s.registrations).set({ status: 'pending_terms' }).where(eq(s.registrations.id, existing!.id));
      } else if (action === 'create') {
        await tx
          .insert(s.registrations)
          .values({ id: newId(), event_id: id, user_id: me.id, status: 'pending_terms', created_at: new Date(t) })
          .onConflictDoNothing();
      }
      return (await registrationOf(tx, id, me.id))!;
    });
    return c.json<RegistrationResponse>({ registration });
  })

  .post('/:id/terms/:termId/accept', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const { id, termId } = c.req.param();
    const t = now();
    const result = await db.transaction(async (tx) => {
      await findEvent(tx, id);
      const registration = await registrationOf(tx, id, me.id, { lock: true });
      const accepted = await acceptedTermIds(tx, registration?.id);
      const action = rules.decideAcceptTerm({ registration, terms: await termsOf(tx, id), acceptedTermIds: accepted, termId });
      if (action === 'accept') {
        await tx.insert(s.term_acceptances).values({ id: newId(), registration_id: registration!.id, term_id: termId, accepted_at: new Date(t) });
        // Nobody may agree to a text that later changes: the terms lock at the first acceptance.
        await tx
          .update(s.events)
          .set({ terms_locked_at: new Date(t) })
          .where(and(eq(s.events.id, id), isNull(s.events.terms_locked_at)));
        accepted.push(termId);
      }
      return { registration: registration!, accepted_term_ids: accepted };
    });
    return c.json<AcceptTermResponse>(result);
  })

  .post('/:id/join/complete', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const t = now();
    const registration = await db.transaction(async (tx) => {
      // Locking the event makes joins to it wait in line, so the seat count is exact.
      const event = await findEvent(tx, id, { lock: true });
      const reg = await registrationOf(tx, id, me.id, { lock: true });
      rules.assertCompleteJoin({
        user: me,
        event,
        registration: reg,
        terms: await termsOf(tx, id),
        acceptedTermIds: await acceptedTermIds(tx, reg?.id),
        joinedCount: (await joinedCounts(tx, [id])).get(id) ?? 0,
        now: t,
      });
      const [row] = await tx
        .update(s.registrations)
        .set({ status: 'joined', joined_at: new Date(t) })
        .where(eq(s.registrations.id, reg!.id))
        .returning();
      return iso(row) as Registration;
    });
    return c.json<RegistrationResponse>({ registration });
  })

  .delete('/:id/join', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const registration = await db.transaction(async (tx) => {
      await findEvent(tx, id);
      const reg = await registrationOf(tx, id, me.id, { lock: true });
      rules.assertCancelJoin({ registration: reg, hasAttendance: !!(await attendanceOf(tx, id, me.id)) });
      const [row] = await tx.update(s.registrations).set({ status: 'cancelled' }).where(eq(s.registrations.id, reg!.id)).returning();
      return iso(row) as Registration;
    });
    return c.json<RegistrationResponse>({ registration });
  })

  // ---------- the supervisor's roster ----------

  .get('/:id/roster', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const event = await findEvent(db, id);
    if (!(await isOrganizer(db, id, me.id))) throw new ApiError('not_organizer');
    const [summary] = await summarize(db, me, [event], now());
    const people = await joinedUsers(db, id);
    const rows = await db.select().from(s.attendance).where(eq(s.attendance.event_id, id));
    const byUser = new Map(rows.map((r) => [r.user_id, iso(r)]));
    const warned = await warnedBy(db, id, me.id);
    return c.json<RosterResponse>({
      event: summary,
      participants: people.map((user) => ({
        user: shownTo(me, user),
        attendance: byUser.get(user.id) ?? null,
        i_warned: warned.has(user.id),
      })),
    });
  })

  // A supervisor of this event warns someone who joined it. Only that member and admins see it.
  .post('/:id/warnings/:userId', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const { id, userId } = c.req.param();
    const reason = rules.cleanText((await readBody(c, warnBody)).reason);
    const t = now();
    const warning = await db.transaction(async (tx) => {
      const event = await findEvent(tx, id);
      // Locking the registration makes a second tap wait, so it finds the first warning.
      const registration = await registrationOf(tx, id, userId, { lock: true });
      rules.assertCanWarn({
        actorId: me.id,
        memberId: userId,
        actorIsOrganizer: await isOrganizer(tx, id, me.id),
        event,
        registration,
        alreadyWarned: (await warnedBy(tx, id, me.id)).has(userId),
        reason,
        now: t,
      });
      const [row] = await tx
        .insert(s.warnings)
        .values({ id: newId(), user_id: userId, issued_by: me.id, event_id: id, reason: reason!, status: 'active', created_at: new Date(t) })
        .returning();
      return iso(row);
    });
    notifyWarningGiven(c.var.deps, warning.id);
    return c.json<WarningResponse>({ warning }, 201);
  })

  .post('/:id/attendance/:userId/start', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const { id, userId } = c.req.param();
    const body = await readBody(c, recordTimeBody);
    const t = now();
    const attendance = await db.transaction(async (tx) => {
      // Locking the event makes an admin cancelling it wait for this start, or this start see the cancellation.
      const event = await findEvent(tx, id, { lock: true });
      const registration = await registrationOf(tx, id, userId, { lock: true });
      const start = rules.decideRecordStart({
        actorId: me.id,
        participantId: userId,
        actorIsOrganizer: await isOrganizer(tx, id, me.id),
        event,
        registration,
        attendance: await attendanceOf(tx, id, userId),
        startedAt: body.at ? Date.parse(body.at) : undefined,
        now: t,
      });
      await tx.insert(s.attendance).values({
        id: newId(),
        event_id: id,
        user_id: userId,
        started_at: new Date(start.started_at),
        start_source: start.start_source,
        recorded_by: me.id,
        recorded_at: new Date(t),
      });
      return (await attendanceOf(tx, id, userId))!;
    });
    return c.json<AttendanceResponse>({ attendance });
  })

  .post('/:id/attendance/:userId/end', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const { id, userId } = c.req.param();
    const body = await readBody(c, recordTimeBody);
    const t = now();
    const attendance = await db.transaction(async (tx) => {
      const event = await findEvent(tx, id);
      const current = await attendanceOf(tx, id, userId, { lock: true });
      const end = rules.decideRecordEnd({
        actorId: me.id,
        participantId: userId,
        actorIsOrganizer: await isOrganizer(tx, id, me.id),
        event,
        attendance: current,
        endedAt: body.at ? Date.parse(body.at) : undefined,
        now: t,
      });
      await tx
        .update(s.attendance)
        .set({ ended_at: new Date(end.ended_at!), end_source: end.end_source, hours: end.hours })
        .where(eq(s.attendance.id, current!.id));
      return (await attendanceOf(tx, id, userId))!;
    });
    notifyHoursToConfirm(c.var.deps, [attendance.id], 'recorded');
    return c.json<AttendanceResponse>({ attendance });
  });
