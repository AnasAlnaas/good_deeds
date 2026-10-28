// Runs the API on Vercel (docs/deploy-vercel.md). Vercel finds this file, sees
// it imports Hono, and serves its default export as a Vercel Function. The same
// app as src/node.ts, with what Vercel gives instead of a long-running server:
// - one database pool per running instance, its idle connections closed before
//   Vercel pauses the instance (attachDatabasePool);
// - work after the answer (notifications) through waitUntil;
// - the auto-close job from Vercel Cron (vercel.json) and before every signed-in
//   request, instead of a timer.
// Migrations do not run here: `npm run db:migrate` runs them from a laptop.

import { attachDatabasePool, waitUntil } from '@vercel/functions';

import { createApp } from './src/create-app';
import { openDatabase } from './src/db/client';
import { env, jwtSecret } from './src/env';
import type { AppDeps } from './src/http';
import { consolePush, expoPush } from './src/push';

const conn = openDatabase({ url: env.databaseUrl, dataDir: env.pgliteDir });
if (conn.pool) attachDatabasePool(conn.pool);

const deps: AppDeps = {
  db: conn.db,
  now: Date.now,
  jwtSecret: jwtSecret(),
  sendLoginCode:
    env.loginCodeDelivery === 'console' ? async (phone, code) => console.log(`[sign-in code] ${phone}: ${code}`) : null,
  sendPush: env.pushDelivery === 'expo' ? expoPush(env.expoAccessToken) : env.pushDelivery === 'console' ? consolePush : null,
  timeZone: env.timeZone,
  runLater: (task) => waitUntil(task().catch((err) => console.error('background task failed', err))),
  cronSecret: env.cronSecret,
  corsOrigins: env.corsOrigins,
  // Vercel sets X-Forwarded-For itself (a client cannot forge it), so TRUST_PROXY=1 there.
  clientIp: (c) => (env.trustProxy ? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() : undefined),
};

export default createApp(deps);
