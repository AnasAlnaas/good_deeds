// Opens the database. With DATABASE_URL it is a real Postgres server (the VPS
// or a hosted one). Without it, it is PGlite: Postgres compiled to run inside
// Node, kept in a folder (development) or in memory (tests). Same SQL, same
// migrations, nothing to install.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';

import * as schema from './schema';

/** A database or an open transaction: both run the same queries. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Connection {
  kind: 'postgres' | 'pglite';
  db: Database;
  /** The Postgres connections (absent for PGlite), for a host that manages idle ones (Vercel). */
  pool?: pg.Pool;
  /** Applies the migrations in drizzle/ that have not run yet. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function openDatabase(opts: { url?: string; dataDir?: string }): Connection {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url });
    const db = drizzlePg(pool, { schema });
    return { kind: 'postgres', db, pool, migrate: () => migratePg(db, { migrationsFolder }), close: () => pool.end() };
  }
  let unlock = () => {};
  if (opts.dataDir) {
    // PGlite creates its own folder but not the ones above it (e.g. .data/ on a fresh checkout).
    mkdirSync(dirname(opts.dataDir), { recursive: true });
    unlock = lockFolder(opts.dataDir);
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    kind: 'pglite',
    db,
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close().finally(unlock),
  };
}

// Unlike a Postgres server, PGlite is a folder that only one process may open:
// a second one (`npm run db:seed` while `npm run dev` runs) would corrupt it.
// A lock file next to the folder holds the owner's process id.
function lockFolder(dataDir: string) {
  const lockPath = `${dataDir}.lock`;
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    const owner = Number(readFileSync(lockPath, 'utf8'));
    if (owner && owner !== process.pid && isRunning(owner)) {
      throw new Error(
        `The development database (${dataDir}) is open in another process (pid ${owner}). ` +
          'Stop that server first, e.g. the `npm run dev` window.',
      );
    }
    writeFileSync(lockPath, String(process.pid)); // left behind by a process that has ended
  }
  const unlock = () => rmSync(lockPath, { force: true });
  process.once('exit', unlock);
  return unlock;
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}
