// Runs the API as a normal Node.js server: `npm run dev` on a laptop, or
// `npm start` on the VPS. In development with no DATABASE_URL, the database
// is PGlite in .data/ and is filled with the demo data the first time.

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { openDatabase } from './db/client';
import { isEmpty, seedDemo } from './db/seed';
import { env } from './env';
import type { AppDeps } from './http';
import { closeDueAndNotify } from './notify';
import { consolePush, expoPush } from './push';

const conn = openDatabase({ url: env.databaseUrl, dataDir: env.pgliteDir });
await conn.migrate();
if (!env.isProduction && (await isEmpty(conn.db))) {
  await seedDemo(conn.db, Date.now());
  console.log('Empty development database: filled it with the demo data.');
}

const deps: AppDeps = {
  db: conn.db,
  now: Date.now,
  jwtSecret: env.jwtSecret,
  sendLoginCode:
    env.loginCodeDelivery === 'console'
      ? async (phone, code) => console.log(`[sign-in code] ${phone}: ${code}`)
      : null,
  sendPush: env.pushDelivery === 'expo' ? expoPush(env.expoAccessToken) : env.pushDelivery === 'console' ? consolePush : null,
  timeZone: env.timeZone,
  runLater: (task) => void task().catch((err) => console.error('background task failed', err)),
  cronSecret: env.cronSecret,
  corsOrigins: env.corsOrigins,
};
const app = createApp(deps);

// Listening on every network interface lets a phone on the same Wi-Fi reach the laptop.
const server = serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Good Deeds API on http://localhost:${info.port}/api/health (${conn.kind} database)`);
});

// The scheduled job: close attendance left open when an event ends.
const timer = setInterval(() => {
  closeDueAndNotify(deps).catch((err) => console.error('auto-close failed', err));
}, 60_000);

function shutdown() {
  clearInterval(timer);
  server.close();
  conn.close().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
