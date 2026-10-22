// npm run make-admin -- +218912345678
// Gives the admin role to the person who signed up with this phone number
// (they sign up in the app first). This is how the first admin is made on a
// real server; after that, admins change roles in the admin panel.
// With PGlite, stop `npm run dev` first.

import { randomUUID } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { openDatabase } from '../src/db/client';
import * as s from '../src/db/schema';
import { env } from '../src/env';

const phone = process.argv[2] ?? '';
if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
  console.error('Usage: npm run make-admin -- +218912345678');
  process.exit(1);
}

const conn = openDatabase({ url: env.databaseUrl, dataDir: env.pgliteDir });
await conn.migrate();
const [user] = await conn.db
  .select()
  .from(s.users)
  .where(and(eq(s.users.phone, phone), isNull(s.users.deleted_at)));

if (!user) {
  console.error(`No account with ${phone}. Sign up in the app with this number first.`);
  process.exitCode = 1;
} else if (user.role === 'admin') {
  console.log(`${user.full_name} is already an admin.`);
} else {
  await conn.db.transaction(async (tx) => {
    await tx.update(s.users).set({ role: 'admin' }).where(eq(s.users.id, user.id));
    await tx.insert(s.admin_actions).values({
      id: randomUUID(),
      actor_id: null,
      action: 'change_role',
      target_id: user.id,
      details: { name: user.full_name, from: user.role, to: 'admin', via: 'command line' },
      created_at: new Date(),
    });
  });
  console.log(`${user.full_name} is now an admin.`);
}
await conn.close();
