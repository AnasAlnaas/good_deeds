// The app's small smarts (owner's decisions, 2026-11-22; shared/smart.ts):
// "follow this?" after two confirmed events, "almost full" to those an event
// fits (once per event, once a day), skills named in an event's words, and the
// best time to post, hidden until there is enough data.
// Run: npm run check:api (runs this after check-follows.ts)

import type { AdminSkillRow, EventFormMeta, EventProposal, FollowSuggestionResponse, FollowsResponse, MySkillsResponse } from '../../shared/api';
import { bestPostingTime, isAlmostFull, POSTING_HINT_MIN_EVENTS, skillsInText } from '../../shared/smart';
import { eq, inArray } from 'drizzle-orm';

import * as s from '../src/db/schema';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const khaled = await login('u_khaled');
const f1 = await login('u_f1');
const f3 = await login('u_f3');
const f5 = await login('u_f5');
const f6 = await login('u_f6');
const f7 = await login('u_f7');
for (const [token, name] of [[f1, 'f1'], [f6, 'f6'], [f3, 'f3'], [ahmad, 'ahmad']] as const) {
  await call('PUT', '/me/push-token', token, { token: `ExponentPushToken[${name}]`, lang: 'ar' });
}
const alerts = (name: string) => h.pushes.filter((p) => p.to === `ExponentPushToken[${name}]` && p.data.type === 'almost_full');

console.log('\n— the rules');
expectEqual('almost full: 3 of 20 left, 2 of 5, not 4 of 5, not 0', [isAlmostFull(20, 3), isAlmostFull(5, 2), isAlmostFull(5, 4), isAlmostFull(5, 0)], [true, true, false, false]);
expectEqual('almost full: 20 of 100 left (20%), not 21', [isAlmostFull(100, 20), isAlmostFull(100, 21)], [true, false]);
const skills = [
  { id: 'farming', keywords: ['تشجير', 'شتلات'] },
  { id: 'cooking', keywords: ['وجبات', 'iftar'] },
];
expectEqual('words inside longer ones, alef and taa written alike', skillsInText('حملة التشجير وتوزيع الوجبات في الحديقة', skills), ['farming', 'cooking']);
expectEqual('English, any case', skillsInText('Ramadan IFTAR for families', skills), ['cooking']);
expectEqual('nothing named, nothing suggested', skillsInText('زيارة', skills), []);
const tz = 'Africa/Tripoli';
// Sunday 2026-10-04 19:00 in Tripoli fills at 0.9; everything else at 0.3.
const sundayEvening = new Date('2026-10-04T17:00:00Z').getTime();
const rows = Array.from({ length: POSTING_HINT_MIN_EVENTS }, (_, i) =>
  i < 6 ? { posted_at: sundayEvening + i * 7 * DAY, fill: 0.9 } : { posted_at: sundayEvening + 2 * DAY + (i % 9) * 5 * HOUR, fill: 0.3 },
);
const hint = bestPostingTime(rows, tz);
expectEqual('the time that fills fastest: Sunday evening', [hint?.weekday, hint?.part], [0, 'evening']);
expectEqual('too few events: nothing', bestPostingTime(rows.slice(0, POSTING_HINT_MIN_EVENTS - 1), tz), null);
expectEqual('nothing stands out: nothing', bestPostingTime(rows.map((r) => ({ ...r, fill: 0.5 })), tz), null);

console.log('\n— skills named in an event\'s words');
const mine: MySkillsResponse = (await call('GET', '/me/skills', ahmad)).body;
expectEqual('the starting skills come with their words', mine.offered.find((x) => x.id === 'cooking')?.keywords?.includes('وجبات'), true);
const edited: AdminSkillRow[] = await expectOk('an admin changes a skill\'s words', call('PATCH', '/admin/skills/cooking', admin, { keywords: 'طبخ\nوجبات، سفرة\nطبخ\nx' }));
expectEqual('cleaned: each once, none too short', edited.find((x) => x.id === 'cooking')?.keywords, ['طبخ', 'وجبات', 'سفرة']);
const meta: EventFormMeta = (await call('GET', '/events/form', khaled)).body;
expectEqual('the form has them too', meta.skills?.find((x) => x.id === 'cooking')?.keywords, ['طبخ', 'وجبات', 'سفرة']);

console.log('\n— the best time to post');
expectEqual('hidden: too few events and members yet', meta.posting_hint, null);

console.log('\n— follow this?');
const none: FollowSuggestionResponse = (await call('GET', '/follows/suggestion', ahmad)).body;
expectEqual('nothing before two confirmed events', none.suggestion, null);
const attend = async (eventId: string, status: 'confirmed' | 'pending') =>
  h.conn.db.insert(s.attendance).values({
    id: `att_${eventId}_ahmad`,
    event_id: eventId,
    user_id: 'u_ahmad',
    started_at: new Date(NOW - 10 * DAY),
    start_source: 'live',
    ended_at: new Date(NOW - 10 * DAY + HOUR),
    end_source: 'live',
    hours: 1,
    recorded_by: 'u_khaled',
    recorded_at: new Date(NOW - 10 * DAY),
    participant_status: status,
  });
// The demo's events are the admin's; these two are khaled's, as one he proposed.
await h.conn.db.update(s.events).set({ created_by: 'u_khaled' }).where(inArray(s.events.id, ['e02', 'e03']));
await attend('e02', 'confirmed');
await attend('e03', 'pending');
expectEqual('one confirmed and one waiting: still nothing', ((await call('GET', '/follows/suggestion', ahmad)).body as FollowSuggestionResponse).suggestion, null);
await h.conn.db.update(s.attendance).set({ participant_status: 'confirmed' }).where(eq(s.attendance.id, 'att_e03_ahmad'));
const sug: FollowSuggestionResponse = (await call('GET', '/follows/suggestion', ahmad)).body;
expectEqual('two confirmed from khaled: follow khaled?', [sug.suggestion?.kind, sug.suggestion?.id, sug.suggestion?.events], ['person', 'u_khaled', 2]);
await expectError('only institutions and people', 'invalid_request', call('POST', '/follows/suggestion', ahmad, { kind: 'class', id: 'learning', follow: true }));
await expectOk('he says no', call('POST', '/follows/suggestion', ahmad, { kind: 'person', id: 'u_khaled', follow: false }));
expectEqual('never asked again', ((await call('GET', '/follows/suggestion', ahmad)).body as FollowSuggestionResponse).suggestion, null);
const follows: FollowsResponse = (await call('GET', '/follows', ahmad)).body;
expectEqual('and he follows nothing', follows.people.length, 0);
await expectOk('saying yes follows', call('POST', '/follows/suggestion', f1, { kind: 'person', id: 'u_khaled', follow: true }));
expectEqual('f1 now follows khaled', ((await call('GET', '/follows', f1)).body as FollowsResponse).people.map((p) => p.id), ['u_khaled']);

console.log('\n— almost full');
await expectOk('f6 has the skill of organising', call('PUT', '/me/skills', f6, { skill_ids: ['organizing'], classes: [] }));
await expectOk('ahmad follows environment', call('PUT', '/follows/class/environment', ahmad));
const proposal = (over: Partial<EventProposal> = {}): EventProposal => ({
  title: 'تنظيف الشاطئ',
  description: 'حملة تنظيف.',
  subtype: 'beach_cleanup',
  location_type: 'in_person',
  address_text: 'شاطئ قرقارش، طرابلس',
  lat: 32.88,
  lng: 13.12,
  meeting_platform: null,
  meeting_url: null,
  starts_at: new Date(NOW + 5 * DAY).toISOString(),
  ends_at: new Date(NOW + 5 * DAY + 2 * HOUR).toISOString(),
  capacity: 5,
  gender_category: 'mixed',
  terms: [],
  lessons: [],
  ...over,
});
const fatima = await login('u_fatima');
const publish = async (over: Partial<EventProposal> = {}, by = khaled) => {
  const e = await expectOk('a supervisor proposes a beach clean-up for 5', call('POST', '/events', by, proposal(over)));
  if (e.status !== 'published') await expectOk('an admin publishes it', call('POST', `/admin/events/${e.id}/publish`, admin, {}));
  await h.settle();
  return e.id as string;
};
const join = async (token: string, id: string) => {
  await expectOk('join', call('POST', `/events/${id}/join`, token));
  await expectOk('complete', call('POST', `/events/${id}/join/complete`, token));
  await h.settle();
};
const beach = await publish();
await join(f3, beach);
expectEqual('4 of 5 left: nobody told', [alerts('f1').length, alerts('f6').length, alerts('ahmad').length], [0, 0, 0]);
await join(f5, beach);
expectEqual('3 left: told f1 (follows khaled), f6 (organising), ahmad (environment)', [alerts('f1').length, alerts('f6').length, alerts('ahmad').length], [1, 1, 1]);
expectEqual('not f3, who joined', alerts('f3').length, 0);
await join(f7, beach);
expectEqual('2 left: nobody told twice', [alerts('f1').length, alerts('f6').length, alerts('ahmad').length], [1, 1, 1]);
const second = await publish({ title: 'تنظيف الشاطئ ٢', starts_at: new Date(NOW + 6 * DAY).toISOString(), ends_at: new Date(NOW + 6 * DAY + 2 * HOUR).toISOString() });
await join(f3, second);
await join(f5, second);
expectEqual('another event the same day: not again (one a day)', [alerts('f1').length, alerts('f6').length], [1, 1]);
h.setClock(h.clock() + DAY + HOUR);
await join(f7, second);
expectEqual('a day later, the next place taken: told about the second', [alerts('f1').length, alerts('f6').length], [2, 2]);
const women = await publish({ title: 'تنظيف للنساء', gender_category: 'female', starts_at: new Date(NOW + 7 * DAY).toISOString(), ends_at: new Date(NOW + 7 * DAY + 2 * HOUR).toISOString() }, fatima);
await join(f6, women);
await join(await login('u_f2'), women);
h.setClock(h.clock() + DAY + HOUR);
await join(await login('u_f4'), women);
expectEqual('women only: f1 and ahmad (men) not told', [alerts('f1').length, alerts('ahmad').length], [2, 2]);
expectEqual('f6 joined it: not told', alerts('f6').length, 2);

await h.done();
