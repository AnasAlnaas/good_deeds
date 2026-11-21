// The admin panel's endpoints (/api/admin/…). Admins only. Every change runs
// in a transaction with its audit row, so a decision and its record of who
// made it land together or not at all.

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import type {
  AdminEventDetail,
  AdminEventRow,
  AdminInstitutionRow,
  AdminMeta,
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  AdminWarningRow,
  AuditEntry,
  DisputeRow,
  AdminHijriMonth,
  AdminHoursStats,
  HoursReportRow,
  ResetCodeResponse,
} from '../../../shared/admin-api';
import * as adminRules from '../../../shared/admin-rules';
import { eventSubtypes } from '../../../shared/classes';
import { AdminError, ApiError } from '../../../shared/errors';
import type { AdminSkillRow } from '../../../shared/api';
import { HIJRI_ADJUST_MAX, hijriMonths } from '../../../shared/hijri';
import * as rules from '../../../shared/rules';
import { SKILL_NAME_MAX } from '../../../shared/skills';
import { promotedTags } from '../../../shared/tags';
import { type AppEvent, type Attendance } from '../../../shared/types';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import {
  creditPoints,
  findInstitution,
  institutionApproved,
  institutionRefs,
  joinedCounts,
  lessonImageRefs,
  membershipOf,
  newId,
  publicUser,
  warningById,
} from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, HttpError, readBody } from '../http';
import {
  notifyDisputeSettled,
  notifyEventCancelled,
  notifyCoverRemoved,
  notifyEventChanged,
  notifyInstitutionDecided,
  notifyPlaceOffered,
  notifyRepresentativeAdded,
  notifyPhotoRemoved,
  notifyProposalDecided,
  notifyReportHandled,
  notifyWarningDecided, notifyFollowers } from '../notify';
import { issueResetCode } from './auth';
import { fillOpenPlaces } from '../waitlist';
import { assertCoverExists, assertIdsExist, createEventInput, eventInput, isoTime, kindOf, placeOf, writeLessons, writeLinks, writeTerms, writeSkills } from './event-input';
import { dropUnusedImages } from '../lesson-images';

const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.role !== 'admin') throw new AdminError('forbidden');
  await next();
});

// ---------- request bodies ----------

const roleBody = z.object({ role: z.enum(['member', 'supervisor', 'admin']) });
const statusBody = z.object({ note: z.string().trim().max(500).optional() });
const resolveBody = z.object({
  decision: z.enum(['accept', 'correct', 'reject']),
  hours: z.number().optional(),
  note: z.string().trim().min(1).max(500),
});
const handleReportBody = z.object({ note: z.string().trim().min(1).max(500) });
const decideWarningBody = z.object({ decision: z.enum(['uphold', 'withdraw']), note: z.string().trim().min(1).max(500) });
const reportQuery = z.object({ status: z.enum(['open', 'handled']).optional() });
const institutionQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() });
const addRepresentativeBody = z.object({ phone: z.string().max(40) });
const warningQuery = z.object({ status: z.enum(['active', 'appealed', 'upheld', 'withdrawn']).optional(), user_id: z.string().min(1).optional() });

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

/** Who made each event: an admin in the panel, or someone else in the app. */
async function creatorsOf(q: Database, events: Pick<AppEvent, 'created_by'>[]) {
  const ids = [...new Set(events.map((e) => e.created_by))];
  const rows = ids.length
    ? await q.select({ ...publicUser, role: s.users.role, level: s.users.level }).from(s.users).where(inArray(s.users.id, ids))
    : [];
  return new Map(rows.map((r) => [r.id, { ...toPublic(r), role: r.role, level: r.level }]));
}

/** An event is put in an institution's name only if an admin approved the institution. */
async function assertInstitutionApproved(q: Database, institutionId: string | null | undefined) {
  if (!institutionId) return;
  const institution = await findInstitution(q, institutionId);
  if (!institution || institution.status !== 'approved') throw new AdminError('institution_not_approved');
}

async function hasAttendance(q: Database, eventId: string) {
  const [row] = await q.select({ n: count() }).from(s.attendance).where(eq(s.attendance.event_id, eventId));
  return row.n > 0;
}

async function lessonsWithCounts(q: Database, eventId: string) {
  const rows = await q.select().from(s.event_lessons).where(eq(s.event_lessons.event_id, eventId)).orderBy(asc(s.event_lessons.order_index));
  const counts = rows.length
    ? await q
        .select({ lesson_id: s.lesson_completions.lesson_id, n: count() })
        .from(s.lesson_completions)
        .where(inArray(s.lesson_completions.lesson_id, rows.map((r) => r.id)))
        .groupBy(s.lesson_completions.lesson_id)
    : [];
  const images = await lessonImageRefs(q, rows);
  return rows.map((r) => ({
    ...iso(r),
    image: (r.image_id && images.get(r.image_id)) || null,
    learned_count: counts.find((x) => x.lesson_id === r.id)?.n ?? 0,
  }));
}

async function termTexts(q: Database, eventId: string) {
  const rows = await q.select().from(s.event_terms).where(eq(s.event_terms.event_id, eventId)).orderBy(asc(s.event_terms.order_index));
  return rows.map((r) => r.text ?? '');
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** The people and events that reports and warnings point at, looked up once for a whole list. */
async function lookup(q: Database, userIds: (string | null)[], eventIds: (string | null)[]) {
  const uIds = [...new Set(userIds.filter((x): x is string => !!x))];
  const eIds = [...new Set(eventIds.filter((x): x is string => !!x))];
  const people = uIds.length ? await q.select({ ...publicUser, phone: s.users.phone }).from(s.users).where(inArray(s.users.id, uIds)) : [];
  const events = eIds.length
    ? await q.select({ id: s.events.id, title: s.events.title, starts_at: s.events.starts_at }).from(s.events).where(inArray(s.events.id, eIds))
    : [];
  return {
    withPhone: (id: string | null) => {
      const p = people.find((u) => u.id === id);
      return p ? { ...toPublic(p), phone: p.phone } : null;
    },
    person: (id: string | null) => {
      const p = people.find((u) => u.id === id);
      return p ? toPublic(p) : null;
    },
    event: (id: string | null) => {
      const e = events.find((x) => x.id === id);
      return e ? { id: e.id, title: e.title, starts_at: e.starts_at.toISOString() } : null;
    },
  };
}

// ---------- routes ----------

const skillBody = z.object({ name_ar: z.string().trim().min(2).max(SKILL_NAME_MAX), name_en: z.string().max(SKILL_NAME_MAX).default('') });
const skillEditBody = z.object({ name_ar: z.string().max(SKILL_NAME_MAX).optional(), name_en: z.string().max(SKILL_NAME_MAX).optional(), is_active: z.boolean().optional() });

/** The skills, offered first, with how many people and events chose each. */
async function adminSkills(db: Database): Promise<AdminSkillRow[]> {
  const rows = await db.select().from(s.skills).orderBy(s.skills.created_at, s.skills.id);
  const people = await db.select({ id: s.user_skills.skill_id }).from(s.user_skills);
  const events = await db.select({ id: s.event_skills.skill_id }).from(s.event_skills);
  return rows
    .map((r) => ({
      id: r.id,
      name_ar: r.name_ar,
      name_en: r.name_en,
      is_active: r.is_active,
      people: people.filter((p) => p.id === r.id).length,
      events: events.filter((e) => e.id === r.id).length,
    }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));
}

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
    const [proposals] = await db
      .select({ n: count() })
      .from(s.events)
      .innerJoin(s.users, eq(s.users.id, s.events.created_by))
      .where(and(eq(s.events.status, 'draft'), ne(s.users.role, 'admin')));
    const [reports] = await db.select({ n: count() }).from(s.reports).where(eq(s.reports.status, 'open'));
    const [appeals] = await db.select({ n: count() }).from(s.warnings).where(eq(s.warnings.status, 'appealed'));
    const [institutionsWaiting] = await db.select({ n: count() }).from(s.institutions).where(eq(s.institutions.status, 'pending'));
    return c.json<AdminOverview>({
      users: users.n,
      upcoming_events: statuses.filter((x) => x === 'published').length,
      running_events: statuses.filter((x) => x === 'running').length,
      draft_events: statuses.filter((x) => x === 'draft').length,
      awaiting_confirmation: awaiting.n,
      open_disputes: disputes.n,
      proposals_waiting: proposals.n,
      open_reports: reports.n,
      appealed_warnings: appeals.n,
      institutions_waiting: institutionsWaiting.n,
    });
  })

  .get('/meta', async (c) => {
    const { db } = c.var.deps;
    const people = await db
      .select({ ...publicUser, role: s.users.role, phone: s.users.phone })
      .from(s.users)
      .where(isNull(s.users.deleted_at))
      .orderBy(asc(s.users.full_name));
    // Only an event with a class of its own can carry a written tag (as the app's form, routes/events.ts).
    const tagged = await db
      .select({ subtype: s.events.subtype, event_class: s.events.event_class, status: s.events.status })
      .from(s.events)
      .where(isNotNull(s.events.event_class));
    return c.json<AdminMeta>({
      subtypes: eventSubtypes(),
      tags: promotedTags(tagged),
      people,
    });
  })

  // ---------- users ----------

  .get('/users', async (c) => {
    const { db } = c.var.deps;
    const q = c.req.query('q')?.trim();
    const match = q ? or(
          ilike(s.users.full_name, `%${escapeLike(q)}%`),
          ilike(s.users.phone, `%${escapeLike(q)}%`),
          ilike(s.users.email, `%${escapeLike(q)}%`),
        ) : undefined;
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
    const warnings = ids.length
      ? await db
          .select({ user_id: s.warnings.user_id, n: count() })
          .from(s.warnings)
          .where(and(inArray(s.warnings.user_id, ids), ne(s.warnings.status, 'withdrawn')))
          .groupBy(s.warnings.user_id)
      : [];
    return c.json<AdminUserRow[]>(
      users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        phone: u.phone,
        email: u.email,
        gender: u.gender,
        city: u.city,
        avatar_url: u.avatar_url,
        role: u.role,
        level: u.level,
        total_points: u.total_points,
        is_association_member: u.is_association_member,
        created_at: u.created_at.toISOString(),
        confirmed_hours: rules.round2(hours.filter((h) => h.user_id === u.id).reduce((sum, h) => sum + (h.hours ?? 0), 0)),
        warnings: warnings.find((w) => w.user_id === u.id)?.n ?? 0,
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

  // An unsuitable profile photo. The member may add another; they are told why it went.
  .delete('/users/:id/photo', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    await db.transaction(async (tx) => {
      const [target] = await tx.select().from(s.users).where(eq(s.users.id, id)).for('update');
      if (!target || target.deleted_at || !target.avatar_url) throw new ApiError('not_found');
      await tx.delete(s.user_photos).where(eq(s.user_photos.user_id, id));
      await tx.update(s.users).set({ avatar_url: null }).where(eq(s.users.id, id));
      await audit(tx, { actorId: me.id, action: 'remove_photo', targetId: id, details: { name: target.full_name }, at: new Date(now()) });
    });
    notifyPhotoRemoved(c.var.deps, id);
    return c.body(null, 204);
  })

  // A one-time code to set a new password, for someone who forgot theirs, has an
  // account from before passwords, or finds their number signed up by someone
  // else. The admin gives it to the person once sure it is them (by a call to
  // the number, or in person). Shown only here, only once.
  .post('/users/:id/reset-code', async (c) => {
    const { db, now, jwtSecret } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const t = now();
    const issued = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(s.users).where(eq(s.users.id, id)).for('update');
      if (!target || target.deleted_at) throw new ApiError('not_found');
      await audit(tx, { actorId: me.id, action: 'issue_reset_code', targetId: id, details: { name: target.full_name }, at: new Date(t) });
      return issueResetCode(tx, jwtSecret, target.phone, me.id, t);
    });
    return c.json<ResetCodeResponse>(issued, 201);
  })

  // ---------- events ----------

  .get('/events', async (c) => {
    const { db, now } = c.var.deps;
    const t = now();
    const events = (await db.select().from(s.events).orderBy(desc(s.events.starts_at))).map((e) => iso(e) as AppEvent);
    const ids = events.map((e) => e.id);
    const counts = await joinedCounts(db, ids);
    const organizers = await organizersOf(db, ids);
    const creators = await creatorsOf(db, events);
    const institutions = await institutionRefs(db, events.map((e) => e.institution_id));
    const covers = await lessonImageRefs(db, events.map((e) => ({ image_id: e.cover_image_id })));
    return c.json<AdminEventRow[]>(
      events.map((event) => ({
        event,
        effective_status: rules.effectiveStatus(event, t),
        joined_count: counts.get(event.id) ?? 0,
        organizers: organizers.get(event.id) ?? [],
        creator: creators.get(event.created_by) ?? null,
        institution: (event.institution_id && institutions.get(event.institution_id)) || null,
        cover: (event.cover_image_id && covers.get(event.cover_image_id)) || null,
      })),
    );
  })

  .get('/events/:id', async (c) => {
    const { db, now } = c.var.deps;
    const id = c.req.param('id');
    const event = await anyEvent(db, id);
    const terms = await db.select().from(s.event_terms).where(eq(s.event_terms.event_id, id)).orderBy(asc(s.event_terms.order_index));
    const registrations = await db
      .select({ registration: s.registrations, ...publicUser, phone: s.users.phone })
      .from(s.registrations)
      .innerJoin(s.users, eq(s.users.id, s.registrations.user_id))
      .where(eq(s.registrations.event_id, id))
      .orderBy(asc(s.registrations.created_at));
    const attendance = await db.select().from(s.attendance).where(eq(s.attendance.event_id, id));
    const waiting = await db
      .select({ entry: s.waitlist, ...publicUser, phone: s.users.phone })
      .from(s.waitlist)
      .innerJoin(s.users, eq(s.users.id, s.waitlist.user_id))
      .where(eq(s.waitlist.event_id, id));
    const t = now();
    // Those offered a place first, then those waiting, each in order.
    const offered = (w: (typeof waiting)[number]) => (w.entry.offer_expires_at && w.entry.offer_expires_at.getTime() > t ? 0 : 1);
    waiting.sort((a, b) => offered(a) - offered(b) || a.entry.created_at.getTime() - b.entry.created_at.getTime());
    return c.json<AdminEventDetail>({
      event,
      effective_status: rules.effectiveStatus(event, now()),
      joined_count: (await joinedCounts(db, [id])).get(id) ?? 0,
      organizers: (await organizersOf(db, [id])).get(id) ?? [],
      creator: (await creatorsOf(db, [event])).get(event.created_by) ?? null,
      institution: (event.institution_id && (await institutionRefs(db, [event.institution_id])).get(event.institution_id)) || null,
      cover: (event.cover_image_id && (await lessonImageRefs(db, [{ image_id: event.cover_image_id }])).get(event.cover_image_id)) || null,
      terms: terms.map(iso),
      lessons: await lessonsWithCounts(db, id),
      participants: registrations.map((r) => {
        const a = attendance.find((x) => x.user_id === r.id);
        return {
          user: { ...toPublic(r), phone: r.phone },
          registration: iso(r.registration),
          attendance: a ? (iso(a) as Attendance) : null,
        };
      }),
      waitlist: waiting.map((w) => ({
        user: { ...toPublic(w), phone: w.phone },
        created_at: w.entry.created_at.toISOString(),
        offer_expires_at: offered(w) === 0 ? w.entry.offer_expires_at!.toISOString() : null,
      })),
    });
  })

  .post('/events', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, createEventInput);
    const t = new Date(now());
    const id = newId();
    await db.transaction(async (tx) => {
      const { organizerIds } = await assertIdsExist(tx, body);
      if (body.publish && organizerIds.length === 0) throw new AdminError('needs_organizer');
      await assertInstitutionApproved(tx, body.institution_id);
      await assertCoverExists(tx, body.cover_image_id);
      await tx.insert(s.events).values({
        id,
        title: body.title,
        description: body.description,
        ...kindOf(body),
        image_url: null,
        ...placeOf(body),
        starts_at: new Date(body.starts_at),
        ends_at: new Date(body.ends_at),
        capacity: body.capacity,
        gender_category: body.gender_category,
        status: body.publish ? 'published' : 'draft',
        created_by: me.id,
        created_at: t,
        institution_id: body.institution_id ?? null,
        cover_image_id: body.cover_image_id ?? null,
      });
      await writeLinks(tx, id, organizerIds);
      await writeTerms(tx, id, body.terms, t);
      await writeLessons(tx, id, body.lessons, t);
      await writeSkills(tx, id, body.skill_ids, body.subtype, true);
      await audit(tx, { actorId: me.id, action: 'create_event', targetId: id, details: { title: body.title, published: body.publish }, at: t });
    });
    if (body.publish) notifyFollowers(c.var.deps, id);
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
      const { organizerIds } = await assertIdsExist(tx, body);
      // A form that does not send it (the panel's, so far) leaves the event's institution as it is.
      const institutionId = body.institution_id === undefined ? event.institution_id : body.institution_id;
      if (institutionId !== event.institution_id) await assertInstitutionApproved(tx, institutionId);
      // The same for the cover photo: absent = as it is.
      const cover = body.cover_image_id === undefined ? event.cover_image_id : body.cover_image_id;
      if (cover !== event.cover_image_id) await assertCoverExists(tx, cover);
      const currentTerms = await termTexts(tx, id);
      const currentLessons = await lessonsWithCounts(tx, id);
      adminRules.assertEventEdit({
        event,
        next: { ...body, organizerCount: organizerIds.length },
        currentTerms,
        currentLessons,
        lessonsLearned: currentLessons.some((l) => l.learned_count > 0),
        joinedCount: (await joinedCounts(tx, [id])).get(id) ?? 0,
        hasAttendance: await hasAttendance(tx, id),
        now: t,
      });
      const fields = ['title', 'description', 'subtype', 'capacity', 'gender_category'] as const;
      const changed: string[] = fields.filter((k) => body[k] !== event[k]);
      const placeMoved = rules.placeChanged(event, body);
      if (placeMoved) changed.push('place');
      if (rules.toMs(body.starts_at) !== rules.toMs(event.starts_at)) changed.push('starts_at');
      if (rules.toMs(body.ends_at) !== rules.toMs(event.ends_at)) changed.push('ends_at');
      await tx
        .update(s.events)
        .set({
          title: body.title,
          description: body.description,
          ...kindOf(body),
          ...placeOf(body),
          starts_at: new Date(body.starts_at),
          ends_at: new Date(body.ends_at),
          capacity: body.capacity,
          gender_category: body.gender_category,
          institution_id: institutionId ?? null,
          cover_image_id: cover ?? null,
        })
        .where(eq(s.events.id, id));
      if (institutionId !== event.institution_id) changed.push('institution');
      if (cover !== event.cover_image_id) {
        changed.push('cover');
        await dropUnusedImages(tx, [event.cover_image_id]);
      }
      await writeLinks(tx, id, organizerIds);
      const termsChanged = body.terms.length !== currentTerms.length || body.terms.some((x, i) => x !== currentTerms[i]);
      if (termsChanged) await writeTerms(tx, id, body.terms, new Date(t));
      const lessonsChanged = adminRules.lessonsChanged(currentLessons, body.lessons);
      if (lessonsChanged) await writeLessons(tx, id, body.lessons, new Date(t));
      await audit(tx, {
        actorId: me.id,
        action: 'update_event',
        targetId: id,
        details: { title: body.title, changed: [...changed, ...(termsChanged ? ['terms'] : []), ...(lessonsChanged ? ['lessons'] : [])] },
        at: new Date(t),
      });
      // More places: they go to the waiting list.
      const offers = await fillOpenPlaces(tx, id, t);
      return { wasDraft: event.status === 'draft', changed, placeMoved, wasOnline: event.location_type === 'online', offers };
    });
    notifyPlaceOffered(c.var.deps, id, edit.offers);
    // A draft has nobody to tell yet.
    if (!edit.wasDraft) {
      notifyEventChanged(c.var.deps, id, me.id, {
        time: edit.changed.includes('starts_at') || edit.changed.includes('ends_at'),
        place: edit.placeMoved,
        wasOnline: edit.wasOnline,
      });
    }
    return c.body(null, 204);
  })

  .post('/events/:id/:action{publish|cancel|reject}', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const action = c.req.param('action') as 'publish' | 'cancel' | 'reject';
    const note = (await readBody(c, statusBody)).note || undefined;
    const t = now();
    const event = await db.transaction(async (tx) => {
      const event = await anyEvent(tx, id, true);
      const [organizers] = await tx.select({ n: count() }).from(s.event_organizers).where(eq(s.event_organizers.event_id, id));
      const status = adminRules.decideStatusChange({ event, action, organizerCount: organizers.n, hasAttendance: await hasAttendance(tx, id), now: t });
      await tx.update(s.events).set({ status }).where(eq(s.events.id, id));
      await audit(tx, {
        actorId: me.id,
        action: action === 'publish' ? 'publish_event' : action === 'reject' ? 'reject_event' : 'cancel_event',
        targetId: id,
        details: action === 'reject' ? { title: event.title, note: note ?? null } : { title: event.title },
        at: new Date(t),
      });
      return event;
    });
    if (action === 'cancel') notifyEventCancelled(c.var.deps, id, me.id);
    // Proposed in the app by someone else: tell them what was decided.
    if (event.created_by !== me.id && action === 'publish') notifyProposalDecided(c.var.deps, id, 'approved');
    if (action === 'publish') notifyFollowers(c.var.deps, id);
    if (event.created_by !== me.id && action === 'reject') notifyProposalDecided(c.var.deps, id, 'rejected', note);
    return c.body(null, 204);
  })

  // An unsuitable cover photo, taken off (owner's decision, 2026-11-17): covers show at once, and admins remove what does not suit.
  .delete('/events/:id/cover', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const event = await db.transaction(async (tx) => {
      const event = await anyEvent(tx, id, true);
      if (!event.cover_image_id) return null;
      await tx.update(s.events).set({ cover_image_id: null }).where(eq(s.events.id, id));
      await dropUnusedImages(tx, [event.cover_image_id]);
      await audit(tx, { actorId: me.id, action: 'remove_cover', targetId: id, details: { title: event.title }, at: new Date(now()) });
      return event;
    });
    if (event && event.created_by !== me.id) notifyCoverRemoved(c.var.deps, id);
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
      const earned = rules.pointsForHours(hours);
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

  // ---------- members' reports (not the hours report below) ----------

  .get('/reports', async (c) => {
    const { db } = c.var.deps;
    const query = reportQuery.safeParse(c.req.query());
    if (!query.success) throw new HttpError(400, 'invalid_request');
    const status = query.data.status;
    const rows = (
      await db
        .select()
        .from(s.reports)
        .where(status ? eq(s.reports.status, status) : undefined)
        .orderBy(desc(s.reports.created_at))
        .limit(500)
    ).map(iso);
    const found = await lookup(db, rows.flatMap((r) => [r.reporter_id, r.subject_id, r.handled_by]), rows.map((r) => r.event_id));
    return c.json<AdminReportRow[]>(
      rows.map((report) => ({
        report,
        reporter: found.withPhone(report.reporter_id),
        event: found.event(report.event_id),
        subject: found.withPhone(report.subject_id),
        handled_by: found.person(report.handled_by),
      })),
    );
  })

  // The note says what was done; the reporter is told only that it was looked at.
  .post('/reports/:id/handle', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const { note } = await readBody(c, handleReportBody);
    const t = new Date(now());
    await db.transaction(async (tx) => {
      const [report] = await tx.select().from(s.reports).where(eq(s.reports.id, id)).for('update');
      if (!report) throw new ApiError('not_found');
      adminRules.assertCanHandleReport(report);
      const [reporter] = await tx.select({ full_name: s.users.full_name }).from(s.users).where(eq(s.users.id, report.reporter_id));
      await tx.update(s.reports).set({ status: 'handled', handled_by: me.id, handled_at: t, handled_note: note }).where(eq(s.reports.id, id));
      await audit(tx, {
        actorId: me.id,
        action: 'handle_report',
        targetId: id,
        details: { category: report.category, reporter: reporter?.full_name ?? null, note },
        at: t,
      });
    });
    notifyReportHandled(c.var.deps, id);
    return c.body(null, 204);
  })

  // ---------- warnings ----------

  .get('/warnings', async (c) => {
    const { db } = c.var.deps;
    const query = warningQuery.safeParse(c.req.query());
    if (!query.success) throw new HttpError(400, 'invalid_request');
    const { status, user_id } = query.data;
    const rows = (
      await db
        .select()
        .from(s.warnings)
        .where(and(status ? eq(s.warnings.status, status) : undefined, user_id ? eq(s.warnings.user_id, user_id) : undefined))
        .orderBy(desc(s.warnings.created_at))
        .limit(500)
    ).map(iso);
    const found = await lookup(db, rows.flatMap((w) => [w.user_id, w.issued_by, w.decided_by]), rows.map((w) => w.event_id));
    return c.json<AdminWarningRow[]>(
      rows.map((warning) => ({
        warning,
        user: found.withPhone(warning.user_id)!,
        event: found.event(warning.event_id)!,
        issued_by: found.person(warning.issued_by),
        decided_by: found.person(warning.decided_by),
      })),
    );
  })

  // Keep a warning the member appealed, or withdraw one. The member is told, and reads the note in the app.
  .post('/warnings/:id/decide', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, decideWarningBody);
    const t = new Date(now());
    const status = await db.transaction(async (tx) => {
      const warning = await warningById(tx, id, { lock: true });
      if (!warning) throw new ApiError('not_found');
      const next = adminRules.decideWarning(warning, body.decision);
      await tx.update(s.warnings).set({ status: next, decided_by: me.id, decided_at: t, decision_note: body.note }).where(eq(s.warnings.id, id));
      const found = await lookup(tx, [warning.user_id], [warning.event_id]);
      await audit(tx, {
        actorId: me.id,
        action: next === 'upheld' ? 'uphold_warning' : 'withdraw_warning',
        targetId: id,
        details: {
          name: found.person(warning.user_id)?.full_name ?? null,
          user_id: warning.user_id,
          event_title: found.event(warning.event_id)?.title ?? null,
          appealed: warning.status === 'appealed',
          note: body.note,
        },
        at: t,
      });
      return next;
    });
    notifyWarningDecided(c.var.deps, id, status);
    return c.body(null, 204);
  })

  // ---------- hours report ----------

  // ---------- skills (owner's decisions, 2026-11-20; shared/skills.ts) ----------

  .get('/skills', async (c) => c.json<AdminSkillRow[]>(await adminSkills(c.var.deps.db)))

  .post('/skills', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, skillBody);
    const name_ar = body.name_ar.trim().replace(/\s+/g, ' ');
    const name_en = body.name_en.trim().replace(/\s+/g, ' ') || name_ar;
    const existing = await db.select({ name_ar: s.skills.name_ar }).from(s.skills);
    if (existing.some((x) => x.name_ar === name_ar)) throw new AdminError('skill_exists');
    const id = newId();
    const t = new Date(now());
    await db.transaction(async (tx) => {
      await tx.insert(s.skills).values({ id, name_ar, name_en, is_active: true, created_at: t });
      await audit(tx, { actorId: me.id, action: 'change_skill', targetId: id, details: { name: name_ar, change: 'added' }, at: t });
    });
    return c.json<AdminSkillRow[]>(await adminSkills(db), 201);
  })

  // Renamed, hidden (no longer offered; those who chose it keep it) or offered again.
  .patch('/skills/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const body = await readBody(c, skillEditBody);
    const [row] = await db.select().from(s.skills).where(eq(s.skills.id, id));
    if (!row) throw new ApiError('not_found');
    const set = {
      ...(body.name_ar !== undefined && body.name_ar.trim() ? { name_ar: body.name_ar.trim().replace(/\s+/g, ' ') } : {}),
      ...(body.name_en !== undefined && body.name_en.trim() ? { name_en: body.name_en.trim().replace(/\s+/g, ' ') } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
    };
    const t = new Date(now());
    await db.transaction(async (tx) => {
      if (Object.keys(set).length) await tx.update(s.skills).set(set).where(eq(s.skills.id, id));
      const change = body.is_active === false ? 'hidden' : body.is_active === true ? 'offered' : 'renamed';
      await audit(tx, { actorId: me.id, action: 'change_skill', targetId: id, details: { name: set.name_ar ?? row.name_ar, change }, at: t });
    });
    return c.json<AdminSkillRow[]>(await adminSkills(db));
  })

  // ---------- Hijri months (owner's decisions, 2026-11-20) ----------

  // From two months ago to a year ahead: enough to set this year's Ramadan and Dhul Hijjah.
  .get('/hijri', async (c) => {
    const { db, now, timeZone } = c.var.deps;
    const today = rules.dayIn(now(), timeZone);
    const adjustments = await db.select().from(s.hijri_adjustments);
    const base = hijriMonths();
    const moved = hijriMonths(adjustments);
    const i = Math.max(0, base.findIndex((m, k) => m.start <= today && (base[k + 1]?.start ?? '9999') > today) - 2);
    return c.json<AdminHijriMonth[]>(
      base.slice(i, i + 15).map((m, k) => ({
        year: m.year,
        month: m.month,
        base_start: m.start,
        start: moved[i + k].start,
        days: adjustments.find((a) => a.year === m.year && a.month === m.month)?.days ?? 0,
      })),
    );
  })

  .put('/hijri/:year/:month', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const year = Number(c.req.param('year'));
    const month = Number(c.req.param('month'));
    const { days } = await readBody(c, z.object({ days: z.number().int().min(-HIJRI_ADJUST_MAX).max(HIJRI_ADJUST_MAX) }));
    if (!hijriMonths().some((m) => m.year === year && m.month === month)) throw new ApiError('not_found');
    const t = new Date(now());
    await db.transaction(async (tx) => {
      if (days === 0) await tx.delete(s.hijri_adjustments).where(and(eq(s.hijri_adjustments.year, year), eq(s.hijri_adjustments.month, month)));
      else
        await tx
          .insert(s.hijri_adjustments)
          .values({ year, month, days, set_by: me.id, set_at: t })
          .onConflictDoUpdate({ target: [s.hijri_adjustments.year, s.hijri_adjustments.month], set: { days, set_by: me.id, set_at: t } });
      await audit(tx, { actorId: me.id, action: 'set_hijri_month', targetId: `${year}-${month}`, details: { year, month, days }, at: t });
    });
    return c.body(null, 204);
  })

  .get('/stats/hours', async (c) => {
    const { db, now, timeZone } = c.var.deps;
    const end = now();
    // The first day of the month eleven months ago, where the association is.
    const today = rules.dayIn(end, timeZone);
    const startMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1)); // month index is 0-based: this month - 11
    const fromDay = startMonth.toISOString().slice(0, 10);
    const months = Array.from({ length: 12 }, (_, k) => new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + k, 1)).toISOString().slice(0, 7));
    const attended = await db
      .select({ hours: s.attendance.hours, started_at: s.attendance.started_at, city: s.users.city, institution: s.institutions.name })
      .from(s.attendance)
      .innerJoin(s.users, eq(s.users.id, s.attendance.user_id))
      .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
      .leftJoin(s.institutions, eq(s.institutions.id, s.events.institution_id))
      .where(and(eq(s.attendance.participant_status, 'confirmed'), gte(s.attendance.started_at, new Date(Date.parse(`${fromDay}T00:00:00Z`) - 86_400_000))));
    const outside = await db
      .select({ minutes: s.outside_hours.minutes, done_on: s.outside_hours.done_on, city: s.users.city, institution: s.institutions.name })
      .from(s.outside_hours)
      .innerJoin(s.users, eq(s.users.id, s.outside_hours.user_id))
      .innerJoin(s.institutions, eq(s.institutions.id, s.outside_hours.institution_id))
      .where(and(eq(s.outside_hours.status, 'approved'), gte(s.outside_hours.done_on, fromDay)));
    const items = [
      ...attended.map((a) => ({ month: rules.dayIn(a.started_at.getTime(), timeZone).slice(0, 7), hours: a.hours ?? 0, city: a.city, institution: a.institution })),
      ...outside.map((o) => ({ month: o.done_on.slice(0, 7), hours: o.minutes / 60, city: o.city, institution: o.institution as string | null })),
    ].filter((x) => months.includes(x.month));
    const sumBy = (key: (x: (typeof items)[number]) => string | null) => {
      const totals = new Map<string, number>();
      for (const x of items) {
        const k = key(x);
        if (k !== null) totals.set(k, (totals.get(k) ?? 0) + x.hours);
      }
      return totals;
    };
    const byMonth = sumBy((x) => x.month);
    const top = (m: Map<string, number>) => [...m].map(([k, h]) => [k, rules.round2(h)] as const).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return c.json<AdminHoursStats>({
      months: months.map((month) => ({ month, hours: rules.round2(byMonth.get(month) ?? 0) })),
      // The association's own events are counted under one name the panel writes ('' here).
      institutions: top(sumBy((x) => x.institution ?? '')).map(([name, hours]) => ({ name, hours })),
      cities: top(sumBy((x) => x.city || null)).map(([city, hours]) => ({ city, hours })),
    });
  })

  .get('/reports/hours', async (c) => {
    const { db } = c.var.deps;
    // institution_id: only the events in that institution's name; `association`: only the association's own.
    const range = z.object({ from: isoTime, to: isoTime, institution_id: z.string().min(1).optional() }).safeParse(c.req.query());
    if (!range.success || Date.parse(range.data.to) <= Date.parse(range.data.from)) throw new HttpError(400, 'invalid_request');
    const organiser = range.data.institution_id;
    const rows = await db
      .select({ a: s.attendance, user: s.users })
      .from(s.attendance)
      .innerJoin(s.users, eq(s.users.id, s.attendance.user_id))
      .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
      .where(
        and(
          eq(s.attendance.participant_status, 'confirmed'),
          gte(s.attendance.started_at, new Date(range.data.from)),
          lt(s.attendance.started_at, new Date(range.data.to)),
          isNull(s.users.deleted_at),
          organiser === 'association' ? isNull(s.events.institution_id) : organiser ? eq(s.events.institution_id, organiser) : undefined,
        ),
      );
    // Hours outside the app's events approved in the period (their day, where the association is): none for the association's own.
    const { timeZone } = c.var.deps;
    const fromDay = rules.dayIn(Date.parse(range.data.from), timeZone);
    const toDay = rules.dayIn(Date.parse(range.data.to) - 1, timeZone);
    const outside =
      organiser === 'association'
        ? []
        : await db
            .select({ o: s.outside_hours, user: s.users })
            .from(s.outside_hours)
            .innerJoin(s.users, eq(s.users.id, s.outside_hours.user_id))
            .where(
              and(
                eq(s.outside_hours.status, 'approved'),
                gte(s.outside_hours.done_on, fromDay),
                lte(s.outside_hours.done_on, toDay),
                isNull(s.users.deleted_at),
                organiser ? eq(s.outside_hours.institution_id, organiser) : undefined,
              ),
            );
    const userIds = [...new Set([...rows.map((r) => r.a.user_id), ...outside.map((r) => r.o.user_id)])];
    const ledger = userIds.length
      ? await db.select().from(s.points_ledger).where(inArray(s.points_ledger.user_id, userIds))
      : [];
    // The institutions each person belongs to (confirmed), by name.
    const belongs = userIds.length
      ? await db
          .select({ user_id: s.institution_members.user_id, name: s.institutions.name })
          .from(s.institution_members)
          .innerJoin(s.institutions, eq(s.institutions.id, s.institution_members.institution_id))
          .where(
            and(
              inArray(s.institution_members.user_id, userIds),
              eq(s.institution_members.status, 'confirmed'),
              eq(s.institutions.status, 'approved'),
            ),
          )
          .orderBy(asc(s.institutions.name))
      : [];
    const report = new Map<string, HoursReportRow>();
    const entryOf = (user: typeof s.users.$inferSelect): HoursReportRow =>
      report.get(user.id) ?? {
        user_id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        city: user.city,
        gender: user.gender,
        events: 0,
        hours: 0,
        total_points: 0,
        institutions: belongs.filter((b) => b.user_id === user.id).map((b) => b.name),
        outside_hours: 0,
      };
    for (const { a, user } of rows) {
      const entry = entryOf(user);
      entry.events += 1;
      entry.hours = rules.round2(entry.hours + (a.hours ?? 0));
      // The points these hours earned: the ledger rows for this person at this event.
      const earned = rules.totalPoints(ledger.filter((x) => x.user_id === user.id && x.event_id === a.event_id));
      entry.total_points = rules.round2(entry.total_points + earned);
      report.set(user.id, entry);
    }
    for (const { o, user } of outside) {
      const entry = entryOf(user);
      const hours = o.minutes / 60;
      entry.hours = rules.round2(entry.hours + hours);
      entry.outside_hours = rules.round2((entry.outside_hours ?? 0) + hours);
      entry.total_points = rules.round2(entry.total_points + rules.totalPoints(ledger.filter((x) => x.outside_hours_id === o.id)));
      report.set(user.id, entry);
    }
    return c.json<HoursReportRow[]>([...report.values()].sort((x, y) => y.hours - x.hours));
  })

  // ---------- institutions (جمعية، مؤسسة، مدرسة…) ----------

  .get('/institutions', async (c) => {
    const { db } = c.var.deps;
    const query = institutionQuery.safeParse(c.req.query());
    if (!query.success) throw new HttpError(400, 'invalid_request');
    const status = query.data.status;
    const rows = (
      await db
        .select()
        .from(s.institutions)
        .where(status ? eq(s.institutions.status, status) : undefined)
        .orderBy(asc(s.institutions.name))
    ).map(iso);
    const ids = rows.map((r) => r.id);
    const members = ids.length
      ? await db
          .select({ m: s.institution_members, ...publicUser, phone: s.users.phone })
          .from(s.institution_members)
          .innerJoin(s.users, eq(s.users.id, s.institution_members.user_id))
          .where(and(inArray(s.institution_members.institution_id, ids), isNull(s.users.deleted_at)))
          .orderBy(asc(s.users.full_name))
      : [];
    const events = ids.length
      ? await db.select({ institution_id: s.events.institution_id, status: s.events.status }).from(s.events).where(inArray(s.events.institution_id, ids))
      : [];
    const found = await lookup(db, rows.map((r) => r.requested_by), []);
    // Those waiting for a decision first, then by name.
    const waitingFirst = (r: (typeof rows)[number]) => (r.status === 'pending' ? 0 : 1);
    rows.sort((a, b) => waitingFirst(a) - waitingFirst(b));
    return c.json<AdminInstitutionRow[]>(
      rows.map((institution) => {
        const own = members.filter((x) => x.m.institution_id === institution.id);
        return {
          institution,
          requested_by: found.withPhone(institution.requested_by),
          representatives: own.filter((x) => rules.isRepresentative(x.m)).map((x) => ({ ...toPublic(x), phone: x.phone })),
          members: own.filter((x) => x.m.role === 'member' && x.m.status === 'confirmed').length,
          pending_members: own.filter((x) => x.m.status === 'pending').length,
          approved_events: rules.institutionApprovedEvents(events, institution.id),
        };
      }),
    );
  })

  // Whoever asked is its first representative already (from the request); turning it down tells them why.
  .post('/institutions/:id/:action{approve|reject}', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const action = c.req.param('action') as 'approve' | 'reject';
    const note = (await readBody(c, statusBody)).note || undefined;
    const t = new Date(now());
    const institution = await db.transaction(async (tx) => {
      const institution = await findInstitution(tx, id, { lock: true });
      if (!institution) throw new ApiError('not_found');
      if (institution.status !== 'pending') throw new AdminError('institution_not_waiting');
      await tx
        .update(s.institutions)
        .set({
          status: action === 'approve' ? 'approved' : 'rejected',
          decided_by: me.id,
          decided_at: t,
          decision_note: action === 'reject' ? (note ?? null) : null,
        })
        .where(eq(s.institutions.id, id));
      await audit(tx, {
        actorId: me.id,
        action: action === 'approve' ? 'approve_institution' : 'reject_institution',
        targetId: id,
        details: { name: institution.name, ...(action === 'reject' ? { note: note ?? null } : {}) },
        at: t,
      });
      return institution;
    });
    notifyInstitutionDecided(c.var.deps, id, institution.requested_by, action === 'approve' ? 'approved' : 'rejected', note);
    return c.body(null, 204);
  })

  // By phone number. Someone who belongs to it, or asked to, becomes its representative.
  .post('/institutions/:id/representatives', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const phone = rules.libyanMobile((await readBody(c, addRepresentativeBody)).phone);
    const t = new Date(now());
    const added = await db.transaction(async (tx) => {
      const institution = await findInstitution(tx, id, { lock: true });
      if (!institution) throw new ApiError('not_found');
      if (institution.status !== 'approved') throw new AdminError('institution_not_approved');
      const [user] = phone ? await tx.select().from(s.users).where(and(eq(s.users.phone, phone), isNull(s.users.deleted_at))) : [];
      if (!user) throw new AdminError('no_such_user');
      const current = await membershipOf(tx, id, user.id, { lock: true });
      if (rules.isRepresentative(current)) throw new AdminError('already_representative');
      const values = { role: 'representative' as const, status: 'confirmed' as const, confirmed_by: me.id, confirmed_at: t };
      if (current) {
        await tx
          .update(s.institution_members)
          .set(values)
          .where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.user_id, user.id)));
      } else {
        await tx.insert(s.institution_members).values({ institution_id: id, user_id: user.id, created_at: t, ...values });
      }
      await audit(tx, {
        actorId: me.id,
        action: 'add_representative',
        targetId: id,
        details: { name: institution.name, user_id: user.id, person: user.full_name },
        at: t,
      });
      return user.id;
    });
    notifyRepresentativeAdded(c.var.deps, id, added);
    return c.body(null, 204);
  })

  // They stay a (confirmed) member.
  .delete('/institutions/:id/representatives/:userId', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    const t = new Date(now());
    await db.transaction(async (tx) => {
      const institution = await findInstitution(tx, id, { lock: true });
      const current = await membershipOf(tx, id, userId, { lock: true });
      if (!institution || !rules.isRepresentative(current)) throw new ApiError('not_found');
      await tx
        .update(s.institution_members)
        .set({ role: 'member' })
        .where(and(eq(s.institution_members.institution_id, id), eq(s.institution_members.user_id, userId)));
      const [user] = await tx.select({ full_name: s.users.full_name }).from(s.users).where(eq(s.users.id, userId));
      await audit(tx, {
        actorId: me.id,
        action: 'remove_representative',
        targetId: id,
        details: { name: institution.name, user_id: userId, person: user?.full_name ?? '' },
        at: t,
      });
    });
    return c.body(null, 204);
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
