// npm run db:reset -- --yes → EMPTIES the hosted database: every account,
// event, attendance record, report and photo is deleted, the tables are made
// again from the migrations, and the reference data (the levels) is added.
// For starting the beta clean, or for a database whose migrations went wrong.
// It cannot be undone. It reads DATABASE_URL_UNPOOLED (or DATABASE_URL), like
// `npm run db:migrate`, from server/.env or the environment. On Vercel, where
// the address cannot be read, a deploy can do it instead (scripts/migrate.ts).
//
// After it, the first admin signs up again: put their number in ADMIN_PHONES
// on the server first (docs/deploy-vercel.md, step 5).

import { openDatabase } from '../src/db/client';
import { contents, emptyDatabase } from '../src/db/reset';
import { seedReference } from '../src/db/seed';
import { env, prefixedEnv } from '../src/env';

const url = prefixedEnv('DATABASE_URL_UNPOOLED') || env.databaseUrl;
if (!url) {
  console.error('Set DATABASE_URL (the hosted database) in server/.env first. For the development database, use npm run db:seed.');
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error('This deletes everything in the database. Run it again with --yes to go ahead: npm run db:reset -- --yes');
  process.exit(1);
}

const conn = openDatabase({ url });
console.log(`Before: ${await contents(conn)}.`);
await emptyDatabase(conn);
await conn.migrate();
await seedReference(conn.db);
console.log(`After: ${await contents(conn)}. The database is empty and up to date.`);
await conn.close();
