// One-time codes sent by email (schema.ts email_codes): to confirm an address
// at sign-up or when it changes, and to reset a forgotten password. Limited
// like the SMS codes in routes/auth.ts, so nobody can guess a code or use the
// server to flood an inbox.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import type { Database } from './db/client';
import { newId } from './db/queries';
import * as s from './db/schema';
import { codeEmail, type EmailCodePurpose } from './email';
import { type AppDeps, HttpError } from './http';

export const EMAIL_CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60_000;
const KEEP_EXPIRED_MS = 24 * 60 * 60_000;
// Per address, over the last 24 hours: codes sent, and wrong codes tried.
const DAY_MS = 86_400_000;
const MAX_CODES_PER_DAY = 5;
const MAX_FAILED_PER_DAY = 10;
// Per network address, over the last hour: codes sent to any email.
const HOUR_MS = 3_600_000;
const MAX_CODES_PER_NETWORK = 20;

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

function hashCode(secret: string, email: string, purpose: EmailCodePurpose, code: string) {
  return createHmac('sha256', secret).update(`email:${purpose}:${email}:${code}`).digest('hex');
}

function sameHash(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function emailDay(q: Database, email: string, t: number) {
  const [row] = await q
    .select({ codes: count(), failed: sql<string>`coalesce(sum(${s.email_codes.attempts}), 0)` })
    .from(s.email_codes)
    .where(and(eq(s.email_codes.email, email), gt(s.email_codes.created_at, new Date(t - DAY_MS))));
  return { codes: row.codes, failed: Number(row.failed) };
}

// Times codes were sent from each network address, in this process's memory (one list per app).
const sentFrom = new WeakMap<AppDeps, Map<string, number[]>>();

/** The times something happened from one network address in the last hour (a list the caller may add to). */
export function recentFrom(deps: AppDeps, key: string, t: number) {
  let all = sentFrom.get(deps);
  if (!all) sentFrom.set(deps, (all = new Map()));
  if (all.size > 10_000) {
    for (const [k, times] of all) if (times.every((x) => t - x >= HOUR_MS)) all.delete(k);
  }
  const times = (all.get(key) ?? []).filter((x) => t - x < HOUR_MS);
  all.set(key, times);
  return times;
}

/**
 * Checks the limits, then makes a code and emails it. `send: false` checks
 * and counts the request without sending (a reset asked for an address with no
 * account answers the same as one with an account).
 */
export async function sendEmailCode(
  c: Context,
  deps: AppDeps,
  opts: { email: string; purpose: EmailCodePurpose; userId: string | null; lang: 'ar' | 'en'; send?: boolean },
) {
  const { db, now, jwtSecret, sendEmail } = deps;
  if (!sendEmail) throw new HttpError(503, 'delivery_not_configured');
  const t = now();
  const [latest] = await db
    .select()
    .from(s.email_codes)
    .where(and(eq(s.email_codes.email, opts.email), eq(s.email_codes.purpose, opts.purpose)))
    .orderBy(desc(s.email_codes.created_at))
    .limit(1);
  if (latest && !latest.consumed_at && t - latest.created_at.getTime() < RESEND_AFTER_MS) throw new HttpError(429, 'code_recently_sent');
  const day = await emailDay(db, opts.email, t);
  if (day.codes >= MAX_CODES_PER_DAY || day.failed >= MAX_FAILED_PER_DAY) throw new HttpError(429, 'try_later');
  const network = deps.clientIp?.(c);
  const fromHere = network ? recentFrom(deps, `email:${network}`, t) : [];
  if (fromHere.length >= MAX_CODES_PER_NETWORK) throw new HttpError(429, 'try_later');
  fromHere.push(t);
  if (opts.send === false) return;

  // Old codes are of no use: clear them now and then, without a separate job.
  await db.delete(s.email_codes).where(lt(s.email_codes.expires_at, new Date(t - KEEP_EXPIRED_MS)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = newId();
  // A newer code replaces the earlier unused ones for the same purpose.
  await db
    .update(s.email_codes)
    .set({ consumed_at: new Date(t) })
    .where(and(eq(s.email_codes.email, opts.email), eq(s.email_codes.purpose, opts.purpose), isNull(s.email_codes.consumed_at)));
  await db.insert(s.email_codes).values({
    id,
    email: opts.email,
    purpose: opts.purpose,
    user_id: opts.userId,
    code_hash: hashCode(jwtSecret, opts.email, opts.purpose, code),
    expires_at: new Date(t + EMAIL_CODE_MINUTES * 60_000),
    created_at: new Date(t),
  });
  try {
    await sendEmail(codeEmail(opts.email, opts.purpose, code, EMAIL_CODE_MINUTES, opts.lang));
  } catch (err) {
    console.error('email not sent', err);
    // Not sent: the person may ask again at once.
    await db.update(s.email_codes).set({ consumed_at: new Date(t) }).where(eq(s.email_codes.id, id));
    throw new HttpError(503, 'email_not_sent');
  }
}

/**
 * The latest unused code for this address and purpose, if `code` is it. A
 * wrong code is counted against it. `userId`, when given, must be the account
 * the code was made for.
 */
export async function takeEmailCode(
  tx: Tx,
  secret: string,
  opts: { email: string; purpose: EmailCodePurpose; code: string; userId?: string },
  t: number,
) {
  const [row] = await tx
    .select()
    .from(s.email_codes)
    .where(and(eq(s.email_codes.email, opts.email), eq(s.email_codes.purpose, opts.purpose), isNull(s.email_codes.consumed_at)))
    .orderBy(desc(s.email_codes.created_at))
    .limit(1)
    .for('update');
  if (!row || row.expires_at.getTime() <= t) return { error: 'code_expired' as const };
  if (opts.userId !== undefined && row.user_id !== opts.userId) return { error: 'code_expired' as const };
  if ((await emailDay(tx, opts.email, t)).failed >= MAX_FAILED_PER_DAY) return { error: 'try_later' as const };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'too_many_attempts' as const };
  if (!sameHash(row.code_hash, hashCode(secret, opts.email, opts.purpose, opts.code))) {
    await tx.update(s.email_codes).set({ attempts: row.attempts + 1 }).where(eq(s.email_codes.id, row.id));
    return { error: 'code_invalid' as const };
  }
  await tx.update(s.email_codes).set({ consumed_at: new Date(t) }).where(eq(s.email_codes.id, row.id));
  return row;
}
