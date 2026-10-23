// Tries to break the rules through the API, as mobile/scripts/check-rules.ts
// does with the offline demo: the same cheats, sent as HTTP requests to the
// server running on a fresh in-memory database with a fixed clock. Every cheat
// must be refused with the same error code. Sign-in, notifications, reports,
// warnings, editing the profile and account deletion are checked too.
// Run: npm run check:api

import { eq } from 'drizzle-orm';

import type { AdminEventDetail } from '../../shared/admin-api';
import type {
  EventDetail,
  EventFormMeta,
  EventProposal,
  EventSummary,
  MeResponse,
  MyReport,
  MyWarning,
  ProfileResponse,
  ReportFormMeta,
  RosterResponse,
} from '../../shared/api';
import { PHOTO_MAX_BYTES } from '../../shared/rules';
import * as s from '../src/db/schema';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const h = await startHarness(NOW);
const { conn, seed, sentCodes, pushes, call, login, expectError, expectOk, expectEqual, settle } = h;

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
h.setClock(new Date(running.ends_at).getTime() + 1000);
const closed = (await call('GET', '/me/attendance', f1)).body.find((x: { event: { id: string } }) => x.event.id === 'e01').attendance;
expectEqual('open attendance closed at event end', [closed.end_source, closed.ended_at], ['auto_closed', running.ends_at]);
await expectError('record a finish after auto-close', 'already_ended', call('POST', '/events/e01/attendance/u_f1/end', khaled));
await settle();
expectEqual('auto-close → participant asked to confirm, once', pushesTo(TOKEN_F1).map((p) => p.data.attendance_id), [closed.id]);
expectEqual('English phone, English text', pushesTo(TOKEN_F1)[0]?.body.startsWith('Your activity at'), true);
await expectError('scheduler endpoint off without a secret', 'not_found', call('POST', '/internal/tick'));

// ---------------------------------------------------------------------------
console.log('\n— proposing an event in the app');
const HOUR = 3_600_000;
const proposal = (over: Partial<EventProposal> = {}): EventProposal => ({
  title: 'تنظيف حديقة الحي',
  description: 'جمع المخلفات من الحديقة.',
  subtype: 'street_cleanup',
  address_text: 'حديقة الحي، طرابلس',
  lat: 32.88,
  lng: 13.19,
  starts_at: iso(h.clock() + 72 * HOUR),
  ends_at: iso(h.clock() + 75 * HOUR),
  capacity: 15,
  gender_category: 'mixed',
  branch_ids: ['b01', 'b16'],
  terms: ['أحضر قفازيك.'],
  ...over,
});
const meOf = async (token: string): Promise<MeResponse> => (await call('GET', '/me', token)).body;
expectEqual('a level-1 member may not create events, and is told the level that opens it', [(await meOf(ahmad)).can_create_events, (await meOf(ahmad)).create_events_level], [false, 5]);
expectEqual('a supervisor may', (await meOf(khaled)).can_create_events, true);
await expectError('a member below that level proposes', 'cannot_create_events', call('POST', '/events', ahmad, proposal()));
await expectError('or opens the form', 'cannot_create_events', call('GET', '/events/form', ahmad));
await expectError('a man proposes a women-only event', 'category_not_allowed', call('POST', '/events', khaled, proposal({ gender_category: 'female' })));
await expectError('an event that has already started', 'starts_in_past', call('POST', '/events', khaled, proposal({ starts_at: iso(h.clock() - HOUR) })));
await expectError('a type that does not exist', 'invalid_request', call('POST', '/events', khaled, proposal({ subtype: 'party' })));
await expectError('no branch of faith', 'invalid_request', call('POST', '/events', khaled, proposal({ branch_ids: [] })));
await expectError('a branch that does not exist', 'invalid_request', call('POST', '/events', khaled, proposal({ branch_ids: ['b99'] })));
const form: EventFormMeta = await expectOk('the form', call('GET', '/events/form', khaled));
expectEqual('it says the event waits for approval', [form.publishes_directly, form.waiting, form.max_waiting, form.branches.length], [false, 0, 3, 20]);
const proposed = await expectOk('a supervisor proposes an event', call('POST', '/events', khaled, proposal()));
expectEqual('it waits for an admin', proposed.status, 'draft');
const asCreator = ((await call('GET', '/events', khaled)).body as EventSummary[]).find((e) => e.id === proposed.id);
expectEqual('its creator sees it, as its supervisor, with the points of its type', [asCreator?.status, asCreator?.i_created, asCreator?.i_organize, asCreator?.base_points], ['draft', true, true, 30]);
expectEqual('nobody else sees it', ((await call('GET', '/events', ahmad)).body as EventSummary[]).some((e) => e.id === proposed.id), false);
await expectError('or opens it', 'not_found', call('GET', `/events/${proposed.id}`, ahmad));
await expectError('or joins it', 'not_found', call('POST', `/events/${proposed.id}/join`, ahmad));
expectEqual('its creator opens it, with its terms', (await call('GET', `/events/${proposed.id}`, khaled)).body.terms.length, 1);
const second = await expectOk('a second proposal', call('POST', '/events', khaled, proposal({ title: 'تشجير الطريق' })));
const third = await expectOk('a third', call('POST', '/events', khaled, proposal({ title: 'سقيا الماء' })));
await expectError('a fourth while three wait', 'too_many_proposals', call('POST', '/events', khaled, proposal()));
const admin = await login('u_admin');
const byAdmin = await expectOk("an admin's event made in the app", call('POST', '/events', admin, proposal({ title: 'حملة الإدارة' })));
expectEqual('is published at once', [byAdmin.status, ((await call('GET', '/events', ahmad)).body as EventSummary[]).some((e) => e.id === byAdmin.id)], ['published', true]);

console.log('\n— the proposer edits or withdraws his waiting event');
const edited = (over: Partial<EventProposal> = {}) =>
  proposal({ title: 'حلقة تلاوة في الحديقة', subtype: 'quran_circle', branch_ids: ['b01'], terms: ['أحضر مصحفك.', 'احضر قبل الموعد بربع ساعة.'], ...over });
const editDraft = (token: string, id: string, body = edited()) => call('PUT', `/events/${id}`, token, body);
await expectError('a member edits his proposal', 'not_found', editDraft(ahmad, proposed.id));
await expectError('or withdraws it', 'not_found', call('DELETE', `/events/${proposed.id}`, ahmad));
await expectError('another supervisor edits it', 'not_found', editDraft(fatima, proposed.id));
await expectError('he makes it women-only', 'category_not_allowed', editDraft(khaled, proposed.id, edited({ gender_category: 'female' })));
await expectError('he moves it into the past', 'starts_in_past', editDraft(khaled, proposed.id, edited({ starts_at: iso(h.clock() - HOUR) })));
await expectError('a type that does not exist', 'invalid_request', editDraft(khaled, proposed.id, edited({ subtype: 'party' })));
await expectError('ending before it starts', 'invalid_request', editDraft(khaled, proposed.id, edited({ ends_at: iso(h.clock() + 71 * HOUR) })));
await expectOk('an admin adds a supervisor to it in the panel', call('PUT', `/admin/events/${proposed.id}`, admin, { ...proposal(), organizer_ids: ['u_khaled', 'u_fatima'] }));
await expectOk('he edits it while three wait (it does not count itself)', editDraft(khaled, proposed.id));
const afterEdit: EventDetail = (await call('GET', `/events/${proposed.id}`, khaled)).body;
expectEqual('the edit shows, with the points of its new type, still waiting', [afterEdit.title, afterEdit.status, afterEdit.base_points, afterEdit.branches.map((b) => b.id), afterEdit.terms.map((x) => x.text)], [
  'حلقة تلاوة في الحديقة',
  'draft',
  20,
  ['b01'],
  ['أحضر مصحفك.', 'احضر قبل الموعد بربع ساعة.'],
]);
const draftOrganizers = ((await call('GET', `/admin/events/${proposed.id}`, admin)).body as AdminEventDetail).organizers.map((o) => o.id).sort();
expectEqual('the supervisor the admin added stays', draftOrganizers, ['u_fatima', 'u_khaled']);
await expectError('an admin edits a published event in the app', 'proposal_not_waiting', editDraft(admin, byAdmin.id));
await expectError('a supervisor edits a published event he runs', 'proposal_not_waiting', editDraft(khaled, 'e02'));
await expectError('or withdraws it', 'proposal_not_waiting', call('DELETE', '/events/e02', khaled));
await expectOk('an admin turns one down', call('POST', `/admin/events/${second.id}/reject`, admin, {}));
await expectError('he edits it after the decision', 'proposal_not_waiting', editDraft(khaled, second.id));
await expectError('or withdraws it', 'proposal_not_waiting', call('DELETE', `/events/${second.id}`, khaled));
await expectOk('he withdraws one still waiting', call('DELETE', `/events/${third.id}`, khaled));
await expectError('it is gone, even for him', 'not_found', call('GET', `/events/${third.id}`, khaled));
expectEqual('from his list too', ((await call('GET', '/events', khaled)).body as EventSummary[]).some((e) => e.id === third.id), false);
await expectError('withdrawn twice', 'not_found', call('DELETE', `/events/${third.id}`, khaled));
expectEqual('one waits now', ((await call('GET', '/events/form', khaled)).body as EventFormMeta).waiting, 1);

// ---------------------------------------------------------------------------
console.log('\n— profile photos');
// A JPEG header with an EXIF segment saying where it was taken. The server
// checks the file's segments and removes the metadata; it does not decode the picture.
const segment = (marker: number, payload: Buffer) =>
  Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  segment(0xe1, Buffer.from('Exif\0\0GPS 32.8872N 13.1913E', 'latin1')),
  segment(0xdb, Buffer.alloc(65, 1)),
  Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]),
]);
const b64 = (bytes: Buffer) => ({ jpeg_base64: bytes.toString('base64') });
await expectError('a file that is not a JPEG', 'photo_invalid', call('PUT', '/me/photo', ahmad, b64(Buffer.from('<svg onload="alert(1)"/>'))));
await expectError('a photo too big', 'photo_invalid', call('PUT', '/me/photo', ahmad, b64(Buffer.concat([jpeg, Buffer.alloc(PHOTO_MAX_BYTES)]))));
await expectError('text that is not base64', 'photo_invalid', call('PUT', '/me/photo', ahmad, { jpeg_base64: 'not base64!' }));
const { avatar_url } = await expectOk('a member adds a photo', call('PUT', '/me/photo', ahmad, b64(jpeg)));
expectEqual('his profile points to it', (await meOf(ahmad)).user.avatar_url, avatar_url);
const seen = await h.raw(avatar_url, khaled);
expectEqual("a man sees another man's photo", [seen.status, seen.type], [200, 'image/jpeg']);
expectEqual('as a JPEG without its metadata', [seen.bytes[0], seen.bytes[1], seen.bytes.includes('Exif'), seen.bytes.includes('GPS'), seen.bytes.includes('JFIF')], [0xff, 0xd8, false, false, true]);
expectEqual('a woman does not (no photo, as far as she can tell)', (await h.raw(avatar_url, mariam)).status, 404);
expectEqual('an admin and the owner do', [(await h.raw(avatar_url, admin)).status, (await h.raw(avatar_url, ahmad)).status], [200, 200]);
expectEqual('nobody signed out does', (await h.raw(avatar_url)).status, 401);
const listedFor = async (token: string) =>
  ((await call('GET', '/events/e10', token)).body as EventDetail).participants.find((p) => p.id === 'u_ahmad')?.avatar_url;
expectEqual('among participants: with his photo for a man, without it for a woman', [await listedFor(khaled), await listedFor(mariam)], [avatar_url, null]);
h.setClock(h.clock() + 1000);
const renewed = (await call('PUT', '/me/photo', ahmad, b64(jpeg))).body.avatar_url;
expectEqual('a new photo gets a new address, so no phone shows the old one', renewed !== avatar_url, true);
await expectOk('remove the photo', call('DELETE', '/me/photo', ahmad));
expectEqual('gone from the profile and the server', [(await meOf(ahmad)).user.avatar_url, (await h.raw(renewed, khaled)).status], [null, 404]);

// ---------------------------------------------------------------------------
console.log('\n— editing the profile');
const editMe = (body: object) => call('PATCH', '/me', ahmad, body);
const ahmadBefore = (await meOf(ahmad)).user;
await expectError('signed out', 'unauthorized', call('PATCH', '/me', undefined, { city: 'مصراتة' }));
await expectError('a name of one letter', 'invalid_request', editMe({ full_name: ' أ ' }));
await expectError('a name too long', 'invalid_request', editMe({ full_name: 'أ'.repeat(101) }));
await expectError('an empty city', 'invalid_request', editMe({ city: '   ' }));
await expectError('nothing to change', 'invalid_request', editMe({}));
await expectError('his gender', 'invalid_request', editMe({ full_name: 'أحمد', gender: 'female' }));
await expectError('his phone', 'invalid_request', editMe({ phone: '+218910000000' }));
await expectError('his role', 'invalid_request', editMe({ role: 'admin' }));
const renamed: ProfileResponse = await expectOk('he changes his name and city', editMe({ full_name: '  أحمد سالم  ', city: ' مصراتة ' }));
expectEqual('trimmed; gender, phone and role as they were', [renamed.user.full_name, renamed.user.city, renamed.user.gender, renamed.user.phone, renamed.user.role], [
  'أحمد سالم',
  'مصراتة',
  ahmadBefore.gender,
  ahmadBefore.phone,
  ahmadBefore.role,
]);
await expectOk('only his city', editMe({ city: 'طرابلس' }));
const ahmadAfter = (await meOf(ahmad)).user;
expectEqual('his name stays', [ahmadAfter.full_name, ahmadAfter.city], ['أحمد سالم', 'طرابلس']);
expectEqual('others see the new name', ((await call('GET', '/events/e10', khaled)).body as EventDetail).participants.find((p) => p.id === 'u_ahmad')?.full_name, 'أحمد سالم');

// ---------------------------------------------------------------------------
console.log('\n— reports (بلاغ)');
const reportForm: ReportFormMeta = await expectOk('the report form', call('GET', '/reports/form', ahmad));
const atE01 = reportForm.events.find((x) => x.event.id === 'e01');
expectEqual('it offers the events he was at, with the people there but not himself', [
  reportForm.events.some((x) => x.event.id === 'e04'),
  !!atE01,
  atE01?.people.some((p) => p.user.id === 'u_ahmad'),
  atE01?.people.find((p) => p.user.id === 'u_khaled')?.supervisor,
], [false, true, false, true]);
const report = (body: object) => call('POST', '/reports', ahmad, body);
await expectError('a category that does not exist', 'invalid_request', report({ category: 'gossip' }));
await expectError('"something else" without a word', 'note_required', report({ category: 'other', note: '   ' }));
await expectError('about an event he was not at', 'not_at_event', report({ category: 'safety', event_id: 'e04' }));
await expectError('naming someone who was not at that event', 'person_not_at_event', report({ category: 'behaviour', event_id: 'e01', subject_id: 'u_f5' }));
await expectError('naming someone without an event', 'person_not_at_event', report({ category: 'behaviour', subject_id: 'u_f1' }));
await expectError('naming himself', 'cannot_report_self', report({ category: 'behaviour', event_id: 'e01', subject_id: 'u_ahmad' }));
await expectError('about a proposal nobody else may see', 'not_found', report({ category: 'event', event_id: proposed.id }));
const filed: MyReport = await expectOk(
  'report someone at his event',
  report({ category: 'behaviour', event_id: 'e01', subject_id: 'u_f1', note: '  رمى المخلفات في الطريق.  ' }),
);
expectEqual('it waits for an admin, the note trimmed', [filed.report.status, filed.report.note, filed.event?.id, filed.subject?.id], [
  'open',
  'رمى المخلفات في الطريق.',
  'e01',
  'u_f1',
]);
h.setClock(h.clock() + 1000);
await expectOk('report a problem in the app: no event, no note', report({ category: 'app' }));
expectEqual('he sees his reports, latest first', ((await call('GET', '/me/reports', ahmad)).body as MyReport[]).map((r) => r.report.category), ['app', 'behaviour']);
expectEqual("nobody else sees them, not even the one named", (await call('GET', '/me/reports', f1)).body, []);
for (let i = 0; i < 3; i++) await report({ category: 'safety' });
await expectError('a sixth while five wait', 'too_many_reports', report({ category: 'safety' }));
await conn.db.update(s.levels).set({ can_report: false });
await expectError('reporting below the level that allows it', 'cannot_report', call('POST', '/reports', mariam, { category: 'app' }));
await expectError('or opening the form', 'cannot_report', call('GET', '/reports/form', mariam));
expectEqual('her profile says so; a supervisor may still', [(await meOf(mariam)).can_report, (await meOf(khaled)).can_report], [false, true]);
await conn.db.update(s.levels).set({ can_report: true });

// ---------------------------------------------------------------------------
console.log('\n— warnings (إنذار)');
const TOKEN_MARIAM = 'ExponentPushToken[mariam-phone]';
await call('PUT', '/me/push-token', mariam, { token: TOKEN_MARIAM, lang: 'ar' });
const warn = (token: string, eventId: string, userId: string, reason = 'تأخر ساعة دون إبلاغ.') =>
  call('POST', `/events/${eventId}/warnings/${userId}`, token, { reason });
await expectError('a member gives a warning', 'not_organizer', warn(ahmad, 'e01', 'u_f1'));
await expectError('a supervisor of ANOTHER event', 'not_organizer', warn(fatima, 'e01', 'u_mariam'));
await expectError('a supervisor warns someone not at his event', 'not_joined', warn(khaled, 'e01', 'u_f5'));
await expectError('a supervisor warns himself', 'cannot_warn_self', warn(khaled, 'e01', 'u_khaled'));
await expectError('before the event starts', 'event_not_started', warn(khaled, 'e02', 'u_f3'));
await expectError('more than a week after it ended', 'event_closed', warn(khaled, 'e13', 'u_ahmad'));
await expectError('without a reason', 'reason_required', warn(khaled, 'e01', 'u_mariam', '   '));
const mariamPoints = await totalOf(mariam);
const given = (await expectOk('a supervisor warns someone at his event', warn(khaled, 'e01', 'u_mariam', 'صوّرت المشاركين دون إذنهم.'))).warning;
await expectError('the same supervisor, twice', 'already_warned', warn(khaled, 'e01', 'u_mariam'));
await settle();
expectEqual('she is told, without the reason (it shows on a locked screen)', pushesTo(TOKEN_MARIAM).map((p) => [p.data.type, p.data.warning_id, p.body]), [
  ['warning_given', given.id, 'سجّل لك مشرف «حملة نظافة السراج» إنذاراً. افتح التطبيق لتقرأ سببه، ولك أن تتظلّم منه.'],
]);
const warnedRoster: RosterResponse = (await call('GET', '/events/e01/roster', khaled)).body;
expectEqual('his roster shows whom he warned', warnedRoster.participants.filter((p) => p.i_warned).map((p) => p.user.id), ['u_mariam']);
const hers: MyWarning[] = (await call('GET', '/me/warnings', mariam)).body;
expectEqual('she sees it, with who gave it', hers.map((w) => [w.warning.id, w.warning.reason, w.warning.status, w.issued_by?.id]), [
  [given.id, 'صوّرت المشاركين دون إذنهم.', 'active', 'u_khaled'],
]);
expectEqual('her profile counts it', (await meOf(mariam)).warnings, 1);
expectEqual('nobody else sees it', (await call('GET', '/me/warnings', ahmad)).body, []);
await expectError('another member opens it', 'not_your_warning', call('GET', `/warnings/${given.id}`, ahmad));
await expectError('or appeals it', 'not_your_warning', call('POST', `/warnings/${given.id}/appeal`, ahmad, { reason: 'ظُلمت.' }));
expectEqual('a warning takes no points', await totalOf(mariam), mariamPoints);
await expectOk('and blocks nothing: she still joins an event', joinFully(mariam, 'e02'));
await expectError('an appeal without a reason', 'reason_required', call('POST', `/warnings/${given.id}/appeal`, mariam, { reason: '' }));
const appealed: MyWarning = await expectOk('she appeals', call('POST', `/warnings/${given.id}/appeal`, mariam, { reason: 'استأذنتهم قبل التصوير.' }));
expectEqual('it waits for an admin', [appealed.warning.status, appealed.warning.appeal_reason], ['appealed', 'استأذنتهم قبل التصوير.']);
await expectError('appeal twice', 'already_appealed', call('POST', `/warnings/${given.id}/appeal`, mariam, { reason: 'مرة أخرى.' }));

// ---------------------------------------------------------------------------
console.log('\n— deleting an account');
await call('PUT', '/me/push-token', signup.token, { token: TOKEN_NEW, lang: 'ar' });
const newPhoto = (await call('PUT', '/me/photo', signup.token, b64(jpeg))).body.avatar_url;
await expectOk('delete my account', call('DELETE', '/me', signup.token));
expectEqual("the account's phones are forgotten", await tokenOwner(TOKEN_NEW), null);
expectEqual('and its photo', (await h.raw(newPhoto, admin)).status, 404);
await expectError('old token stops working', 'unauthorized', call('GET', '/me', signup.token));
h.setClock(h.clock() + 2 * 60_000);
await call('POST', '/auth/request-code', undefined, { phone: phoneB });
await expectError('the phone can sign up again', 'profile_required', call('POST', '/auth/verify-code', undefined, { phone: phoneB, code: sentCodes.get(phoneB) }));

await h.done();
