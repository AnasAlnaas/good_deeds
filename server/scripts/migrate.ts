// npm run db:migrate → applies the migrations in drizzle/ to DATABASE_URL (in
// server/.env or the environment). The Worker does not migrate on its own, so
// run this before deploying a version with a new migration.

import { openDatabase } from '../src/db/client';
import { env } from '../src/env';

if (!env.databaseUrl) {
  console.error('Set DATABASE_URL (the hosted database, e.g. Neon) in server/.env first.');
  process.exit(1);
}
const conn = openDatabase({ url: env.databaseUrl });
await conn.migrate();
console.log('Migrations applied.');
await conn.close();
