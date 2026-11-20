// Badges, the Hijri months and the leaderboards (owner's decisions,
// 2026-11-20): badges come from the person's own record and are celebrated
// once and pushed once; admins move a Hijri month a day either way; the
// boards list this month's confirmed hours of those who chose to be shown.
// Run: npm run check:api (runs this after check-hours-records.ts)

import type { AdminHijriMonth } from '../../shared/admin-api';
import type { LeaderboardResponse, MeResponse, PersonResponse } from '../../shared/api';
import { badgesEarned } from '../../shared/badges';
import { hijriMonths, hijriOf, isFirstTenOfDhulHijjah, isRamadan } from '../../shared/hijri';
import * as s from '../src/db/schema';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

console.log('\n— the Hijri months');
const months = hijriMonths();
expectEqual('1 Ramadan 1447 is 18 February 2026 (Umm al-Qura)', hijriOf('2026-02-18', months), { year: 1447, month: 9, day: 1 });
expectEqual('the day before is still Shaban', hijriOf('2026-02-17', months)?.month, 8);
const moved = hijriMonths([{ year: 1447, month: 9, days: 1 }]);
expectEqual('moved a day later, Ramadan starts on the 19th', [hijriOf('2026-02-18', moved)?.month, hijriOf('2026-02-19', moved)?.day], [8, 1]);
expectEqual('a move of more than a day is held to one', hijriMonths([{ year: 1447, month: 9, days: 5 }]).find((m) => m.year === 1447 && m.month === 9)?.start, '2026-02-19');
expectEqual('9 Dhul Hijjah 1447 (Arafah) is in the first ten', isFirstTenOfDhulHijjah(hijriOf('2026-05-26', months)), true);
expectEqual('the 11th is not', isFirstTenOfDhulHijjah(hijriOf('2026-05-28', months)), false);

console.log('\n— badges from a record');
const ev = (n: number, event_class: 'environment' | 'health' | 'learning' | 'community', day: string) => ({ event_id: `e${n}`, event_class, day });
const five = [1, 2, 3, 4, 5].map((n) => ev(n, 'environment', `2026-0${n}-10`));
const got = badgesEarned({ confirmed: five, lessonsLearned: 10, hijri: months });
expectEqual(
  'five environment events, five months in a row, ten lessons, one in Ramadan',
  got,
  ['events_1', 'events_5', 'class_environment_5', 'streak_3', 'lessons_10', 'ramadan'],
);
expectEqual('the same event twice counts once', badgesEarned({ confirmed: [ev(1, 'health', '2026-07-01'), ev(1, 'health', '2026-07-01')], lessonsLearned: 0, hijri: months }), ['events_1']);
expectEqual(
  'variety: three classes',
  badgesEarned({ confirmed: [ev(1, 'health', '2026-07-01'), ev(2, 'learning', '2026-07-02'), ev(3, 'community', '2026-07-03')], lessonsLearned: 0, hijri: months }).filter((b) => b.startsWith('variety')),
  ['variety_2', 'variety_3'],
);
expectEqual('a gap breaks the streak', badgesEarned({ confirmed: [ev(1, 'health', '2026-07-01'), ev(2, 'health', '2026-08-01'), ev(3, 'health', '2026-10-01')], lessonsLearned: 0, hijri: months }).includes('streak_3'), false);
expectEqual('Ramadan by the admins\' move', isRamadan(hijriOf('2026-02-18', moved)), false);

console.log('\n— badges in the app');
const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const mariam = await login('u_mariam');
const khaled = await login('u_khaled');
await call('PUT', '/me/push-token', ahmad, { token: 'ExponentPushToken[ahmad]', lang: 'ar' });
const me: MeResponse = (await call('GET', '/me', ahmad)).body;
expectEqual('ahmad has his first step, from events before badges', me.badges?.some((b) => b.badge_id === 'events_1'), true);
expectEqual('and it waits to be celebrated', me.new_badges?.includes('events_1'), true);
await expectOk('the app celebrated it', call('POST', '/me/badges/seen', ahmad));
expectEqual('so it is not shown again', ((await call('GET', '/me', ahmad)).body as MeResponse).new_badges, []);
// A badge earned now (the demo's were told before): the timer pushes it once.
await h.conn.db.insert(s.user_badges).values({ user_id: 'u_ahmad', badge_id: 'lessons_25', earned_at: new Date(NOW) });
await h.tick();
await h.settle();
expectEqual('he is told once by push', h.pushes.filter((p) => p.to === 'ExponentPushToken[ahmad]' && p.data.type === 'badge_earned' && p.data.badge_id === 'lessons_25').length, 1);
await h.tick();
await h.settle();
expectEqual('and not again', h.pushes.filter((p) => p.to === 'ExponentPushToken[ahmad]' && p.data.badge_id === 'lessons_25').length, 1);
const seen: PersonResponse = (await call('GET', '/users/u_ahmad', mariam)).body;
expectEqual('mariam sees his badges and level, not his phone', [seen.badges.some((b) => b.badge_id === 'events_1'), 'phone' in seen.user], [true, false]);
await expectError('nobody by that id', 'not_found', call('GET', '/users/u_nobody', mariam));

console.log('\n— leaderboards');
const board = async (token: string, q = ''): Promise<LeaderboardResponse> => (await call('GET', `/leaderboards${q}`, token)).body;
const all = await board(mariam);
expectEqual('this month, where the association is', all.month, '2026-10');
const ahmadRow = all.rows.find((r) => r.user.id === 'u_ahmad');
expectEqual('ahmad (shown, in the demo) is on it with his hours this month', !!ahmadRow && ahmadRow.hours > 0, true);
expectEqual('places count down from 1', all.rows[0]?.rank, 1);
await expectOk('ahmad hides himself', call('PATCH', '/me', ahmad, { show_on_leaderboards: false }));
const after = await board(ahmad);
expectEqual('he is gone from it, but sees his own hours', [after.rows.some((r) => r.user.id === 'u_ahmad'), after.me.shown, after.me.rank, after.me.hours > 0], [false, false, null, true]);
await expectOk('and shows himself again', call('PATCH', '/me', ahmad, { show_on_leaderboards: true }));
const team = await board(khaled, '?institution_id=inst_saraj');
expectEqual('the team\'s board lists only its members', team.rows.every((r) => ['u_ahmad', 'u_khaled'].includes(r.user.id)), true);
await expectError('not an institution one is not in', 'not_found', call('GET', '/leaderboards?institution_id=inst_saraj', mariam));

console.log('\n— the Hijri months in the panel');
const list: AdminHijriMonth[] = (await call('GET', '/admin/hijri', admin)).body;
expectEqual('fifteen months, this one (Jumada al-Ula 1448) third', [list.length, list[2].year, list[2].month], [15, 1448, 5]);
const ramadan = list.find((m) => m.month === 9)!;
await expectOk('an admin moves Ramadan a day later', call('PUT', `/admin/hijri/${ramadan.year}/9`, admin, { days: 1 }));
const changed: AdminHijriMonth[] = (await call('GET', '/admin/hijri', admin)).body;
const r2 = changed.find((m) => m.month === 9)!;
expectEqual('its start is the next day', [r2.days, r2.start > r2.base_start], [1, true]);
await expectError('not more than a day', 'invalid_request', call('PUT', `/admin/hijri/${ramadan.year}/9`, admin, { days: 2 }));
await expectError('nor a month not in the table', 'not_found', call('PUT', '/admin/hijri/1300/9', admin, { days: 1 }));
await expectError('a member cannot', 'forbidden', call('PUT', `/admin/hijri/${ramadan.year}/9`, ahmad, { days: 0 }));
await expectOk('and back as it is', call('PUT', `/admin/hijri/${ramadan.year}/9`, admin, { days: 0 }));

await h.done();
