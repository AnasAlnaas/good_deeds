// Tries to break the rules through the API, as mobile/scripts/check-rules.ts
// does with the offline demo: the same cheats, sent as HTTP requests to the
// server running on a fresh in-memory database with a fixed clock. Every cheat
// must be refused with the same error code. Sign-in, notifications and
// account deletion are checked too.
// Run: npm run check:api

import { eq } from 'drizzle-orm';

import type { EventDetail } from '../../shared/api';
import { buildSeed } from '../../shared/demo-seed';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/client';
import * as s from '../src/db/schema';
import { seedDemo } from '../src/db/seed';
import type { PushMessage } from '../src/push';

const NOW = new Date('2026-10-21T12:00:00').getTime();
let clock = NOW;
const sentCodes = new Map<string, string>();
// Notifications are captured instead of sent; a token with "gone" in it acts like an uninstalled app.
const pushes: PushMessage[] = [];
const background: Promise<void>[] = [];
const settle = () => Promise.all(background.splice(0));

const conn = openDatabase({});
await conn.migrate();
await seedDemo(conn.db, NOW);
const seed = buildSeed(NOW);
const app = createApp({
  db: conn.db,
  now: () => clock,
  jwtSecret: 'check-api-secret',
  sendLoginCode: async (phone, code) => void sentCodes.set(phone, code),
  sendPush: async (messages) => {
    pushes.push(...messages);
    return messages.map((m) => (m.to.includes('gone') ? 'device_not_registered' : 'ok'));
  },
  runLater: (task) => void background.push(task()),
  corsOrigins: [],
});

let failed = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: number; body: any };

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
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
async function login(userId: string) {
  if (!tokens.has(userId)) {
    const phone = seed.users.find((u) => u.id === userId)!.phone;
    await call('POST', '/auth/request-code', undefined, { phone });
    const r = await call('POST', '/auth/verify-code', undefined, { phone, code: sentCodes.get(phone) });
    if (r.status !== 200) throw new Error(`sign-in for ${userId} failed: ${JSON.stringify(r.body)}`);
    tokens.set(userId, r.body.token);
  }
  return tokens.get(userId)!;
}

async function joinFully(token: string, eventId: string) {
  const start = await call('POST', `/events/${eventId}/join`, token);
  if (start.status !== 200) return start;
  const detail: EventDetail = (await call('GET', `/events/${eventId}`, token)).body;
  for (const term of detail.terms) {
    const r = await call('POST', `/events/${eventId}/terms/${term.id}/accept`, token);
    if (r.status !== 200) return r;
  }
  return call('POST', `/events/${eventId}/join/complete`, token);
}

const iso = (ms: number) => new Date(ms).toISOString();
const pushesTo = (token: string) => pushes.filter((p) => p.to === token);
async function tokenOwner(token: string) {
  const [row] = await conn.db.select().from(s.push_tokens).where(eq(s.push_tokens.token, token));
  return row?.user_id ?? null;
}
const TOKEN_AHMAD = 'ExponentPushToken[ahmad-phone]';
const TOKEN_GONE = 'ExponentPushToken[ahmad-old-phone-gone]';
const TOKEN_SHARED = 'ExponentPushToken[family-tablet]';
const TOKEN_F1 = 'ExponentPushToken[f1-phone]';
const TOKEN_NEW = 'ExponentPushToken[new-member-phone]';
const totalOf = async (token: string): Promise<number> => (await call('GET', '/me', token)).body.total_points;

// ---------------------------------------------------------------------------
console.log('\n— signing in');
await expectError('no token', 'unauthorized', call('GET', '/events'));
await expectError('forged token', 'unauthorized', call('GET', '/events', 'not-a-real-token'));
await expectError('phone not in international format', 'invalid_request', call('POST', '/auth/request-code', undefined, { phone: '0912345678' }));

const phoneA = '+218919990001';
await expectOk('request a code', call('POST', '/auth/request-code', undefined, { phone: phoneA }));
await expectError('ask again within a minute', 'code_recently_sent', call('POST', '/auth/request-code', undefined, { phone: phoneA }));
const wrong = sentCodes.get(phoneA) === '000000' ? '111111' : '000000';
for (let i = 1; i <= 5; i++) {
  await expectError(`wrong code, try ${i}`, 'code_invalid', call('POST', '/auth/verify-code', undefined, { phone: phoneA, code: wrong }));
}
await expectError('right code after 5 wrong tries', 'too_many_attempts', call('POST', '/auth/verify-code', undefined, { phone: phoneA, code: sentCodes.get(phoneA) }));

const phoneB = '+218919990002';
await call('POST', '/auth/request-code', undefined, { phone: phoneB });
await expectError('new phone without a profile', 'profile_required', call('POST', '/auth/verify-code', undefined, { phone: phoneB, code: sentCodes.get(phoneB) }));
const signup = await expectOk(
  'new phone with a profile signs up',
  call('POST', '/auth/verify-code', undefined, {
    phone: phoneB,
    code: sentCodes.get(phoneB),
    profile: { full_name: 'سالم التجريبي', gender: 'male', city: 'طرابلس' },
  }),
);
expectEqual('new account is a member', signup.user.role, 'member');
await expectError('the code works only once', 'code_expired', call('POST', '/auth/verify-code', undefined, { phone: phoneB, code: sentCodes.get(phoneB) }));

const ahmad = await login('u_ahmad');
const mariam = await login('u_mariam');
const khaled = await login('u_khaled');
const fatima = await login('u_fatima');

// ---------------------------------------------------------------------------
console.log('\n— events');
const list = (await call('GET', '/events', ahmad)).body;
expectEqual('events listed', list.length, seed.events.length);
expectEqual('women-only event marked not for him', list.find((e: { id: string }) => e.id === 'e04').can_join_category, false);
expectEqual('running event status from the server clock', list.find((e: { id: string }) => e.id === 'e01').status, 'running');

console.log('\n— joining');
await expectError('6th person joins a full event (capacity 5)', 'event_full', joinFully(ahmad, 'e12'));
await expectError('join without accepting the terms', 'terms_incomplete', (async () => {
  await call('POST', '/events/e02/join', ahmad);
  return call('POST', '/events/e02/join/complete', ahmad);
})());
const e02: EventDetail = (await call('GET', '/events/e02', ahmad)).body;
await expectError('accept the last term first', 'term_out_of_order', call('POST', `/events/e02/terms/${e02.terms.at(-1)!.id}/accept`, ahmad));
await expectError('man joins a women-only event', 'gender_not_allowed', call('POST', '/events/e04/join', ahmad));
await expectError('join a finished event', 'event_closed', call('POST', '/events/e13/join', ahmad));
expectEqual('terms not locked before anyone accepts', (await call('GET', '/events/e10', ahmad)).body.terms_locked_at, null);
await expectOk('join with every term accepted in order', joinFully(ahmad, 'e10'));
const e10: EventDetail = (await call('GET', '/events/e10', ahmad)).body;
expectEqual('terms locked after first acceptance', !!e10.terms_locked_at, true);
expectEqual('now counted as joined', [e10.my_registration?.status, e10.joined_count], ['joined', 1]);

// ---------------------------------------------------------------------------
console.log('\n— recording attendance');
const running = seed.events.find((e) => e.id === 'e01')!;
const start = new Date(running.starts_at).getTime();
await expectError('participant records someone else', 'not_organizer', call('POST', '/events/e01/attendance/u_mariam/start', ahmad));
await expectError('supervisor of ANOTHER event records here', 'not_organizer', call('POST', '/events/e01/attendance/u_ahmad/start', fatima));
await expectError('supervisor records himself', 'cannot_record_self', call('POST', '/events/e01/attendance/u_khaled/start', khaled));
await expectError('record someone who never joined', 'not_joined', call('POST', '/events/e01/attendance/u_f5/start', khaled));
await expectError('backdate before the event started', 'start_before_event', call('POST', '/events/e01/attendance/u_ahmad/start', khaled, { at: iso(start - 60_000) }));
await expectError('start time in the future (server clock decides)', 'time_in_future', call('POST', '/events/e01/attendance/u_ahmad/start', khaled, { at: iso(NOW + 60_000) }));
await expectError('time that is not a time', 'invalid_request', call('POST', '/events/e01/attendance/u_ahmad/start', khaled, { at: 'yesterday' }));
await expectError('record start before the event begins', 'event_not_started', call('POST', '/events/e02/attendance/u_f3/start', khaled));
await expectError('record start twice', 'already_started', call('POST', '/events/e01/attendance/u_f1/start', khaled));
await expectError('finish before start', 'end_before_start', call('POST', '/events/e01/attendance/u_f1/end', khaled, { at: iso(NOW - 60 * 60_000) }));
await expectError('participant opens the roster', 'not_organizer', call('GET', '/events/e01/roster', ahmad));

console.log('\n— notifications');
await expectError('push token that is not an Expo token', 'invalid_request', call('PUT', '/me/push-token', ahmad, { token: 'abc', lang: 'ar' }));
await expectOk('phone registers its push token', call('PUT', '/me/push-token', ahmad, { token: TOKEN_AHMAD, lang: 'ar' }));
await expectOk('an older phone, since uninstalled', call('PUT', '/me/push-token', ahmad, { token: TOKEN_GONE, lang: 'ar' }));

// The honest path: backdated start 30 min ago, finish now → 0.5 h.
await expectOk('record start 30 minutes ago', call('POST', '/events/e01/attendance/u_ahmad/start', khaled, { at: iso(NOW - 30 * 60_000) }));
const ended = (await call('POST', '/events/e01/attendance/u_ahmad/end', khaled)).body.attendance;
await settle();
expectEqual('one message per phone, none for the start', pushes.map((p) => p.to), [TOKEN_AHMAD, TOKEN_GONE]);
expectEqual('finish recorded → participant asked to confirm', pushesTo(TOKEN_AHMAD).map((p) => [p.data.type, p.data.attendance_id]), [['confirm_hours', ended.id]]);
expectEqual("in that phone's language", pushesTo(TOKEN_AHMAD)[0]?.title, 'ساعاتك بانتظار تأكيدك');
expectEqual('uninstalled phone forgotten', await tokenOwner(TOKEN_GONE), null);
await call('PUT', '/me/push-token', mariam, { token: TOKEN_SHARED, lang: 'ar' });
await call('PUT', '/me/push-token', ahmad, { token: TOKEN_SHARED, lang: 'en' });
expectEqual('a phone belongs to whoever signed in on it last', await tokenOwner(TOKEN_SHARED), 'u_ahmad');
await call('DELETE', '/me/push-token', mariam, { token: TOKEN_SHARED });
expectEqual("signing out cannot remove someone else's phone", await tokenOwner(TOKEN_SHARED), 'u_ahmad');
await expectOk('signing out removes the phone', call('DELETE', '/me/push-token', ahmad, { token: TOKEN_AHMAD }));
expectEqual('phone removed', await tokenOwner(TOKEN_AHMAD), null);
expectEqual('hours computed on the server', ended.hours, 0.5);
expectEqual('start marked backdated', ended.start_source, 'backdated');
expectEqual('recorded_by kept', ended.recorded_by, 'u_khaled');
const roster = (await call('GET', '/events/e01/roster', khaled)).body;
expectEqual('roster shows the hours', roster.participants.find((p: { user: { id: string } }) => p.user.id === 'u_ahmad').attendance.hours, 0.5);

// ---------------------------------------------------------------------------
console.log('\n— confirming hours and points');
await expectError("confirm someone else's hours", 'not_your_attendance', call('POST', `/attendance/${ended.id}/confirm`, mariam));
const before = await totalOf(ahmad);
const confirmed = (await call('POST', `/attendance/${ended.id}/confirm`, ahmad)).body;
// Placeholder formula: base 30 × (0.5 h / 4 h event) = 3.75, all physical.
expectEqual('fractional points credited', confirmed.points_earned, { spiritual: 0, mental: 0, physical: 3.75 });
expectEqual('total updated', Math.round(((await totalOf(ahmad)) - before) * 100) / 100, 3.75);
await expectError('confirm twice', 'already_acted', call('POST', `/attendance/${ended.id}/confirm`, ahmad));
const afterConfirm = await totalOf(ahmad);
await expectOk('dispute other recorded hours', call('POST', '/attendance/att_e15_u_ahmad/dispute', ahmad));
expectEqual('disputed hours earn nothing', await totalOf(ahmad), afterConfirm);

// ---------------------------------------------------------------------------
console.log('\n— scheduled auto-close');
const f1 = await login('u_f1');
await call('PUT', '/me/push-token', f1, { token: TOKEN_F1, lang: 'en' });
clock = new Date(running.ends_at).getTime() + 1000;
const closed = (await call('GET', '/me/attendance', f1)).body.find((x: { event: { id: string } }) => x.event.id === 'e01').attendance;
expectEqual('open attendance closed at event end', [closed.end_source, closed.ended_at], ['auto_closed', running.ends_at]);
await expectError('record a finish after auto-close', 'already_ended', call('POST', '/events/e01/attendance/u_f1/end', khaled));
await settle();
expectEqual('auto-close → participant asked to confirm, once', pushesTo(TOKEN_F1).map((p) => p.data.attendance_id), [closed.id]);
expectEqual('English phone, English text', pushesTo(TOKEN_F1)[0]?.body.startsWith('Your activity at'), true);
await expectError('scheduler endpoint off without a secret', 'not_found', call('POST', '/internal/tick'));

// ---------------------------------------------------------------------------
console.log('\n— deleting an account');
await call('PUT', '/me/push-token', signup.token, { token: TOKEN_NEW, lang: 'ar' });
await expectOk('delete my account', call('DELETE', '/me', signup.token));
expectEqual("the account's phones are forgotten", await tokenOwner(TOKEN_NEW), null);
await expectError('old token stops working', 'unauthorized', call('GET', '/me', signup.token));
clock += 2 * 60_000;
await call('POST', '/auth/request-code', undefined, { phone: phoneB });
await expectError('the phone can sign up again', 'profile_required', call('POST', '/auth/verify-code', undefined, { phone: phoneB, code: sentCodes.get(phoneB) }));

await conn.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
