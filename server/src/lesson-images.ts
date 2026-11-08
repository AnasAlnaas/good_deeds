// Lessons' pictures (db/schema.ts lesson_images). A picture is sent before the
// event form that uses it, so it may never be used: the form was left, or the
// picture replaced before saving. One no lesson shows is removed with the last
// lesson that showed it, and one no lesson ever showed after UNUSED_DAYS.

import { and, eq, inArray, lt, notExists } from 'drizzle-orm';

import type { Database } from './db/client';
import * as s from './db/schema';

/** Long enough for a form left open overnight. */
const UNUSED_DAYS = 2;

const unused = (q: Database) =>
  notExists(q.select({ id: s.event_lessons.id }).from(s.event_lessons).where(eq(s.event_lessons.image_id, s.lesson_images.id)));

/** Removes those of these pictures no lesson shows any more. */
export async function dropUnusedImages(q: Database, ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length) await q.delete(s.lesson_images).where(and(inArray(s.lesson_images.id, wanted), unused(q)));
}

/** The scheduled job's part: pictures sent for a lesson that never used them. */
export async function sweepLessonImages(q: Database, now: number) {
  const before = new Date(now - UNUSED_DAYS * 24 * 60 * 60 * 1000);
  await q.delete(s.lesson_images).where(and(lt(s.lesson_images.created_at, before), unused(q)));
}
