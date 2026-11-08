// npm run change-phone -- +218945422671 +218945244671
// Moves an account to another phone number: for one made with a mistyped
// number. Everything stays with the account (email, password, points, events);
// only the number it signs in with changes. Refused if another account has the
// new number. Uses DATABASE_URL in server/.env, like make-admin; with PGlite,
// stop `npm run dev` first.

import { and, eq, isNull } from 'drizzle-orm';

import { describeDatabase, openDatabase } from '../src/db/client';
import * as s from '../src/db/schema';
import { env, prefixedEnv } from '../src/env';

const [from, to] = [process.argv[2] ?? '', process.argv[3] ?? ''];
const international = /^\+[1-9]\d{7,14}$/;
if (!international.test(from) || !international.test(to) || from === to) {
  console.error('Usage: npm run change-phone -- +218<wrong number> +218<right number>');
  process.exit(1);
}

const url = prefixedEnv('DATABASE_URL_UNPOOLED') || env.databaseUrl;
console.log(`Using ${describeDatabase(url, env.pgliteDir)}.`);
const conn = openDatabase({ url, dataDir: env.pgliteDir });
await conn.migrate();

const active = (phone: string) =>
  conn.db
    .select()
    .from(s.users)
    .where(and(eq(s.users.phone, phone), isNull(s.users.deleted_at)));

const [user] = await active(from);
const [taken] = await active(to);
if (!user) {
  console.error(`No account with ${from}.`);
  process.exitCode = 1;
} else if (taken) {
  console.error(`${to} already belongs to another account (${taken.full_name}); nothing changed.`);
  process.exitCode = 1;
} else {
  await conn.db.update(s.users).set({ phone: to }).where(eq(s.users.id, user.id));
  console.log(`${user.full_name} now signs in with ${to} (was ${from}).`);
}
await conn.close();
