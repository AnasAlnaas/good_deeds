// npm run db:migrate → applies the migrations in drizzle/ to the database, then
// adds the reference data (the levels) if it is missing. Vercel runs it on every
// build (vercel.json), so a deploy brings its own migrations; from a laptop it
// uses DATABASE_URL in server/.env. Neon's direct address (DATABASE_URL_UNPOOLED,
// which Vercel's Neon integration sets) is preferred: migrations need a session.

import { openDatabase } from '../src/db/client';
import { contents, emptyDatabase } from '../src/db/reset';
import { seedReference } from '../src/db/seed';
import { env, prefixedEnv } from '../src/env';

// Preview deployments (every pushed branch) get the same database settings as
// production, so only a production deploy may change the database: a branch's
// migration would otherwise reach it before review, and a branch still being
// worked on may change that migration again.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
  console.log(`Not migrating: this is a ${process.env.VERCEL_ENV} deployment; production deploys apply the migrations.`);
  process.exit(0);
}

const url = prefixedEnv('DATABASE_URL_UNPOOLED') || env.databaseUrl;
if (!url) {
  console.error('Set DATABASE_URL (the hosted database, e.g. Neon) in server/.env first.');
  process.exit(1);
}
const conn = openDatabase({ url });

// Emptying the database from a deploy, as its address cannot be read out of
// Vercel: set RESET_DATABASE_AT_COMMIT to the full commit id of one production
// deploy, and that deploy alone empties it before migrating. Any later deploy
// has another commit id, so a setting left behind never fires again; remove it.
const resetAt = process.env.RESET_DATABASE_AT_COMMIT;
if (resetAt && process.env.VERCEL_ENV === 'production' && resetAt === process.env.VERCEL_GIT_COMMIT_SHA) {
  console.log(`RESET_DATABASE_AT_COMMIT is this commit: emptying the database (${await contents(conn)}).`);
  await emptyDatabase(conn);
}

await conn.migrate();
await seedReference(conn.db);
console.log(`Migrations applied; reference data in place (${await contents(conn)}).`);
await conn.close();
