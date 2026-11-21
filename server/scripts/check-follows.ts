// Following (owner's decisions, 2026-11-21): institutions, supervisors and
// classes; a new event is announced once when published, to followers who may
// join it, never its proposer; private (no counts, no names).
// Run: npm run check:api (runs this after check-skills.ts)

import type { EventDetail, EventProposal, FollowsResponse, PersonResponse } from '../../shared/api';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const DAY = 24 * 3_600_000;
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const mariam = await login('u_mariam'); // follows learning in the demo
const khaled = await login('u_khaled'); // a supervisor; represents the team
const f1 = await login('u_f1'); // a man
const fatima = await login('u_fatima'); // a supervisor
for (const [token, name] of [[ahmad, 'ahmad'], [mariam, 'mariam'], [khaled, 'khaled'], [f1, 'f1']] as const) {
  await call('PUT', '/me/push-token', token, { token: `ExponentPushToken[${name}]`, lang: 'ar' });
}
const told = (name: string, eventId: string) => h.pushes.some((p) => p.to === `ExponentPushToken[${name}]` && p.data.type === 'followed_event' && p.data.event_id === eventId);

console.log('\n— following');
const start: FollowsResponse = (await call('GET', '/follows', mariam)).body;
expectEqual('mariam follows learning (demo)', start.classes, ['learning']);
await expectOk('ahmad follows khaled (a supervisor)', call('PUT', '/follows/person/u_khaled', ahmad));
await expectOk('and the team', call('PUT', '/follows/institution/inst_saraj', ahmad));
const twice: FollowsResponse = await expectOk('twice changes nothing', call('PUT', '/follows/institution/inst_saraj', ahmad));
expectEqual('he follows both, once', [twice.people.map((p) => p.id), twice.institutions.map((i) => i.id)], [['u_khaled'], ['inst_saraj']]);
await expectError('not a member who is no supervisor', 'not_found', call('PUT', '/follows/person/u_mariam', ahmad));
await expectError('not oneself', 'not_found', call('PUT', '/follows/person/u_khaled', khaled));
await expectError('not a class that is none', 'not_found', call('PUT', '/follows/class/space', ahmad));
await expectError('not an institution that is none', 'not_found', call('PUT', '/follows/institution/nope', ahmad));
await expectOk('f1 follows learning too', call('PUT', '/follows/class/learning', f1));
const person: PersonResponse = (await call('GET', '/users/u_khaled', ahmad)).body;
expectEqual('khaled\'s page: followable, followed, and no count of followers', [person.followable, person.following, 'followers' in person], [true, true, false]);

console.log('\n— a new event is announced');
const proposal = (over: Partial<EventProposal> = {}): EventProposal => ({
  title: 'حلقة تحفيظ للبنات',
  description: 'حلقة قرآن في المسجد.',
  subtype: 'quran_circle',
  location_type: 'in_person',
  address_text: 'حي الأندلس، طرابلس',
  lat: 32.87,
  lng: 13.13,
  meeting_platform: null,
  meeting_url: null,
  starts_at: new Date(NOW + 4 * DAY).toISOString(),
  ends_at: new Date(NOW + 4 * DAY + 2 * 3_600_000).toISOString(),
  capacity: 10,
  gender_category: 'female',
  terms: [],
  lessons: [],
  ...over,
});
const women = await expectOk('fatima proposes a women-only learning event', call('POST', '/events', fatima, proposal()));
await h.settle();
expectEqual('while it waits for an admin, nobody is told', told('mariam', women.id), women.status === 'published');
if (women.status !== 'published') await expectOk('an admin publishes it', call('POST', `/admin/events/${women.id}/publish`, admin, {}));
await h.settle();
expectEqual('mariam (follows learning, may join) is told', told('mariam', women.id), true);
expectEqual('ahmad and f1 are not: it is not for men', [told('ahmad', women.id), told('f1', women.id)], [false, false]);
expectEqual('nor khaled: he follows nothing', told('khaled', women.id), false);
const mixed = await expectOk('and a mixed one in the team\'s name', call('POST', '/events', khaled, proposal({ title: 'تنظيف الشاطئ', subtype: 'beach_cleanup', gender_category: 'mixed', institution_id: 'inst_saraj' })));
await h.settle();
expectEqual('ahmad (follows khaled and the team) is told once', h.pushes.filter((p) => p.to === 'ExponentPushToken[ahmad]' && p.data.event_id === mixed.id).length, mixed.status === 'published' ? 1 : 0);
if (mixed.status !== 'published') {
  await expectOk('an admin publishes it', call('POST', `/admin/events/${mixed.id}/publish`, admin, {}));
  await h.settle();
  expectEqual('then ahmad is told, once', h.pushes.filter((p) => p.to === 'ExponentPushToken[ahmad]' && p.data.event_id === mixed.id).length, 1);
}
expectEqual('mariam is not: environment is not what she follows', told('mariam', mixed.id), false);
const detail: EventDetail = (await call('GET', `/events/${mixed.id}`, ahmad)).body;
expectEqual('its page: the proposer, and what ahmad follows', [detail.proposer?.id, detail.following], ['u_khaled', { institution: true, proposer: true }]);

console.log('\n— stopping');
const after: FollowsResponse = await expectOk('ahmad stops following khaled', call('DELETE', '/follows/person/u_khaled', ahmad));
expectEqual('only the team is left', [after.people.length, after.institutions.length], [0, 1]);

await h.done();
