// Runs the API on Cloudflare Workers (wrangler.jsonc; docs/deploy-cloudflare.md).
// The same app as src/node.ts, with what a Worker gives instead of a server:
// - the database through Hyperdrive (Cloudflare's pooled connection to Postgres),
//   one connection per request, closed once the request and its follow-up work end;
// - work after the answer (notifications) through ctx.waitUntil;
// - the auto-close job from a Cron Trigger instead of a timer;
// - the caller's address from Cloudflare's CF-Connecting-IP header.
// Migrations do not run here: `npm run db:migrate` runs them from a laptop.

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { createApp } from './app';
import type { Database } from './db/client';
import * as schema from './db/schema';
import type { AppDeps } from './http';
import { closeDueAndNotify } from './notify';
import { consolePush, expoPush } from './push';

// The parts of the Workers runtime used here (no @cloudflare/workers-types:
// its globals clash with Node's, which the rest of the server is checked against).
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** wrangler.jsonc: `vars`, secrets (`wrangler secret put`) and the Hyperdrive binding. */
interface Env {
  HYPERDRIVE: { connectionString: string };
  JWT_SECRET: string;
  /** `console` writes sign-in codes to the Worker's logs (testing only); `none` refuses sign-in until SMS is set up. */
  LOGIN_CODE_DELIVERY?: 'console' | 'none';
  PUSH_DELIVERY?: 'expo' | 'console' | 'none';
  EXPO_ACCESS_TOKEN?: string;
  TIME_ZONE?: string;
  /** Comma-separated: other web addresses allowed to call the API. Empty = any origin. */
  CORS_ORIGINS?: string;
}

const JWT_SECRET_MIN = 32;

// Sign-in codes sent per network address. It lives as long as this Worker
// instance, which Cloudflare restarts often and runs several of: a looser limit
// than on one server. The limits per phone number are in the database.
const codesByAddress = new Map<string, number[]>();

/** One request's (or one cron run's) database and dependencies; `finish` closes them once all work is done. */
async function open(env: Env, ctx: ExecutionContext) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < JWT_SECRET_MIN) {
    throw new Error(`JWT_SECRET must be set, at least ${JWT_SECRET_MIN} characters (wrangler secret put JWT_SECRET).`);
  }
  const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  const db = drizzle(client, { schema }) as unknown as Database;
  const later: Promise<void>[] = [];
  const push = env.PUSH_DELIVERY ?? 'expo';

  const deps: AppDeps = {
    db,
    now: Date.now,
    jwtSecret: env.JWT_SECRET,
    sendLoginCode:
      env.LOGIN_CODE_DELIVERY === 'console' ? async (phone, code) => console.log(`[sign-in code] ${phone}: ${code}`) : null,
    sendPush: push === 'expo' ? expoPush(env.EXPO_ACCESS_TOKEN) : push === 'console' ? consolePush : null,
    timeZone: env.TIME_ZONE || 'Africa/Tripoli',
    runLater: (task) => {
      later.push(task().catch((err) => console.error('background task failed', err)));
    },
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    clientIp: (c) => c.req.header('CF-Connecting-IP'),
    codesByAddress,
  };

  const finish = () => ctx.waitUntil(Promise.allSettled(later).then(() => client.end()));
  return { deps, finish };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { deps, finish } = await open(env, ctx);
    try {
      return await createApp(deps).fetch(request);
    } finally {
      finish();
    }
  },

  // Cron Trigger (wrangler.jsonc): close attendance left open when its event ended.
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    const { deps, finish } = await open(env, ctx);
    try {
      const closed = await closeDueAndNotify(deps);
      if (closed) console.log(`auto-closed ${closed} attendance record(s)`);
    } finally {
      finish();
    }
  },
};
