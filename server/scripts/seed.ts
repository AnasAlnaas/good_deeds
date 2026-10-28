// npm run db:seed              → empties the development (PGlite) database and loads the demo data
// npm run db:seed -- --reference → adds only branches and levels (safe in production)
// Stop `npm run dev` first when using PGlite: only one process may open its folder.

import { openDatabase } from '../src/db/client';
import { clearAll, seedDemo, seedReference } from '../src/db/seed';
import { env } from '../src/env';

const referenceOnly = process.argv.includes('--reference');
// The demo data empties the database first and adds an admin whose phone is in the code.
if (!env.mayLoadDemoData && !referenceOnly) {
  console.error('Refusing to load demo data into a DATABASE_URL or production database. Use --reference.');
  process.exit(1);
}

const conn = openDatabase({ url: env.databaseUrl, dataDir: env.pgliteDir });
await conn.migrate();
if (referenceOnly) {
  await seedReference(conn.db);
  console.log('Reference data loaded: branches, levels.');
} else {
  await clearAll(conn.db);
  await seedDemo(conn.db, Date.now());
  console.log(`Demo data loaded into the ${conn.kind} database.`);
}
await conn.close();
