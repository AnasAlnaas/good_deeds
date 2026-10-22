// What the check scripts share: the API on a fresh in-memory database with
// the demo data and a fixed clock, sign-in codes and notifications captured
// instead of sent (a push token with "gone" in it acts like an uninstalled
// app), and helpers that print ✓ / ✗ lines.

import { buildSeed } from '../../shared/demo-seed';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/client';
import { DEV_ADMIN, seedDemo } from '../src/db/seed';
import type { PushMessage } from '../src/push';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { status: number; body: any };

export async function startHarness(start: number) {
  let clock = start;
  let failed = 0;
  const sentCodes = new Map<string, string>();
  const pushes: PushMessage[] = [];
  const background: Promise<void>[] = [];

  const conn = openDatabase({});
  await conn.migrate();
  await seedDemo(conn.db, start);
  const seed = buildSeed(start);
  const people = [...seed.users, DEV_ADMIN];
  const app = createApp({
    db: conn.db,
    now: () => clock,
    jwtSecret: 'check-secret',
    sendLoginCode: async (phone, code) => void sentCodes.set(phone, code),
    sendPush: async (messages) => {
      pushes.push(...messages);
      return messages.map((m) => (m.to.includes('gone') ? 'device_not_registered' : 'ok'));
    },
    timeZone: 'Africa/Tripoli',
    runLater: (task) => void background.push(task()),
    corsOrigins: [],
  });

  async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** A request whose answer is not JSON (a photo). `path` is the full path, as users.avatar_url gives it. */
  async function raw(path: string, token?: string) {
    const res = await app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: res.status, type: res.headers.get('Content-Type'), bytes: Buffer.from(await res.arrayBuffer()) };
  }

  async function expectError(name: string, code: string, request: Promise<Res>) {
    const r = await request;
    if (r.body?.error === code) console.log(`✓ ${name} → ${r.status} ${code}`);
    else {
      console.log(`✗ ${name}: got ${r.status} ${JSON.stringify(r.body)}, expected ${code}`);
      failed++;
    }
  }

  async function expectOk(name: string, request: Promise<Res>) {
    const r = await request;
    if (r.status < 300) console.log(`✓ ${name} → ${r.status}`);
    else {
      console.log(`✗ ${name}: got ${r.status} ${JSON.stringify(r.body)}`);
      failed++;
    }
    return r.body;
  }

  function expectEqual(name: string, actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) console.log(`✓ ${name} = ${JSON.stringify(actual)}`);
    else {
      console.log(`✗ ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      failed++;
    }
  }

  const tokens = new Map<string, string>();
  /** Signs in as one of the demo people (or the development admin), once. */
  async function login(userId: string) {
    if (!tokens.has(userId)) {
      const phone = people.find((u) => u.id === userId)!.phone;
      await call('POST', '/auth/request-code', undefined, { phone });
      const r = await call('POST', '/auth/verify-code', undefined, { phone, code: sentCodes.get(phone) });
      if (r.status !== 200) throw new Error(`sign-in for ${userId} failed: ${JSON.stringify(r.body)}`);
      tokens.set(userId, r.body.token);
    }
    return tokens.get(userId)!;
  }

  return {
    conn,
    seed,
    sentCodes,
    pushes,
    call,
    raw,
    login,
    expectError,
    expectOk,
    expectEqual,
    /** Waits for the work that runs after a response (notifications). */
    settle: () => Promise.all(background.splice(0)),
    clock: () => clock,
    setClock: (t: number) => void (clock = t),
    async done() {
      await conn.close();
      console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
      process.exit(failed ? 1 : 0);
    },
  };
}
