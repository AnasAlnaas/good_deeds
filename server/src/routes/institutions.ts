// Institutions (جمعية، مؤسسة، مدرسة…), as members see them in the app
// (owner's decisions, 2026-11-17; shared/types.ts Institution): asking for a
// new one (an admin approves it in the panel, routes/admin.ts), asking to
// belong to one, leaving it, and its representatives confirming who belongs.
// Every change runs in a transaction: the rows are read (and locked), the
// shared rule decides, and the result is written, or nothing is.

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { InstitutionHoursReport, InstitutionMembersResponse, InstitutionPublic, InstitutionsResponse, MyInstitution, OutsideHoursItem } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import type { InstitutionKind, User } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { creditPoints, findInstitution, membershipOf, membershipsCount, newId, publicUser, shownTo } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';
import { notifyJoinRequest, notifyMembershipConfirmed, notifyOutsideHoursDecided } from '../notify';
import { findClaim, outsideHoursItems } from './outside-hours';
import { isFollowing } from './follows';

// The name and kind are the rule's to check (rules.assertCanRequestInstitution), as in the offline demo.
const decideBody = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(rules.OUTSIDE_HOURS_NOTE_MAX + 100).optional() });
const reportQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const requestBody = z.object({ name: z.string().max(rules.INSTITUTION_NAME_MAX + 50), kind: z.string().max(40) });

/** The person's institutions, as GET /api/institutions lists them. */
async function myInstitutions(db: Database, userId: string): Promise<MyInstitution[]> {
  const rows = await db
    .select({ m: s.institution_members, i: s.institutions })
    .from(s.institution_members)
    .innerJoin(s.institutions, eq(s.institutions.id, s.institution_members.institution_id))
    .where(eq(s.institution_members.user_id, userId))
    .orderBy(asc(s.institutions.name));
  const out: MyInstitution[] = [];
  for (const { m, i } of rows) {
    let pending = 0;
    if (rules.isRepresentative(m)) {
      const [row] = await db
        .select({ n: count() })
        .from(s.institution_members)
        .where(and(eq(s.institution_members.institution_id, i.id), eq(s.institution_members.status, 'pending')));
      pending = row.n;
    }
    let pendingHours = 0;
    if (rules.isRepresentative(m)) {
      const [row] = await db
        .select({ n: count() })
        .from(s.outside_hours)
        .where(and(eq(s.outside_hours.institution_id, i.id), eq(s.outside_hours.status, 'pending')));
      pendingHours = row.n;
    }
    out.push({
      institution: { id: i.id, name: i.name, kind: i.kind, status: i.status, decision_note: i.decision_note },
      role: m.role,
      status: m.status,
      pending_members: pending,
      pending_hours: pendingHours,
    });
  }
  return out;
}

async function myInstitution(db: Database, userId: string, institutionId: string) {
  return (await myInstitutions(db, userId)).find((x) => x.institution.id === institutionId)!;
}

/** Who belongs to the institution, for its representatives (and admins). */
async function membersOf(db: Database, viewer: User, institutionId: string): Promise<InstitutionMembersResponse> {
  const institution = (await findInstitution(db, institutionId))!;
  const rows = await db
    .select({ m: s.institution_members, ...publicUser })
    .from(s.institution_members)
    .innerJoin(s.users, eq(s.users.id, s.institution_members.user_id))
    .where(and(eq(s.institution_members.institution_id, institutionId), isNull(s.users.deleted_at)));
  const order = (r: (typeof rows)[number]) => (r.m.status === 'pending' ? 0 : 1);
  rows.sort((a, b) => order(a) - order(b) || (order(a) === 0 ? a.m.created_at.getTime() - b.m.created_at.getTime() : a.full_name.localeCompare(b.full_name, 'ar')));
  return {
    institution: { id: institution.id, name: institution.name, kind: institution.kind, status: institution.status },
    members: rows.map((r) => ({
      user: shownTo(viewer, { id: r.id, full_name: r.full_name, avatar_url: r.avatar_url, gender: r.gender }),
      role: r.m.role,
      status: r.m.status,
      created_at: r.m.created_at.toISOString(),
    })),
  };
}

/** Only its representatives (and admins) see who belongs to it; anyone else is told it is not there. */
async function assertMayManage(db: Database, me: User, institutionId: string) {
  const institution = await findInstitution(db, institutionId);
  if (!institution) throw new ApiError('not_found');
  if (me.role !== 'admin' && !rules.isRepresentative(await membershipOf(db, institutionId, me.id))) throw new ApiError('not_representative');
}

export const institutionRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const directory = await db
      .select({ id: s.institutions.id, name: s.institutions.name, kind: s.institutions.kind })
      .from(s.institutions)
      .where(eq(s.institutions.status, 'approved'))
      .orderBy(asc(s.institutions.name));
    const [waiting] = await db
      .select({ n: count() })
      .from(s.institutions)
      .where(and(eq(s.institutions.requested_by, me.id), eq(s.institutions.status, 'pending')));
    return c.json<InstitutionsResponse>({
      mine: await myInstitutions(db, me.id),
      directory,
      waiting_requests: waiting.n,
      max_waiting_requests: rules.MAX_INSTITUTION_REQUESTS,
    });
  })

  // Asking for a new institution: it waits for an admin, and whoever asked is its first representative.
  .post('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, requestBody);
    const name = rules.cleanInstitutionName(body.name);
    const t = new Date(now());
    const id = newId();
    await db.transaction(async (tx) => {
      // Locking the person makes two requests sent at once count each other.
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, me.id)).for('update');
      const existing = await tx.select({ name: s.institutions.name, status: s.institutions.status }).from(s.institutions).where(ne(s.institutions.status, 'rejected'));
      const [waiting] = await tx
        .select({ n: count() })
        .from(s.institutions)
        .where(and(eq(s.institutions.requested_by, me.id), eq(s.institutions.status, 'pending')));
      rules.assertCanRequestInstitution({ name, kind: body.kind, existing, waitingCount: waiting.n, membershipsCount: await membershipsCount(tx, me.id) });
      await tx.insert(s.institutions).values({ id, name: name!, kind: body.kind as InstitutionKind, status: 'pending', requested_by: me.id, created_at: t });
      await tx.insert(s.institution_members).values({ institution_id: id, user_id: me.id, role: 'representative', status: 'confirmed', created_at: t, confirmed_at: t });
    });
    return c.json<MyInstitution>(await myInstitution(db, me.id, id), 201);
  })

  // Asking to belong: one of its representatives confirms it.
  .post('/:id/join', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const t = new Date(now());
    await db.transaction(async (tx) => {
      await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, me.id)).for('update');
      rules.assertCanAskToJoin({
        institution: await findInstitution(tx, id),
        membership: await membershipOf(tx, id, me.id),
        membershipsCount: await membershipsCount(tx, me.id),
      });
      await tx.insert(s.institution_members).values({ institution_id: id, user_id: me.id, role: 'member', status: 'pending', created_at: t });
    });
    notifyJoinRequest(c.var.deps, id, me.id);
    return c.json<MyInstitution>(await myInstitution(db, me.id, id), 201);
  })

  // Leaving it, or taking a request back.
  .delete('/:id/membership', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await db.transaction(async (tx) => {
      rules.assertCanLeaveInstitution(await membershipOf(tx, id, me.id, { lock: true }), await findInstitution(tx, id));
      await tx.delete(s.institution_members).where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.user_id, me.id)));
    });
    return c.body(null, 204);
  })

  // An approved institution as anyone sees it, to follow it (owner's decisions, 2026-11-21).
  .get('/:id/public', async (c) => {
    const { db } = c.var.deps;
    const institution = await findInstitution(db, c.req.param('id'));
    if (!institution || institution.status !== 'approved') throw new ApiError('not_found');
    return c.json<InstitutionPublic>({
      institution: { id: institution.id, name: institution.name, kind: institution.kind },
      following: await isFollowing(db, c.var.user.id, 'institution', institution.id),
    });
  })

  // ---------- its representatives ----------

  .get('/:id/members', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await assertMayManage(db, me, id);
    return c.json<InstitutionMembersResponse>(await membersOf(db, me, id));
  })

  .post('/:id/members/:userId/confirm', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    const confirmed = await db.transaction(async (tx) => {
      const member = await membershipOf(tx, id, userId, { lock: true });
      rules.assertCanManageMember({ user: me, mine: await membershipOf(tx, id, me.id), member });
      if (member!.status === 'confirmed') return false;
      await tx
        .update(s.institution_members)
        .set({ status: 'confirmed', confirmed_by: me.id, confirmed_at: new Date(now()) })
        .where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.user_id, userId)));
      return true;
    });
    if (confirmed) notifyMembershipConfirmed(c.var.deps, id, userId);
    return c.json<InstitutionMembersResponse>(await membersOf(db, me, id));
  })

  // Turning a request down, or taking a member off.
  .delete('/:id/members/:userId', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    await db.transaction(async (tx) => {
      rules.assertCanManageMember({ user: me, mine: await membershipOf(tx, id, me.id), member: await membershipOf(tx, id, userId, { lock: true }) });
      await tx.delete(s.institution_members).where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.user_id, userId)));
    });
    return c.json<InstitutionMembersResponse>(await membersOf(db, me, id));
  })

  // ---------- hours outside the app's events, for its representatives ----------

  // Waiting first (oldest first), then the decided ones (newest first).
  .get('/:id/outside-hours', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await assertMayManage(db, me, id);
    const rows = (await db.select().from(s.outside_hours).where(eq(s.outside_hours.institution_id, id)).orderBy(desc(s.outside_hours.created_at)).limit(200)).map(iso);
    const waiting = rows.filter((r) => r.status === 'pending').reverse();
    return c.json<OutsideHoursItem[]>(await outsideHoursItems(db, me, [...waiting, ...rows.filter((r) => r.status !== 'pending')]));
  })

  .post('/:id/outside-hours/:claimId/decide', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, decideBody);
    const claimId = c.req.param('claimId');
    const t = new Date(now());
    await db.transaction(async (tx) => {
      const claim = await findClaim(tx, claimId, { lock: true });
      const note = rules.assertCanDecideOutsideHours({
        user: me,
        mine: await membershipOf(tx, id, me.id),
        claim: claim?.institution_id === id ? claim : undefined,
        decision: body.decision,
        note: body.note,
      });
      await tx.update(s.outside_hours).set({ status: body.decision, decided_by: me.id, decided_at: t, decision_note: note }).where(eq(s.outside_hours.id, claimId));
      if (body.decision === 'approved') {
        await creditPoints(tx, { userId: claim!.user_id, eventId: null, outsideHoursId: claimId, earned: rules.pointsForOutsideHours(claim!), reason: 'outside_hours_approved', at: t });
      }
    });
    notifyOutsideHoursDecided(c.var.deps, claimId);
    return c.json<OutsideHoursItem>((await outsideHoursItems(db, me, [(await findClaim(db, claimId))!]))[0]);
  })

  // Its members' confirmed hours between two days: at its own events, and outside them for it.
  .get('/:id/hours-report', async (c) => {
    const { db, timeZone } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await assertMayManage(db, me, id);
    const q = reportQuery.safeParse(c.req.query());
    if (!q.success) throw new ApiError('not_found');
    const { from, to } = q.data;
    const institution = (await findInstitution(db, id))!;
    const members = await db
      .select(publicUser)
      .from(s.institution_members)
      .innerJoin(s.users, eq(s.users.id, s.institution_members.user_id))
      .where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.status, 'confirmed'), isNull(s.users.deleted_at)));
    const ids = members.map((m) => m.id);
    const attended = ids.length
      ? await db
          .select({ user_id: s.attendance.user_id, event_id: s.attendance.event_id, hours: s.attendance.hours, started_at: s.attendance.started_at })
          .from(s.attendance)
          .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
          .where(and(inArray(s.attendance.user_id, ids), eq(s.events.institution_id, id), eq(s.attendance.participant_status, 'confirmed')))
      : [];
    const outside = ids.length
      ? await db
          .select({ user_id: s.outside_hours.user_id, minutes: s.outside_hours.minutes })
          .from(s.outside_hours)
          .where(and(inArray(s.outside_hours.user_id, ids), eq(s.outside_hours.institution_id, id), eq(s.outside_hours.status, 'approved'), gte(s.outside_hours.done_on, from), lte(s.outside_hours.done_on, to)))
      : [];
    const inRange = attended.filter((a) => {
      const d = rules.dayIn(a.started_at.getTime(), timeZone);
      return d >= from && d <= to;
    });
    const rows = members
      .map((user) => {
        const mine = inRange.filter((a) => a.user_id === user.id);
        const eventHours = rules.round2(mine.reduce((sum, a) => sum + (a.hours ?? 0), 0));
        const outsideHours = rules.round2(outside.filter((o) => o.user_id === user.id).reduce((sum, o) => sum + o.minutes, 0) / 60);
        return { user: shownTo(me, user), events: new Set(mine.map((a) => a.event_id)).size, event_hours: eventHours, outside_hours: outsideHours, hours: rules.round2(eventHours + outsideHours) };
      })
      .sort((a, b) => b.hours - a.hours || a.user.full_name.localeCompare(b.user.full_name, 'ar'));
    return c.json<InstitutionHoursReport>({ institution: { id: institution.id, name: institution.name, kind: institution.kind }, from, to, rows });
  });
