// Online events: a form that mixes a place with a link is refused, the meeting
// link never shows in the events list, and on the event's page only those who
// joined see it, from half an hour before the start to the end (its supervisors
// and admins always). The "link is open" notification goes once per start time,
// and moving an event online or changing its link tells those who joined.
// Run: npm run check:api (runs this after check-admin.ts)

import type { EventDetail, EventProposal, EventSummary } from '../../shared/api';
import type { CreateEventBody } from '../../shared/admin-api';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const khaled = await login('u_khaled');
const f1 = await login('u_f1');
for (const [token, user] of [
  ['ahmad', ahmad],
  ['khaled', khaled],
  ['f1', f1],
] as const) {
  await call('PUT', '/me/push-token', user, { token: `ExponentPushToken[${token}]`, lang: 'ar' });
}
let seen = 0;
async function news() {
  await h.settle();
  const fresh = h.pushes.slice(seen);
  seen = h.pushes.length;
  return fresh;
}
const who = (messages: { to: string }[]) => messages.map((m) => m.to.slice('ExponentPushToken['.length, -1)).sort();

async function joinFully(token: string, eventId: string) {
  await call('POST', `/events/${eventId}/join`, token);
  const detail: EventDetail = (await call('GET', `/events/${eventId}`, token)).body;
  for (const term of detail.terms) await call('POST', `/events/${eventId}/terms/${term.id}/accept`, token);
  return call('POST', `/events/${eventId}/join/complete`, token);
}
const page = async (id: string, token: string): Promise<EventDetail> => (await call('GET', `/events/${id}`, token)).body;
const listed = async (id: string, token: string): Promise<EventSummary> =>
  ((await call('GET', '/events', token)).body as EventSummary[]).find((e) => e.id === id)!;

const ZOOM = 'https://zoom.us/j/9876543210';
const start = NOW + 3 * HOUR;
const end = start + 2 * HOUR;
const online: CreateEventBody = {
  title: 'درس تقوية عن بُعد',
  description: 'مراجعة الرياضيات.',
  subtype: 'tutoring',
  location_type: 'online',
  address_text: null,
  lat: null,
  lng: null,
  meeting_platform: 'zoom',
  meeting_url: ZOOM,
  starts_at: iso(start),
  ends_at: iso(end),
  capacity: 10,
  gender_category: 'mixed',
  organizer_ids: ['u_khaled'],
  terms: ['التزم بآداب الحصة.'],
  lessons: [],
  publish: true,
};

// ---------------------------------------------------------------------------
console.log('— the form');
await expectError('online without a link', 'invalid_request', call('POST', '/admin/events', admin, { ...online, meeting_url: null }));
await expectError('a link that is not https', 'invalid_request', call('POST', '/admin/events', admin, { ...online, meeting_url: 'http://zoom.us/j/1' }));
await expectError('a link that is not a link', 'invalid_request', call('POST', '/admin/events', admin, { ...online, meeting_url: 'zoom meeting 123' }));
await expectError('a platform that does not exist', 'invalid_request', call('POST', '/admin/events', admin, { ...online, meeting_platform: 'skype' }));
await expectError('in a place without an address', 'invalid_request', call('POST', '/admin/events', admin, { ...online, location_type: 'in_person' }));
await expectError('a kind that does not exist', 'invalid_request', call('POST', '/admin/events', admin, { ...online, location_type: 'both' }));
const strayPin = await expectOk(
  'online with a stray pin and address: saved without them',
  call('POST', '/admin/events', admin, { ...online, publish: false, lat: 32.8, lng: 13.1, address_text: 'طرابلس' }),
);
const stray = (await call('GET', `/admin/events/${strayPin.id}`, admin)).body.event;
expectEqual('nothing of a place is kept', [stray.lat, stray.lng, stray.address_text, stray.meeting_url], [null, null, null, ZOOM]);
const { id } = await expectOk('an admin publishes an online event', call('POST', '/admin/events', admin, online));

// ---------------------------------------------------------------------------
console.log('\n— who sees the link, and when');
const inList = await listed(id, f1);
expectEqual('the list says it is online, with no place', [inList.location_type, inList.meeting_platform, inList.lat, inList.address_text], ['online', 'zoom', null, null]);
expectEqual('the list never carries the link', 'meeting_url' in inList, false);
const stranger = await page(id, f1);
expectEqual('someone who has not joined: no link, but when it opens', [stranger.meeting_url, stranger.meeting_link_opens_at], [null, iso(start - 30 * MIN)]);
await expectOk('Ahmad joins', joinFully(ahmad, id));
expectEqual('joined, three hours early: not yet', (await page(id, ahmad)).meeting_url, null);
expectEqual('its supervisor sees it at any time', (await page(id, khaled)).meeting_url, ZOOM);
expectEqual('and an admin', (await page(id, admin)).meeting_url, ZOOM);
expectEqual('the roster does not carry it either', 'meeting_url' in (await call('GET', `/events/${id}/roster`, khaled)).body.event, false);

h.setClock(start - 31 * MIN);
expectEqual('31 minutes before: not yet', (await page(id, ahmad)).meeting_url, null);
await h.tick();
expectEqual('and nobody is told yet', (await news()).filter((m) => m.data.type === 'meeting_link_open' && m.data.event_id === id).length, 0);

h.setClock(start - 30 * MIN);
expectEqual('30 minutes before: there it is', (await page(id, ahmad)).meeting_url, ZOOM);
expectEqual('still not for someone who did not join', (await page(id, f1)).meeting_url, null);
await h.tick();
const opened = (await news()).filter((m) => m.data.type === 'meeting_link_open' && m.data.event_id === id);
expectEqual('those who joined and its supervisor are told', who(opened), ['ahmad', 'khaled']);
expectEqual(
  'in Tripoli time',
  opened[0].body,
  `تبدأ «درس تقوية عن بُعد» بعد قليل (${new Intl.DateTimeFormat('ar-LY-u-nu-latn', { timeZone: 'Africa/Tripoli', hour: 'numeric', minute: '2-digit' }).format(start)} بتوقيت طرابلس). افتح الفعالية في التطبيق لتجد رابط الدخول.`,
);
await h.tick();
expectEqual('told only once', (await news()).filter((m) => m.data.type === 'meeting_link_open').length, 0);

h.setClock(start + HOUR);
expectEqual('during the event', (await page(id, ahmad)).meeting_url, ZOOM);
await expectOk('attendance is recorded by the supervisor, as anywhere', call('POST', `/events/${id}/attendance/u_ahmad/start`, khaled));
h.setClock(end);
expectEqual('once it is over: gone', (await page(id, ahmad)).meeting_url, null);
await h.tick();
await news();

// ---------------------------------------------------------------------------
console.log('\n— moving an event online, and changing its link');
h.setClock(NOW + 24 * HOUR);
const placeStart = h.clock() + 48 * HOUR;
const inPlace: CreateEventBody = {
  ...online,
  title: 'حصة مراجعة في المقر',
  location_type: 'in_person',
  address_text: 'مقر الجمعية، طرابلس',
  lat: 32.878,
  lng: 13.175,
  meeting_platform: null,
  meeting_url: null,
  starts_at: iso(placeStart),
  ends_at: iso(placeStart + 2 * HOUR),
};
const moved = (await expectOk('an event in a place', call('POST', '/admin/events', admin, inPlace))).id;
await expectOk('Ahmad joins it', joinFully(ahmad, moved));
await news();
const { publish: _, ...asEdit } = { ...online, starts_at: inPlace.starts_at, ends_at: inPlace.ends_at, title: inPlace.title };
await expectOk('the admin moves it online', call('PUT', `/admin/events/${moved}`, admin, asEdit));
const toOnline = (await news()).filter((m) => m.data.type === 'event_changed');
expectEqual('those who joined are told it is now online', [who(toOnline), toOnline[0]?.body], [
  ['ahmad', 'khaled'],
  'أصبحت «حصة مراجعة في المقر» فعالية عن بُعد (Zoom). تجد الرابط في صفحة الفعالية قبل بدئها بنصف ساعة.',
]);
await expectOk('then a new link', call('PUT', `/admin/events/${moved}`, admin, { ...asEdit, meeting_platform: 'meet', meeting_url: 'https://meet.google.com/xyz-abcd-efg' }));
expectEqual('told of the new link, without the link itself', (await news()).find((m) => m.to === 'ExponentPushToken[ahmad]')?.body, 'تغيّر رابط «حصة مراجعة في المقر» (Google Meet). تجد الرابط الجديد في صفحة الفعالية.');
await expectOk('then a new time', call('PUT', `/admin/events/${moved}`, admin, { ...asEdit, meeting_platform: 'meet', meeting_url: 'https://meet.google.com/xyz-abcd-efg', starts_at: iso(placeStart + HOUR), ends_at: iso(placeStart + 3 * HOUR) }));
expectEqual('a new time says Tripoli time', ((await news()).find((m) => m.to === 'ExponentPushToken[ahmad]')?.body ?? '').includes('بتوقيت طرابلس'), true);

h.setClock(placeStart + HOUR - 20 * MIN);
await h.tick();
expectEqual('its link opens: told', who((await news()).filter((m) => m.data.type === 'meeting_link_open')), ['ahmad', 'khaled']);
await expectOk('the admin moves it an hour later', call('PUT', `/admin/events/${moved}`, admin, { ...asEdit, meeting_platform: 'meet', meeting_url: 'https://meet.google.com/xyz-abcd-efg', starts_at: iso(placeStart + 2 * HOUR), ends_at: iso(placeStart + 4 * HOUR) }));
await news();
h.setClock(placeStart + 2 * HOUR - 25 * MIN);
await h.tick();
expectEqual('the new start time is told again', who((await news()).filter((m) => m.data.type === 'meeting_link_open')), ['ahmad', 'khaled']);

// ---------------------------------------------------------------------------
console.log('\n— proposing an online event in the app');
const proposal: EventProposal = {
  title: 'حلقة تحفيظ عن بُعد',
  description: 'مراجعة جزء عمّ.',
  subtype: 'quran_circle',
  location_type: 'online',
  address_text: null,
  lat: null,
  lng: null,
  meeting_platform: 'telegram',
  meeting_url: 'https://t.me/+AbCdEf123',
  starts_at: iso(h.clock() + 72 * HOUR),
  ends_at: iso(h.clock() + 73 * HOUR),
  capacity: 20,
  gender_category: 'male',
  terms: [],
  lessons: [],
};
await expectError('a proposal online without a link', 'invalid_request', call('POST', '/events', khaled, { ...proposal, meeting_url: '' }));
const proposed = await expectOk('a supervisor proposes one', call('POST', '/events', khaled, proposal));
const mine = await page(proposed.id, khaled);
expectEqual('it waits for an admin, with its link', [mine.status, mine.location_type, mine.meeting_url], ['draft', 'online', 'https://t.me/+AbCdEf123']);
await expectOk('its proposer moves it to a place', call('PUT', `/events/${proposed.id}`, khaled, { ...proposal, location_type: 'in_person', address_text: 'مسجد الحي', lat: 32.9, lng: 13.2 }));
const placed = await page(proposed.id, khaled);
expectEqual('the link is dropped', [placed.location_type, placed.address_text, placed.meeting_platform, placed.meeting_url], ['in_person', 'مسجد الحي', null, null]);

await h.done();
