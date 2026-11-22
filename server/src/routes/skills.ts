// Skills and matching (owner's decisions, 2026-11-20; shared/skills.ts): the
// list offered, a person's own skills and liked classes (seen only by them and
// the admins), and the upcoming events that fit them, for the main screen.

import { and, eq, gt, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { EventMatch, MySkillsBody, MySkillsResponse, SkillRef } from '../../../shared/api';
import { classOfEvent, isEventClass, type EventClassId } from '../../../shared/classes';
import * as rules from '../../../shared/rules';
import { cleanSkillIds, matchScore, MAX_SKILLS_PER_PERSON } from '../../../shared/skills';
import { parseKeywords } from '../../../shared/smart';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import * as s from '../db/schema';
import { type AppEnv, readBody } from '../http';
import { offeredSkills } from './event-input';

const mySkillsBody = z.object({ skill_ids: z.array(z.string().max(80)).max(50), classes: z.array(z.string().max(40)).max(10) });

/** The skills offered, as the forms show them. */
export async function skillList(db: Database): Promise<SkillRef[]> {
  const rows = await db
    .select({ id: s.skills.id, name_ar: s.skills.name_ar, name_en: s.skills.name_en, keywords: s.skills.keywords })
    .from(s.skills)
    .where(eq(s.skills.is_active, true))
    .orderBy(s.skills.created_at, s.skills.id);
  return rows.map((r) => ({ ...r, keywords: parseKeywords(r.keywords) }));
}

async function mySkills(db: Database, userId: string): Promise<MySkillsResponse> {
  const skills = await db.select({ id: s.user_skills.skill_id }).from(s.user_skills).where(eq(s.user_skills.user_id, userId));
  const classes = await db.select({ c: s.user_interests.event_class }).from(s.user_interests).where(eq(s.user_interests.user_id, userId));
  return { skill_ids: skills.map((r) => r.id), classes: classes.map((r) => r.c), offered: await skillList(db) };
}

export const skillRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get('/', async (c) => c.json<MySkillsResponse>(await mySkills(c.var.deps.db, c.var.user.id)))

  // Replaces the person's skills and liked classes. A hidden skill they had stays theirs.
  .put('/', async (c) => {
    const { db } = c.var.deps;
    const me = c.var.user;
    const body: MySkillsBody = await readBody(c, mySkillsBody);
    const offered = await offeredSkills(db);
    const had = (await db.select({ id: s.user_skills.skill_id }).from(s.user_skills).where(eq(s.user_skills.user_id, me.id))).map((r) => r.id);
    const kept = had.filter((id) => !offered.includes(id) && body.skill_ids.includes(id));
    const skills = [...new Set([...kept, ...cleanSkillIds(body.skill_ids, offered, MAX_SKILLS_PER_PERSON)])].slice(0, MAX_SKILLS_PER_PERSON);
    const classes = [...new Set(body.classes.filter(isEventClass))] as EventClassId[];
    await db.transaction(async (tx) => {
      await tx.delete(s.user_skills).where(eq(s.user_skills.user_id, me.id));
      await tx.delete(s.user_interests).where(eq(s.user_interests.user_id, me.id));
      if (skills.length) await tx.insert(s.user_skills).values(skills.map((skill_id) => ({ user_id: me.id, skill_id })));
      if (classes.length) await tx.insert(s.user_interests).values(classes.map((event_class) => ({ user_id: me.id, event_class })));
    });
    return c.json<MySkillsResponse>(await mySkills(db, me.id));
  })

  /**
   * Upcoming published events that fit the person (shared/skills.ts matchScore),
   * best first, then soonest: only those they may join (their category) and
   * have not joined. For the main screen, which comes later.
   */
  .get('/matches', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const mine = await mySkills(db, me.id);
    if (mine.skill_ids.length === 0 && mine.classes.length === 0) return c.json<EventMatch[]>([]);
    const upcoming = await db
      .select({ id: s.events.id, subtype: s.events.subtype, event_class: s.events.event_class, gender_category: s.events.gender_category, starts_at: s.events.starts_at })
      .from(s.events)
      .where(and(eq(s.events.status, 'published'), gt(s.events.starts_at, new Date(now()))));
    const ids = upcoming.map((e) => e.id);
    const needs = ids.length ? await db.select().from(s.event_skills).where(inArray(s.event_skills.event_id, ids)) : [];
    const joined = ids.length
      ? (
          await db
            .select({ id: s.registrations.event_id })
            .from(s.registrations)
            .where(and(eq(s.registrations.user_id, me.id), inArray(s.registrations.event_id, ids), eq(s.registrations.status, 'joined')))
        ).map((r) => r.id)
      : [];
    const matches = upcoming
      .filter((e) => !joined.includes(e.id) && rules.canUserJoinCategory(me, e))
      .map((e) => {
        const skillIds = needs.filter((n) => n.event_id === e.id).map((n) => n.skill_id);
        return {
          event_id: e.id,
          starts_at: e.starts_at.toISOString(),
          score: matchScore({ event_class: classOfEvent(e), skill_ids: skillIds }, mine),
          matched_skill_ids: skillIds.filter((id) => mine.skill_ids.includes(id)),
          class_liked: mine.classes.includes(classOfEvent(e)),
        };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || a.starts_at.localeCompare(b.starts_at));
    return c.json<EventMatch[]>(matches.slice(0, 20));
  });
