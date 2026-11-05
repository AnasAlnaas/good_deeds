// Signing in. An account has a phone number, an email address and a password
// (sign-up, sign-in, reset-password). An SMS for every sign-in costs too much
// for now, so nobody checks by SMS that a number is the person's; the email
// address is confirmed with a code sent to it before the account is made
// (email-code, then sign-up). One signs in with the phone or the email.
// A forgotten password is reset with a one-time code sent to the email, or
// with one an admin makes in the admin panel and gives the person
// (POST /api/admin/users/:id/reset-code); the admin's code also settles a
// number someone else signed up with.
//
// Kept for when SMS becomes affordable: sign-in by a code sent to the phone
// (request-code, verify-code), which also signs up a new person: the first
// time a phone signs in, verify-code answers `profile_required` and the app
// sends it again with the profile. An account made that way has no email.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import type { LoginResponse, RequestCodeResponse } from '../../../shared/api';
import * as rules from '../../../shared/rules';
import type { User } from '../../../shared/types';
import { signToken } from '../auth';
import { checkPassword, hashPassword } from '../password';
import { EMAIL_CODE_MINUTES, recentFrom, sendEmailCode, takeEmailCode } from '../email-codes';
import type { Database } from '../db/client';
import { newId } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppDeps, type AppEnv, HttpError, readBody } from '../http';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60_000;
/** Spent and expired codes are deleted this long after they expire. */
const KEEP_EXPIRED_MS = 24 * 60 * 60_000;

// A code is one of a million. Without a daily cap, a new code every minute with
// 5 tries each is 7,200 guesses a day, enough to take over a phone's account in
// weeks. Per phone, over the last 24 hours:
const DAY_MS = 86_400_000;
const MAX_CODES_PER_DAY = 5;
const MAX_FAILED_PER_DAY = 10;
// Per network address, over the last hour: codes sent to any phone, so nobody
// can send SMS to many numbers from one place.
const HOUR_MS = 3_600_000;
const MAX_CODES_PER_ADDRESS = 20;

// Passwords. Ten wrong ones in a day lock the account until the day is over
// (or an admin's reset code); per address, a few dozen wrong ones an hour.
// New accounts per address and hour are capped too, as nothing else slows
// down making them.
const MAX_FAILED_SIGN_INS_PER_DAY = 10;
const MAX_FAILED_SIGN_INS_PER_ADDRESS = 30;
const MAX_SIGN_UPS_PER_ADDRESS = 10;
/** How long a reset code from an admin can be used: the person may not be reached at once. */
const RESET_CODE_HOURS = 24;

// Libyan mobile numbers only (091–095), in the form the app sends: +218912345678.
const phone = z.string().regex(rules.LIBYAN_MOBILE);
// The same checks as the app's sign-up form, which sends what they give back.
const checked = (clean: (v: string) => string | null) =>
  z.string().transform((v, ctx) => clean(v) ?? (ctx.addIssue({ code: 'custom', message: 'invalid' }), z.NEVER));
const profile = z.object({
  full_name: checked(rules.cleanName),
  gender: z.enum(['male', 'female']),
  city: checked(rules.cleanCity),
});
const oneTimeCode = z.string().regex(/^\d{6}$/);
// A new password is also checked by rules.passwordProblem, for its own message.
const password = z.string().min(1).max(rules.PASSWORD_MAX);
const requestCodeBody = z.object({ phone });
const verifyCodeBody = z.object({ phone, code: oneTimeCode, profile: profile.optional() });
const email = z.string().max(rules.EMAIL_MAX + 20).pipe(checked(rules.cleanEmail));
const lang = z.enum(['ar', 'en']).default('ar');
const emailCodeBody = z.object({ email, purpose: z.enum(['sign_up', 'reset_password']), phone: phone.optional(), lang });
const signUpBody = z.object({ phone, email, email_code: oneTimeCode, password, profile });
// `login` is the phone number or the email address, as typed. `phone` alone: app builds from before email.
const signInBody = z.union([z.object({ login: z.string().min(1).max(300), password }), z.object({ phone, password })]);
const resetPasswordBody = z.union([z.object({ phone, code: oneTimeCode, password }), z.object({ email, code: oneTimeCode, password })]);

// Only a hash of the code is stored, keyed with the server's secret.
function hashCode(secret: string, phoneNumber: string, code: string) {
  return createHmac('sha256', secret).update(`${phoneNumber}:${code}`).digest('hex');
}

function sameHash(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** The codes sent to a phone in the last 24 hours, and the wrong codes tried against them. */
async function phoneDay(q: Database, phoneNumber: string, t: number) {
  const [row] = await q
    .select({ codes: count(), failed: sql<string>`coalesce(sum(${s.login_codes.attempts}), 0)` })
    .from(s.login_codes)
    .where(and(eq(s.login_codes.phone, phoneNumber), gt(s.login_codes.created_at, new Date(t - DAY_MS))));
  return { codes: row.codes, failed: Number(row.failed) };
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
    const day = await phoneDay(db, body.phone, t);
    if (day.codes >= MAX_CODES_PER_DAY || day.failed >= MAX_FAILED_PER_DAY) throw new HttpError(429, 'try_later');
    const address = c.var.deps.clientIp?.(c);
    const fromHere = address ? recentFrom(c.var.deps, address, t) : [];
    if (fromHere.length >= MAX_CODES_PER_ADDRESS) throw new HttpError(429, 'try_later');
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
    fromHere.push(t);
    await sendLoginCode(body.phone, code);
    // The same answer whether or not the phone has an account.
    return c.json<RequestCodeResponse>({ expires_in_seconds: CODE_MINUTES * 60 });
  })

  .post('/verify-code', async (c) => {
    const { db, now, jwtSecret, adminPhones } = c.var.deps;
    const body = await readBody(c, verifyCodeBody);
    const t = now();
    const result = await db.transaction(async (tx) => {
      const code = await takeCode(tx, jwtSecret, body.phone, body.code, t);
      if ('error' in code) return code;

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
      user = await promoteIfAdminPhone(tx, user, adminPhones, t);
      await tx.update(s.login_codes).set({ consumed_at: new Date(t) }).where(eq(s.login_codes.id, code.id));
      return { user: iso(user) };
    });
    return signedIn(c, result);
  })

  // ---------- phone and password ----------

  // A code to the email address: to confirm it before signing up (the phone, if
  // given, is checked first so a taken number is said before the email is sent),
  // or to reset the password of the account that has it. A reset for an address
  // with no account answers the same, and sends nothing.
  .post('/email-code', async (c) => {
    const { db } = c.var.deps;
    const body = await readBody(c, emailCodeBody);
    const active = (column: typeof s.users.email | typeof s.users.phone, value: string) =>
      db.select({ id: s.users.id }).from(s.users).where(and(eq(column, value), isNull(s.users.deleted_at)));
    if (body.purpose === 'sign_up') {
      if (body.phone && (await active(s.users.phone, body.phone)).length) throw new HttpError(409, 'phone_taken');
      if ((await active(s.users.email, body.email)).length) throw new HttpError(409, 'email_taken');
      await sendEmailCode(c, c.var.deps, { email: body.email, purpose: 'sign_up', userId: null, lang: body.lang });
    } else {
      const [user] = await active(s.users.email, body.email);
      await sendEmailCode(c, c.var.deps, { email: body.email, purpose: 'reset_password', userId: user?.id ?? null, lang: body.lang, send: !!user });
    }
    return c.json<RequestCodeResponse>({ expires_in_seconds: EMAIL_CODE_MINUTES * 60 });
  })

  .post('/sign-up', async (c) => {
    const { db, now, jwtSecret, adminPhones } = c.var.deps;
    const body = await readBody(c, signUpBody);
    const t = now();
    const problem = rules.passwordProblem(body.password, body.phone);
    if (problem) throw new HttpError(400, problem);
    const address = c.var.deps.clientIp?.(c);
    const fromHere = address ? recentFrom(c.var.deps, `sign-up:${address}`, t) : [];
    if (fromHere.length >= MAX_SIGN_UPS_PER_ADDRESS) throw new HttpError(429, 'try_later');
    const hash = await hashPassword(body.password);
    const result = await db.transaction(async (tx) => {
      const [taken] = await tx
        .select({ id: s.users.id })
        .from(s.users)
        .where(and(eq(s.users.phone, body.phone), isNull(s.users.deleted_at)));
      if (taken) return { error: 'phone_taken' as const };
      const [emailTaken] = await tx
        .select({ id: s.users.id })
        .from(s.users)
        .where(and(eq(s.users.email, body.email), isNull(s.users.deleted_at)));
      if (emailTaken) return { error: 'email_taken' as const };
      const code = await takeEmailCode(tx, jwtSecret, { email: body.email, purpose: 'sign_up', code: body.email_code }, t);
      if ('error' in code) return code;
      let [user] = await tx
        .insert(s.users)
        .values({ id: newId(), phone: body.phone, email: body.email, ...body.profile, created_at: new Date(t) })
        .returning();
      await tx.insert(s.user_passwords).values({ user_id: user.id, hash, updated_at: new Date(t) });
      user = await promoteIfAdminPhone(tx, user, adminPhones, t);
      return { user: iso(user) };
    });
    fromHere.push(t);
    return signedIn(c, result);
  })

  .post('/sign-in', async (c) => {
    const { db, now, adminPhones } = c.var.deps;
    const body = await readBody(c, signInBody);
    const t = now();
    // Wrong passwords from one network address, to any account.
    const address = c.var.deps.clientIp?.(c);
    const failedHere = address ? recentFrom(c.var.deps, `sign-in:${address}`, t) : [];
    if (failedHere.length >= MAX_FAILED_SIGN_INS_PER_ADDRESS) throw new HttpError(429, 'try_later');
    const who = signInWho(body);
    const result = await db.transaction(async (tx) => {
      let [user] = who
        ? await tx
            .select()
            .from(s.users)
            .where(and('email' in who ? eq(s.users.email, who.email) : eq(s.users.phone, who.phone), isNull(s.users.deleted_at)))
        : [];
      if (!user) return { error: 'wrong_password' as const };
      const [pw] = await tx.select().from(s.user_passwords).where(eq(s.user_passwords.user_id, user.id)).for('update');
      if (!pw) {
        // An account from before passwords. A number in ADMIN_PHONES may set its
        // first one this way (the same trust as signing up with it); anyone else
        // needs a reset code from an admin.
        if (!adminPhones?.includes(user.phone)) return { error: 'password_not_set' as const };
        const problem = rules.passwordProblem(body.password, user.phone);
        if (problem) return { error: problem };
        await tx.insert(s.user_passwords).values({ user_id: user.id, hash: await hashPassword(body.password), updated_at: new Date(t) });
      } else {
        const failed = failuresToday(pw, t);
        if (failed >= MAX_FAILED_SIGN_INS_PER_DAY) return { error: 'try_later' as const };
        if (!(await checkPassword(body.password, pw.hash))) {
          await tx
            .update(s.user_passwords)
            .set({ failed_count: failed + 1, failed_since: failed ? pw.failed_since : new Date(t) })
            .where(eq(s.user_passwords.user_id, user.id));
          return { error: 'wrong_password' as const };
        }
        if (pw.failed_count) {
          await tx.update(s.user_passwords).set({ failed_count: 0, failed_since: null }).where(eq(s.user_passwords.user_id, user.id));
        }
      }
      user = await promoteIfAdminPhone(tx, user, adminPhones, t);
      return { user: iso(user) };
    });
    if (result.error === 'wrong_password') failedHere.push(t);
    return signedIn(c, result);
  })

  // A new password with a one-time code: sent to the account's email, or given
  // by an admin. It also signs them in, and clears the count of wrong passwords.
  .post('/reset-password', async (c) => {
    const { db, now, jwtSecret, adminPhones } = c.var.deps;
    const body = await readBody(c, resetPasswordBody);
    const t = now();
    if ('email' in body) {
      const [found] = await db
        .select()
        .from(s.users)
        .where(and(eq(s.users.email, body.email), isNull(s.users.deleted_at)));
      // No account, so no code was sent to it.
      if (!found) throw new HttpError(401, 'code_expired');
      const problem = rules.passwordProblem(body.password, found.phone);
      if (problem) throw new HttpError(400, problem);
      const hash = await hashPassword(body.password);
      const result = await db.transaction(async (tx) => {
        const code = await takeEmailCode(tx, jwtSecret, { email: body.email, purpose: 'reset_password', code: body.code, userId: found.id }, t);
        if ('error' in code) return code;
        await setPassword(tx, found.id, hash, t);
        return { user: iso(await promoteIfAdminPhone(tx, found, adminPhones, t)) };
      });
      return signedIn(c, result);
    }
    const problem = rules.passwordProblem(body.password, body.phone);
    if (problem) throw new HttpError(400, problem);
    const hash = await hashPassword(body.password);
    const result = await db.transaction(async (tx) => {
      const code = await takeCode(tx, jwtSecret, body.phone, body.code, t);
      if ('error' in code) return code;
      let [user] = await tx
        .select()
        .from(s.users)
        .where(and(eq(s.users.phone, body.phone), isNull(s.users.deleted_at)));
      if (!user) return { error: 'code_invalid' as const };
      await setPassword(tx, user.id, hash, t);
      user = await promoteIfAdminPhone(tx, user, adminPhones, t);
      await tx.update(s.login_codes).set({ consumed_at: new Date(t) }).where(eq(s.login_codes.id, code.id));
      return { user: iso(user) };
    });
    return signedIn(c, result);
  });

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Refusal =
  | 'code_expired'
  | 'code_invalid'
  | 'too_many_attempts'
  | 'try_later'
  | 'profile_required'
  | 'wrong_password'
  | 'password_not_set'
  | 'password_too_short'
  | 'password_too_simple'
  | 'phone_taken'
  | 'email_taken';

const REFUSAL_STATUS: Record<Refusal, ContentfulStatusCode> = {
  code_expired: 401,
  code_invalid: 401,
  wrong_password: 401,
  too_many_attempts: 429,
  try_later: 429,
  profile_required: 409,
  password_not_set: 409,
  phone_taken: 409,
  email_taken: 409,
  password_too_short: 400,
  password_too_simple: 400,
};

// Refusals are returned from the transaction, not thrown, so what it counted
// (a wrong code, a wrong password) is saved.
async function signedIn(c: Context<AppEnv>, result: { error: Refusal } | { error?: undefined; user: User }) {
  if (result.error) throw new HttpError(REFUSAL_STATUS[result.error], result.error);
  return c.json<LoginResponse>({ token: await signToken(result.user.id, c.var.deps.jwtSecret), user: result.user });
}

/**
 * The phone's latest unused code, if `code` is it: by SMS (verify-code) or
 * from an admin (reset-password). A wrong code is counted against it.
 */
async function takeCode(tx: Tx, secret: string, phoneNumber: string, code: string, t: number) {
  const [row] = await tx
    .select()
    .from(s.login_codes)
    .where(and(eq(s.login_codes.phone, phoneNumber), isNull(s.login_codes.consumed_at)))
    .orderBy(desc(s.login_codes.created_at))
    .limit(1)
    .for('update');
  if (!row || row.expires_at.getTime() <= t) return { error: 'code_expired' as const };
  // Read after the lock, so wrong codes sent at once each see the others.
  if ((await phoneDay(tx, phoneNumber, t)).failed >= MAX_FAILED_PER_DAY) return { error: 'try_later' as const };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'too_many_attempts' as const };
  if (!sameHash(row.code_hash, hashCode(secret, phoneNumber, code))) {
    await tx.update(s.login_codes).set({ attempts: row.attempts + 1 }).where(eq(s.login_codes.id, row.id));
    return { error: 'code_invalid' as const };
  }
  return row;
}

/** A number in ADMIN_PHONES (the first admin, without database access) becomes an admin when it signs in. */
async function promoteIfAdminPhone(tx: Tx, user: typeof s.users.$inferSelect, adminPhones: string[] | undefined, t: number) {
  if (!adminPhones?.includes(user.phone) || user.role === 'admin') return user;
  await tx.insert(s.admin_actions).values({
    id: newId(),
    actor_id: null,
    action: 'change_role',
    target_id: user.id,
    details: { name: user.full_name, from: user.role, to: 'admin', via: 'ADMIN_PHONES' },
    created_at: new Date(t),
  });
  const [admin] = await tx.update(s.users).set({ role: 'admin' }).where(eq(s.users.id, user.id)).returning();
  return admin;
}

/** Who is signing in: by the email address if what was typed has an @, otherwise by the phone number. null = neither. */
function signInWho(body: { login: string } | { phone: string }): { email: string } | { phone: string } | null {
  if ('phone' in body) return { phone: body.phone };
  if (body.login.includes('@')) {
    const address = rules.cleanEmail(body.login);
    return address ? { email: address } : null;
  }
  const number = rules.libyanMobile(body.login);
  return number ? { phone: number } : null;
}

/** A new password, which also clears the count of wrong ones. */
async function setPassword(tx: Tx, userId: string, hash: string, t: number) {
  await tx
    .insert(s.user_passwords)
    .values({ user_id: userId, hash, updated_at: new Date(t) })
    .onConflictDoUpdate({ target: s.user_passwords.user_id, set: { hash, failed_count: 0, failed_since: null, updated_at: new Date(t) } });
}

/** Wrong passwords counted in the day since the first of them. */
function failuresToday(pw: typeof s.user_passwords.$inferSelect, t: number) {
  return pw.failed_since && t - pw.failed_since.getTime() < DAY_MS ? pw.failed_count : 0;
}

/**
 * A one-time code for a password reset, made by an admin (admin.ts). It
 * replaces the phone's earlier unused codes and lasts a day.
 */
export async function issueResetCode(tx: Tx, secret: string, phoneNumber: string, adminId: string, t: number) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await tx
    .update(s.login_codes)
    .set({ consumed_at: new Date(t) })
    .where(and(eq(s.login_codes.phone, phoneNumber), isNull(s.login_codes.consumed_at)));
  const expires = new Date(t + RESET_CODE_HOURS * HOUR_MS);
  await tx.insert(s.login_codes).values({
    id: newId(),
    phone: phoneNumber,
    code_hash: hashCode(secret, phoneNumber, code),
    expires_at: expires,
    created_at: new Date(t),
    issued_by: adminId,
  });
  return { code, expires_at: expires.toISOString() };
}
