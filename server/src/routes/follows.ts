// Following (owner's decisions, 2026-11-21): a member follows institutions,
// supervisors and classes of good works, and is told once when a new event
// from any of them is published (one they may join). Who follows whom is
// private: no counts, no names.

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { FollowSuggestionAnswer, FollowSuggestionResponse, FollowsResponse } from '../../../shared/api';
import { classOfEvent, isEventClass } from '../../../shared/classes';
import { ApiError } from '../../../shared/errors';
import { canFollowPerson, type FollowKind } from '../../../shared/follows';
import * as rules from '../../../shared/rules';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { findInstitution, findUser, publicUser, shownTo } from '../db/queries';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';
import { followSuggestion } from '../smart';
import type { User } from '../../../shared/types';

const KINDS: FollowKind[] = ['institution', 'person', 'class'];
const suggestionAnswer = z.object({ kind: z.enum(['institution', 'person']), id: z.string().max(80), follow: z.boolean() });

export async function followsOf(db: Database, me: User): Promise<FollowsResponse> {
  const rows = await db.select().from(s.follows).where(eq(s.follows.user_id, me.id));
  const ids = (kind: FollowKind) => rows.filter((r) => r.kind === kind).map((r) => r.target_id);
  const institutionIds = ids('institution');
  const personIds = ids('person');
  const institutions = institutionIds.length
    ? await db
        .select({ id: s.institutions.id, name: s.institutions.name, kind: s.institutions.kind })
        .from(s.institutions)
        .where(and(inArray(s.institutions.id, institutionIds), eq(s.institutions.status, 'approved')))
    : [];
  const people = personIds.length ? await db.select(publicUser).from(s.users).where(and(inArray(s.users.id, personIds), isNull(s.users.deleted_at))) : [];
  return {
    institutions: institutions.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    people: people.map((p) => shownTo(me, p)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    classes: ids('class').filter(isEventClass),
  };
}

/** Whether `me` follows each of these (for the event, institution and person pages). */
export async function isFollowing(db: Database, userId: string, kind: FollowKind, targetId: string | null | undefined) {
  if (!targetId) return false;
  const [row] = await db
    .select({ id: s.follows.target_id })
    .from(s.follows)
    .where(and(eq(s.follows.user_id, userId), eq(s.follows.kind, kind), eq(s.follows.target_id, targetId)));
  return !!row;
}

/** What may be followed: an approved institution, a supervisor (shared/follows.ts), one of the classes. */
async function assertFollowable(db: Database, kind: FollowKind, id: string) {
  if (kind === 'class') {
    if (!isEventClass(id)) throw new ApiError('not_found');
  } else if (kind === 'institution') {
    if ((await findInstitution(db, id))?.status !== 'approved') throw new ApiError('not_found');
  } else {
    const person = await findUser(db, id);
    if (!person || person.deleted_at || !canFollowPerson(person)) throw new ApiError('not_found');
  }
}

export const followRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => c.json<FollowsResponse>(await followsOf(c.var.deps.db, c.var.user)))

  // "Follow this?" (shared/smart.ts): what they keep coming back to, asked once.
  .get('/suggestion', async (c) => c.json<FollowSuggestionResponse>({ suggestion: await followSuggestion(c.var.deps.db, c.var.user) }))

  .post('/suggestion', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body: FollowSuggestionAnswer = await readBody(c, suggestionAnswer);
    if (body.follow) {
      await assertFollowable(db, body.kind, body.id);
      await db.insert(s.follows).values({ user_id: me.id, kind: body.kind, target_id: body.id, created_at: new Date(now()) }).onConflictDoNothing();
    }
    await db.insert(s.follow_prompts).values({ user_id: me.id, kind: body.kind, target_id: body.id, answered_at: new Date(now()) }).onConflictDoNothing();
    return c.body(null, 204);
  })

  .put('/:kind/:id', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const kind = c.req.param('kind') as FollowKind;
    const id = c.req.param('id');
    if (!KINDS.includes(kind)) throw new ApiError('not_found');
    if (kind === 'person' && id === me.id) throw new ApiError('not_found');
    await assertFollowable(db, kind, id);
    await db.insert(s.follows).values({ user_id: me.id, kind, target_id: id, created_at: new Date(now()) }).onConflictDoNothing();
    return c.json<FollowsResponse>(await followsOf(db, me));
  })

  .delete('/:kind/:id', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const kind = c.req.param('kind') as FollowKind;
    await db.delete(s.follows).where(and(eq(s.follows.user_id, me.id), eq(s.follows.kind, kind), eq(s.follows.target_id, c.req.param('id'))));
    return c.json<FollowsResponse>(await followsOf(db, me));
  });

/**
 * Who to tell about a newly published event: those following its institution,
 * its proposer (a supervisor) or its class, each once, never its proposer, and
 * only those who may join it (owner's decisions, 2026-11-21). Claiming the
 * event in follow_notices first means it is announced once, however often it
 * is published again.
 */
export async function followersToTell(db: Database, eventId: string): Promise<{ userIds: string[]; title: string } | null> {
  const [event] = await db.select().from(s.events).where(eq(s.events.id, eventId));
  if (!event || event.status !== 'published') return null;
  const [claimed] = await db.insert(s.follow_notices).values({ event_id: eventId, sent_at: new Date() }).onConflictDoNothing().returning();
  if (!claimed) return null;
  const [proposer] = await db.select().from(s.users).where(eq(s.users.id, event.created_by));
  const targets: { kind: FollowKind; id: string }[] = [{ kind: 'class', id: classOfEvent(event) }];
  if (event.institution_id) targets.push({ kind: 'institution', id: event.institution_id });
  if (proposer && canFollowPerson(proposer)) targets.push({ kind: 'person', id: proposer.id });
  const followers = new Set<string>();
  for (const t of targets) {
    const rows = await db
      .select({ user_id: s.follows.user_id })
      .from(s.follows)
      .where(and(eq(s.follows.kind, t.kind), eq(s.follows.target_id, t.id)));
    for (const r of rows) followers.add(r.user_id);
  }
  followers.delete(event.created_by);
  if (followers.size === 0) return { userIds: [], title: event.title };
  const people = await db.select().from(s.users).where(and(inArray(s.users.id, [...followers]), isNull(s.users.deleted_at)));
  return { userIds: people.filter((u) => rules.canUserJoinCategory(u, event)).map((u) => u.id), title: event.title };
}
