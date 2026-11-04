// Empties a database: every table, enum and the record of applied migrations
// go, so the migrations make it again exactly as the code expects. Used by
// `npm run db:reset` and by a production deploy told to (scripts/migrate.ts).

import { sql } from 'drizzle-orm';

import type { Connection } from './client';

async function count(conn: Connection, table: string) {
  try {
    const r = (await conn.db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as { rows: { n: number }[] };
    return r.rows[0].n;
  } catch {
    return 0; // no such table yet
  }
}

/** What is in the database, for the log. */
export async function contents(conn: Connection) {
  return `${await count(conn, 'users')} accounts, ${await count(conn, 'events')} events, ${await count(conn, 'attendance')} attendance records`;
}

export async function emptyDatabase(conn: Connection) {
  await conn.db.execute(sql`drop schema if exists drizzle cascade`);
  await conn.db.execute(sql`drop schema public cascade`);
  await conn.db.execute(sql`create schema public`);
}
