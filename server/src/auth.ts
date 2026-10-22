// Who is calling. After sign-in the app holds a token (a signed JWT saying
// "this is user X") and sends it on every request as
// `Authorization: Bearer <token>`. The user is loaded fresh from the database
// each time, so a role change or a deleted account takes effect at once.

import { createMiddleware } from 'hono/factory';
import { sign, verify } from 'hono/jwt';

import { findUser } from './db/queries';
import { type AppEnv, HttpError } from './http';
import { closeDueAndNotify } from './notify';

const TOKEN_DAYS = 30;

export function signToken(userId: string, secret: string) {
  // Token times use the real clock, not the app clock (which tests may fix).
  const nowSec = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iat: nowSec, exp: nowSec + TOKEN_DAYS * 86_400 }, secret, 'HS256');
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const { db, jwtSecret } = c.var.deps;
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'unauthorized');
  let userId: unknown;
  try {
    userId = (await verify(token, jwtSecret, 'HS256')).sub;
  } catch {
    throw new HttpError(401, 'unauthorized');
  }
  const user = typeof userId === 'string' ? await findUser(db, userId) : undefined;
  if (!user || user.deleted_at) throw new HttpError(401, 'unauthorized');
  c.set('user', user);
  await closeDueAndNotify(c.var.deps);
  await next();
});
