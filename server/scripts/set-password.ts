// npm run set-password -- +218912345678
// Sets a new password for the account with this phone number, asked for here
// and never shown or kept in the shell's history. For an admin who cannot reset
// it in the app (no confirmed email) and has no other admin to give them a
// reset code. It uses DATABASE_URL in server/.env, so it reaches whichever
// database that names: for the live one, Neon's address. With PGlite, stop
// `npm run dev` first. The change is written to the admins' audit log.

import { randomUUID } from 'node:crypto';
import { stdin, stdout } from 'node:process';

import { and, eq, isNull } from 'drizzle-orm';

import { passwordProblem } from '../../shared/rules';
import { describeDatabase, openDatabase } from '../src/db/client';
import * as s from '../src/db/schema';
import { env, prefixedEnv } from '../src/env';
import { hashPassword } from '../src/password';

const phone = process.argv[2] ?? '';
if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
  console.error('Usage: npm run set-password -- +218912345678');
  process.exit(1);
}

// What was typed past the end of the last line (several lines may arrive at once).
let pending = '';

/** Reads a line without showing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    let typed = '';
    const take = (text: string) => {
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '\r' || ch === '\n') {
          // A Windows line end is two characters: skip the second.
          pending = text.slice(ch === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1);
          return true;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') typed = typed.slice(0, -1);
        else typed += ch;
      }
      return false;
    };
    const finish = () => {
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(typed);
    };
    const left = pending;
    pending = '';
    if (take(left)) return finish();
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      if (!take(chunk)) return;
      stdin.off('data', onData);
      finish();
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

// Neon's direct address when it is there, as for the migrations (scripts/migrate.ts).
const url = prefixedEnv('DATABASE_URL_UNPOOLED') || env.databaseUrl;
console.log(`Using ${describeDatabase(url, env.pgliteDir)}.`);
const conn = openDatabase({ url, dataDir: env.pgliteDir });
await conn.migrate();
const [user] = await conn.db
  .select()
  .from(s.users)
  .where(and(eq(s.users.phone, phone), isNull(s.users.deleted_at)));

if (!user) {
  console.error(`No account with ${phone}.`);
  process.exitCode = 1;
} else {
  console.log(`Account: ${user.full_name} (${user.role})`);
  const password = await askHidden('New password: ');
  const again = await askHidden('The same again: ');
  const problem = passwordProblem(password, phone);
  if (password !== again) {
    console.error('The two do not match; nothing changed.');
    process.exitCode = 1;
  } else if (problem) {
    console.error(`Not accepted (${problem}): at least 8 characters, not one character repeated or a run like 12345678, and without the phone number. Nothing changed.`);
    process.exitCode = 1;
  } else {
    const hash = await hashPassword(password);
    const now = new Date();
    await conn.db.transaction(async (tx) => {
      // The count of wrong passwords starts again, so a locked account opens too.
      await tx
        .insert(s.user_passwords)
        .values({ user_id: user.id, hash, updated_at: now })
        .onConflictDoUpdate({ target: s.user_passwords.user_id, set: { hash, failed_count: 0, failed_since: null, updated_at: now } });
      await tx.insert(s.admin_actions).values({
        id: randomUUID(),
        actor_id: null,
        action: 'issue_reset_code',
        target_id: user.id,
        details: { name: user.full_name, via: 'command line: set-password' },
        created_at: now,
      });
    });
    console.log(`The password of ${user.full_name} is set. Sign in with ${phone} and it.`);
  }
}
await conn.close();
