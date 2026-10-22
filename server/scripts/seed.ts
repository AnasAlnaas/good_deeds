// npm run db:seed              → empties the development database and loads the demo data
// npm run db:seed -- --reference → adds only branches, pillars and levels (safe in production)
// Stop `npm run dev` first when using PGlite: only one process may open its folder.

import { openDatabase } from '../src/db/client';
import { clearAll, seedDemo, seedReference } from '../src/db/seed';
import { env } from '../src/env';

const referenceOnly = process.argv.includes('--reference');
if (env.isProduction && !referenceOnly) {
  console.error('Refusing to load demo data in production. Use --reference.');
  process.exit(1);
}

const conn = openDatabase({ url: env.databaseUrl, dataDir: env.pgliteDir });
await conn.migrate();
if (referenceOnly) {
  await seedReference(conn.db);
  console.log('Reference data loaded: branches, pillars, levels.');
} else {
  await clearAll(conn.db);
  await seedDemo(conn.db, Date.now());
  console.log(`Demo data loaded into the ${conn.kind} database.`);
}
await conn.close();
