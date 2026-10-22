// Fills the database. `seedDemo` loads the same demo data as the offline app
// (development and tests). `seedReference` loads only what production needs:
// the branches of faith, their pillars, and the levels.

import { sql } from 'drizzle-orm';

import { buildSeed } from '../../../shared/demo-seed';
import type { Database } from './client';
import { dated } from './rows';
import * as s from './schema';

const ALL_TABLES = [
  'push_tokens', 'login_codes', 'points_ledger', 'attendance', 'term_acceptances', 'registrations', 'event_terms',
  'event_branches', 'event_organizers', 'events', 'levels', 'branch_pillars', 'branches', 'users',
];

/** Deletes every row. Development and tests only. */
export async function clearAll(db: Database) {
  await db.execute(sql.raw(`truncate table ${ALL_TABLES.join(', ')} cascade`));
}

export async function seedReference(db: Database) {
  const d = buildSeed(Date.now());
  await db.transaction(async (tx) => {
    await tx.insert(s.branches).values(d.branches).onConflictDoNothing();
    await tx.insert(s.branch_pillars).values(d.branch_pillars).onConflictDoNothing();
    await tx.insert(s.levels).values(d.levels).onConflictDoNothing();
  });
}

/** The demo's people and events, with times relative to `nowMs` (one event is always running). */
export async function seedDemo(db: Database, nowMs: number) {
  const d = buildSeed(nowMs);
  await db.transaction(async (tx) => {
    await tx.insert(s.users).values(d.users.map(dated));
    await tx.insert(s.branches).values(d.branches);
    await tx.insert(s.branch_pillars).values(d.branch_pillars);
    await tx.insert(s.levels).values(d.levels);
    await tx.insert(s.events).values(d.events.map(dated));
    await tx.insert(s.event_organizers).values(d.event_organizers);
    await tx.insert(s.event_branches).values(d.event_branches);
    await tx.insert(s.event_terms).values(d.event_terms.map(dated));
    await tx.insert(s.registrations).values(d.registrations.map(dated));
    await tx.insert(s.term_acceptances).values(d.term_acceptances.map(dated));
    await tx.insert(s.attendance).values(d.attendance.map(dated));
    if (d.points_ledger.length) await tx.insert(s.points_ledger).values(d.points_ledger.map(dated));
  });
}

export async function isEmpty(db: Database) {
  const rows = await db.select({ id: s.users.id }).from(s.users).limit(1);
  return rows.length === 0;
}
