// npm run db:migrate → applies the migrations in drizzle/ to the database, then
// adds the reference data (the levels) if it is missing. Vercel runs it on every
// build (vercel.json), so a deploy brings its own migrations; from a laptop it
// uses DATABASE_URL in server/.env. Neon's direct address (DATABASE_URL_UNPOOLED,
// which Vercel's Neon integration sets) is preferred: migrations need a session.

import { openDatabase } from '../src/db/client';
import { seedReference } from '../src/db/seed';
import { env, prefixedEnv } from '../src/env';

const url = prefixedEnv('DATABASE_URL_UNPOOLED') || env.databaseUrl;
if (!url) {
  console.error('Set DATABASE_URL (the hosted database, e.g. Neon) in server/.env first.');
  process.exit(1);
}
const conn = openDatabase({ url });
await conn.migrate();
await seedReference(conn.db);
console.log('Migrations applied; reference data in place.');
await conn.close();
