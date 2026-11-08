// A full event's waiting list (shared/rules.ts planOffers): joining it only
// when full, a place held for the first in line when one opens, nobody else
// taking that place meanwhile, an offer not taken in time passing on, and an
// admin adding places offering them.
// Run: npm run check:api (runs this after check-reminders.ts)

import type { AdminEventDetail, CreateEventBody } from '../../shared/admin-api';
import type { EventDetail } from '../../shared/api';
import { WAITLIST_OFFER_HOURS } from '../../shared/rules';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const mariam = await login('u_mariam');
const f1 = await login('u_f1');
for (const [name, token] of [
  ['ahmad', ahmad],
  ['mariam', mariam],
  ['f1', f1],
] as const) {
  await call('PUT', '/me/push-token', token, { token: `ExponentPushToken[${name}]`, lang: 'ar' });
}
let seen = 0;
async function offersSent() {
  await h.settle();
  const fresh = h.pushes.slice(seen).filter((p) => p.data?.type === 'waitlist_offer');
  seen = h.pushes.length;
  return fresh.map((p) => p.to.slice('ExponentPushToken['.length, -1)).sort();
}

const start = NOW + 3 * 24 * HOUR;
const event: CreateEventBody = {
  title: 'زيارة دار المسنين',
  description: 'نقضي وقتاً مع كبارنا.',
  subtype: 'elderly_visit',
  location_type: 'in_person',
  address_text: 'دار الرعاية، طرابلس',
  lat: 32.88,
  lng: 13.19,
  meeting_platform: null,
  meeting_url: null,
  starts_at: iso(start),
  ends_at: iso(start + 2 * HOUR),
  capacity: 1,
  gender_category: 'mixed',
  organizer_ids: ['u_khaled'],
  terms: [],
  lessons: [],
  publish: true,
};
const { id } = await expectOk('an event with one place', call('POST', '/admin/events', admin, event));
const page = async (token: string): Promise<EventDetail> => (await call('GET', `/events/${id}`, token)).body;
const join = async (token: string) => {
  await call('POST', `/events/${id}/join`, token);
  return call('POST', `/events/${id}/join/complete`, token);
};
const list = (token: string) => call('POST', `/events/${id}/waitlist`, token);

console.log('\n— joining the list');
await expectError('while a place is free', 'seats_available', list(mariam));
await expectOk('ahmad takes the place', join(ahmad));
await expectError('he cannot wait for an event he joined', 'already_joined', list(ahmad));
await expectOk('mariam waits', list(mariam));
await expectOk('f1 waits after her', list(f1));
await expectOk('waiting twice changes nothing', list(mariam));
expectEqual('each sees their place in line', [(await page(mariam)).waitlist.mine, (await page(f1)).waitlist.mine], [
  { position: 1, offer_expires_at: null },
  { position: 2, offer_expires_at: null },
]);
await expectError('joining a full event', 'event_full', join(f1));

console.log('\n— a place opens');
await expectOk('ahmad leaves', call('DELETE', `/events/${id}/join`, ahmad));
expectEqual('the first in line is told', await offersSent(), ['mariam']);
const held = (await page(mariam)).waitlist.mine;
expectEqual('the place is held for her for a while', [held?.position, held?.offer_expires_at], [null, iso(NOW + WAITLIST_OFFER_HOURS * HOUR)]);
expectEqual('the next sees it taken', (await page(f1)).waitlist.held_for_others, 1);
await expectError('nobody else takes it', 'event_full', join(f1));
await expectError('not even someone who left', 'event_full', join(ahmad));

console.log('\n— an offer not taken in time');
h.setClock(NOW + (WAITLIST_OFFER_HOURS + 1) * HOUR);
await call('GET', '/me', ahmad); // any request runs the scheduled job
expectEqual('passes to the next in line', await offersSent(), ['f1']);
expectEqual('and she is off the list', (await page(mariam)).waitlist.mine, null);
await expectOk('f1 joins in her place', join(f1));
expectEqual('and leaves the list', (await page(f1)).waitlist, { count: 0, held_for_others: 0, mine: null });

console.log('\n— leaving the list, and more places');
await expectOk('mariam waits again', list(mariam));
await expectOk('and leaves the list', call('DELETE', `/events/${id}/waitlist`, mariam));
expectEqual('it is empty', (await page(mariam)).waitlist.count, 0);
await expectOk('ahmad waits', list(ahmad));
await expectOk('an admin adds a place', call('PUT', `/admin/events/${id}`, admin, { ...event, capacity: 2 }));
expectEqual('it goes to the first in line', await offersSent(), ['ahmad']);
const detail: AdminEventDetail = (await call('GET', `/admin/events/${id}`, admin)).body;
expectEqual('the panel shows the list, with the place held', detail.waitlist.map((w) => [w.user.id, !!w.offer_expires_at]), [['u_ahmad', true]]);
await expectOk('ahmad joins again', join(ahmad));

await h.done();
