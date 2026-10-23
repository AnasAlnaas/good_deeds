// Sign-in by phone with a one-time code. The same two calls sign up a new
// person: the first time a phone signs in, verify-code answers
// `profile_required` and the app sends it again with the profile.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { LoginResponse, RequestCodeResponse } from '../../../shared/api';
import { signToken } from '../auth';
import { newId } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppEnv, HttpError, readBody } from '../http';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60_000;
/** Spent and expired codes are deleted this long after they expire. */
const KEEP_EXPIRED_MS = 24 * 60 * 60_000;

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, 'international format, e.g. +218912345678');
const requestCodeBody = z.object({ phone });
const verifyCodeBody = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/),
  profile: z
    .object({
      full_name: z.string().trim().min(2).max(100),
      gender: z.enum(['male', 'female']),
      city: z.string().trim().min(1).max(60),
    })
    .optional(),
});

// Only a hash of the code is stored, keyed with the server's secret.
function hashCode(secret: string, phoneNumber: string, code: string) {
  return createHmac('sha256', secret).update(`${phoneNumber}:${code}`).digest('hex');
}

function sameHash(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const authRoutes = new Hono<AppEnv>()
  .post('/request-code', async (c) => {
    const { db, now, jwtSecret, sendLoginCode } = c.var.deps;
    const body = await readBody(c, requestCodeBody);
    if (!sendLoginCode) throw new HttpError(503, 'delivery_not_configured');
    const t = now();
    const [latest] = await db
      .select()
      .from(s.login_codes)
      .where(eq(s.login_codes.phone, body.phone))
      .orderBy(desc(s.login_codes.created_at))
      .limit(1);
    if (latest && !latest.consumed_at && t - latest.created_at.getTime() < RESEND_AFTER_MS) {
      throw new HttpError(429, 'code_recently_sent');
    }
    // Old codes are of no use: clear them now and then, without a separate job.
    await db.delete(s.login_codes).where(lt(s.login_codes.expires_at, new Date(t - KEEP_EXPIRED_MS)));
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.insert(s.login_codes).values({
      id: newId(),
      phone: body.phone,
      code_hash: hashCode(jwtSecret, body.phone, code),
      expires_at: new Date(t + CODE_MINUTES * 60_000),
      created_at: new Date(t),
    });
    await sendLoginCode(body.phone, code);
    // The same answer whether or not the phone has an account.
    return c.json<RequestCodeResponse>({ expires_in_seconds: CODE_MINUTES * 60 });
  })

  .post('/verify-code', async (c) => {
    const { db, now, jwtSecret } = c.var.deps;
    const body = await readBody(c, verifyCodeBody);
    const t = now();
    const result = await db.transaction(async (tx) => {
      const [code] = await tx
        .select()
        .from(s.login_codes)
        .where(and(eq(s.login_codes.phone, body.phone), isNull(s.login_codes.consumed_at)))
        .orderBy(desc(s.login_codes.created_at))
        .limit(1)
        .for('update');
      if (!code || code.expires_at.getTime() <= t) return { error: 'code_expired' as const };
      if (code.attempts >= MAX_ATTEMPTS) return { error: 'too_many_attempts' as const };
      if (!sameHash(code.code_hash, hashCode(jwtSecret, body.phone, body.code))) {
        await tx.update(s.login_codes).set({ attempts: code.attempts + 1 }).where(eq(s.login_codes.id, code.id));
        return { error: 'code_invalid' as const };
      }

      let [user] = await tx
        .select()
        .from(s.users)
        .where(and(eq(s.users.phone, body.phone), isNull(s.users.deleted_at)));
      if (!user) {
        // A new phone: the code stays valid so the app can send the profile next.
        if (!body.profile) return { error: 'profile_required' as const };
        [user] = await tx
          .insert(s.users)
          .values({ id: newId(), phone: body.phone, ...body.profile, created_at: new Date(t) })
          .returning();
      }
      await tx.update(s.login_codes).set({ consumed_at: new Date(t) }).where(eq(s.login_codes.id, code.id));
      return { user: iso(user) };
    });
    // Errors are returned, not thrown, so the failed-attempt count is saved.
    if (result.error) {
      throw new HttpError(result.error === 'profile_required' ? 409 : result.error === 'too_many_attempts' ? 429 : 401, result.error);
    }
    return c.json<LoginResponse>({ token: await signToken(result.user!.id, jwtSecret), user: result.user! });
  });
