// Reminders before an event (shared/rules.ts dueReminder): the day before to
// whoever joined and its supervisors, and for an event in a place again an
// hour before; each once per start time, and again when the event moves.
// Run: npm run check:api (runs this after check-online.ts)

import type { CreateEventBody } from '../../shared/admin-api';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, login, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const khaled = await login('u_khaled');
for (const [name, token] of [
  ['ahmad', ahmad],
  ['khaled', khaled],
] as const) {
  await call('PUT', '/me/push-token', token, { token: `ExponentPushToken[${name}]`, lang: 'ar' });
}

let seen = 0;
/** The reminders sent since the last look, after a request (any request runs the scheduled job). */
async function reminders(at: number, eventId = id) {
  h.setClock(at);
  await call('GET', '/me', ahmad);
  await h.settle();
  const fresh = h.pushes.slice(seen).filter((p) => p.data?.type === 'event_reminder' && p.data.event_id === eventId);
  seen = h.pushes.length;
  return fresh.map((p) => `${p.to.slice('ExponentPushToken['.length, -1)}: ${p.title}`).sort();
}

const start = NOW + 3 * 24 * HOUR;
const event: CreateEventBody = {
  title: 'تنظيف شاطئ قرقارش',
  description: 'نجمع ما تركه الزوار.',
  subtype: 'beach_cleanup',
  location_type: 'in_person',
  address_text: 'شاطئ قرقارش، طرابلس',
  lat: 32.88,
  lng: 13.12,
  meeting_platform: null,
  meeting_url: null,
  starts_at: iso(start),
  ends_at: iso(start + 3 * HOUR),
  capacity: 10,
  gender_category: 'mixed',
  organizer_ids: ['u_khaled'],
  terms: [],
  lessons: [],
  publish: true,
};
const { id } = await expectOk('an event in a place, three days ahead', call('POST', '/admin/events', admin, event));
await call('POST', `/events/${id}/join`, ahmad);
await expectOk('ahmad joins it', call('POST', `/events/${id}/join/complete`, ahmad));

console.log('\n— the day before');
expectEqual('nothing two days ahead', await reminders(start - 48 * HOUR), []);
const dayBefore = await reminders(start - 23 * HOUR);
expectEqual('a day ahead: whoever joined and its supervisor', dayBefore, ['ahmad: تذكير بفعاليتك', 'khaled: تذكير بفعاليتك']);
const body = h.pushes.find((p) => p.data?.type === 'event_reminder' && p.data.event_id === id)!.body;
expectEqual('saying where it is', body.includes('شاطئ قرقارش، طرابلس'), true);
expectEqual('once only', await reminders(start - 20 * HOUR), []);

console.log('\n— shortly before');
expectEqual('nothing two hours ahead', await reminders(start - 2 * HOUR), []);
expectEqual('an hour ahead, once more', await reminders(start - 50 * MIN), ['ahmad: تبدأ فعاليتك بعد قليل', 'khaled: تبدأ فعاليتك بعد قليل']);
expectEqual('and not again', await reminders(start - 30 * MIN), []);

console.log('\n— a moved event is reminded of again');
const moved = start + 2 * 24 * HOUR;
await expectOk(
  'an admin moves it two days later',
  call('PUT', `/admin/events/${id}`, admin, { ...event, starts_at: iso(moved), ends_at: iso(moved + 3 * HOUR) }),
);
expectEqual('the day before its new start', await reminders(moved - 23 * HOUR), ['ahmad: تذكير بفعاليتك', 'khaled: تذكير بفعاليتك']);

console.log('\n— an online event');
const onlineStart = h.clock() + 30 * HOUR;
const online = await expectOk(
  'an online event',
  call('POST', '/admin/events', admin, {
    ...event,
    title: 'درس عن بُعد',
    subtype: 'tutoring',
    location_type: 'online',
    address_text: null,
    lat: null,
    lng: null,
    meeting_platform: 'zoom',
    meeting_url: 'https://zoom.us/j/1234567890',
    starts_at: iso(onlineStart),
    ends_at: iso(onlineStart + HOUR),
  }),
);
await call('POST', `/events/${online.id}/join`, ahmad);
await call('POST', `/events/${online.id}/join/complete`, ahmad);
expectEqual('reminded the day before', (await reminders(onlineStart - 20 * HOUR, online.id)).length, 2);
expectEqual('but not an hour before: the link notification is its reminder', await reminders(onlineStart - 50 * MIN, online.id), []);

await h.done();
