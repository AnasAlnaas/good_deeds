// npm run cf:db → a throwaway Postgres for `npm run cf:dev` (the Worker on this
// computer): PGlite in memory with the demo data, served on 127.0.0.1:5433 (the
// `localConnectionString` in wrangler.jsonc). Stop it with Ctrl+C; nothing is kept.

import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../src/db/schema';
import { seedDemo } from '../src/db/seed';

const PORT = 5433;

const pglite = await PGlite.create();
const db = drizzle(pglite, { schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
await seedDemo(db, Date.now());

const server = new PGLiteSocketServer({ db: pglite, port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`Demo Postgres on 127.0.0.1:${PORT} for \`npm run cf:dev\`. Ctrl+C to stop.`);

process.on('SIGINT', async () => {
  await server.stop();
  await pglite.close();
  process.exit(0);
});
