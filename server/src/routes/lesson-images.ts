// Lessons' pictures (shared/api.ts LessonImageBody): an infographic or a
// diagram in an event's learning corner. Sent by whoever may write lessons,
// before the event form that uses it; seen by anyone signed in.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { LessonImageResponse } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import { requireUser } from '../auth';
import { levelOf, newId } from '../db/queries';
import * as s from '../db/schema';
import { type AppEnv, HttpError, readBody } from '../http';
import { lessonImageUrl, readLessonImage } from '../photo';

const imageBody = z.object({ jpeg_base64: z.string().min(1) });

export const lessonImageRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // The same people who may write lessons: those who may create events, and admins.
  .post('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    if (!rules.canCreateEvents(me, await levelOf(db, me.id))) throw new ApiError('cannot_create_events');
    const image = readLessonImage((await readBody(c, imageBody)).jpeg_base64);
    if (!image) throw new HttpError(400, 'photo_invalid');
    const id = newId();
    await db.insert(s.lesson_images).values({ id, ...image, uploaded_by: me.id, created_at: new Date(now()) });
    const { width, height } = image;
    return c.json<LessonImageResponse>({ image: { id, url: lessonImageUrl(id), width, height } }, 201);
  })

  // A lesson is for anyone who can see its event; its picture is not private,
  // and its id cannot be guessed. It never changes, so a copy never goes stale.
  .get('/:id', async (c) => {
    const [row] = await c.var.deps.db.select().from(s.lesson_images).where(eq(s.lesson_images.id, c.req.param('id')));
    if (!row) throw new ApiError('not_found');
    return c.body(new Uint8Array(row.jpeg), 200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  });
