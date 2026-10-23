// Tries to break the admin panel's rules through the API: non-admins knocking,
// an admin changing their own role, edits that would change what people
// already agreed to, settling a dispute twice, a supervisor closing a report,
// keeping a warning nobody appealed. Every attempt must be refused,
// and every decision must land in the audit log.
// Run: npm run check:api (runs this after check-api.ts)

import type { EventDetail, EventSummary, MyReport, MyWarning } from '../../shared/api';
import type {
  AdminEventDetail,
  AdminEventRow,
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  AdminWarningRow,
  AuditEntry,
  CreateEventBody,
  EventInput,
} from '../../shared/admin-api';
import type { PushMessage } from '../src/push';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual, settle, pushes } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad');
const mariam = await login('u_mariam');
const khaled = await login('u_khaled');
const f1 = await login('u_f1');

// A phone for everyone in this script, so a notification to the wrong person shows up.
for (const [token, user, lang] of [
  ['ahmad', ahmad, 'ar'],
  ['mariam', mariam, 'en'],
  ['f1', f1, 'ar'],
  ['khaled', khaled, 'ar'],
  ['admin', admin, 'ar'],
] as const) {
  await call('PUT', '/me/push-token', user, { token: `ExponentPushToken[${token}]`, lang });
}
let seen = 0;
/** Notifications about events sent since the last look. */
async function eventNews() {
  await h.settle();
  const fresh = h.pushes.slice(seen).filter((p) => p.data.event_id);
  seen = h.pushes.length;
  return fresh;
}
const who = (messages: PushMessage[]) => messages.map((m) => m.to.slice('ExponentPushToken['.length, -1)).sort();
const bodyFor = (messages: PushMessage[], phone: string) => messages.find((m) => m.to === `ExponentPushToken[${phone}]`)?.body;
/** How the server should write a time: the association's zone, Western digits. */
const tripoli = (locale: string, ms: number, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'Africa/Tripoli', ...opts }).format(ms);
const DAY: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const CLOCK: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const inputFrom = (d: AdminEventDetail): EventInput => ({
  title: d.event.title,
  description: d.event.description,
  subtype: d.event.subtype,
  address_text: d.event.address_text,
  lat: d.event.lat,
  lng: d.event.lng,
  starts_at: d.event.starts_at,
  ends_at: d.event.ends_at,
  capacity: d.event.capacity,
  gender_category: d.event.gender_category,
  branch_ids: d.branches.map((b) => b.id),
  organizer_ids: d.organizers.map((o) => o.id),
  terms: d.terms.map((t) => t.text ?? ''),
});
const detail = async (id: string): Promise<AdminEventDetail> => (await call('GET', `/admin/events/${id}`, admin)).body;
const totalOf = async (token: string): Promise<number> => (await call('GET', '/me', token)).body.total_points;

async function joinFully(token: string, eventId: string) {
  await call('POST', `/events/${eventId}/join`, token);
  const d: EventDetail = (await call('GET', `/events/${eventId}`, token)).body;
  for (const term of d.terms) await call('POST', `/events/${eventId}/terms/${term.id}/accept`, token);
  return call('POST', `/events/${eventId}/join/complete`, token);
}

// ---------------------------------------------------------------------------
console.log('\n— who may use the admin panel');
await expectError('not signed in', 'unauthorized', call('GET', '/admin/overview'));
await expectError('a member', 'forbidden', call('GET', '/admin/overview', ahmad));
await expectError('a supervisor', 'forbidden', call('GET', '/admin/overview', khaled));
const overview: AdminOverview = await expectOk('an admin', call('GET', '/admin/overview', admin));
expectEqual('overview counts', [overview.users, overview.running_events, overview.awaiting_confirmation, overview.open_disputes], [13, 1, 3, 0]);

// ---------------------------------------------------------------------------
console.log('\n— people and roles');
const found: AdminUserRow[] = (await call('GET', `/admin/users?q=${encodeURIComponent('أحمد')}`, admin)).body;
expectEqual('search by name, with confirmed hours', found.map((u) => [u.id, u.confirmed_hours]), [['u_ahmad', 5.5]]);
expectEqual('search by phone', (await call('GET', '/admin/users?q=911000000', admin)).body.map((u: AdminUserRow) => u.id), ['u_ahmad']);
expectEqual('wildcards are only text', (await call('GET', '/admin/users?q=%25', admin)).body.length, 0);
await expectOk('make a member a supervisor', call('PATCH', '/admin/users/u_f1', admin, { role: 'supervisor' }));
expectEqual('role changed', (await call('GET', '/me', f1)).body.user.role, 'supervisor');
await expectError('an admin changes their own role', 'cannot_change_own_role', call('PATCH', '/admin/users/u_admin', admin, { role: 'member' }));
await expectError('a role that does not exist', 'invalid_request', call('PATCH', '/admin/users/u_f1', admin, { role: 'owner' }));
await expectError('someone who does not exist', 'not_found', call('PATCH', '/admin/users/nobody', admin, { role: 'member' }));

// ---------------------------------------------------------------------------
console.log('\n— creating events');
const meta = (await call('GET', '/admin/meta', admin)).body;
expectEqual('form choices', [meta.branches.length, meta.subtypes.find((x: { id: string }) => x.id === 'street_cleanup')?.base_points], [20, 30]);
const base: CreateEventBody = {
  title: 'حملة نظافة تجريبية',
  description: 'تنظيف الساحة.',
  subtype: 'street_cleanup',
  address_text: 'طرابلس',
  lat: 32.88,
  lng: 13.19,
  starts_at: iso(NOW + 48 * HOUR),
  ends_at: iso(NOW + 51 * HOUR),
  capacity: 10,
  gender_category: 'mixed',
  branch_ids: ['b01'],
  organizer_ids: [],
  terms: ['البند الأول', 'البند الثاني'],
  publish: false,
};
await expectError('ends before it starts', 'invalid_request', call('POST', '/admin/events', admin, { ...base, ends_at: iso(NOW) }));
await expectError('a branch that does not exist', 'invalid_request', call('POST', '/admin/events', admin, { ...base, branch_ids: ['b99'] }));
await expectError('published with nobody to record attendance', 'needs_organizer', call('POST', '/admin/events', admin, { ...base, publish: true }));
const { id } = await expectOk('save a draft', call('POST', '/admin/events', admin, base));
const draft = await detail(id);
expectEqual('draft with its terms and points', [draft.event.status, draft.terms.length, draft.event.base_points], ['draft', 2, 30]);
expectEqual('a draft is not in the app', (await call('GET', '/events', ahmad)).body.some((e: EventSummary) => e.id === id), false);
await expectError('nor can it be opened there', 'not_found', call('GET', `/events/${id}`, ahmad));
await expectError('publish without a supervisor', 'needs_organizer', call('POST', `/admin/events/${id}/publish`, admin));
await expectOk('add a supervisor', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(draft), organizer_ids: ['u_f1'] }));
await expectOk('publish', call('POST', `/admin/events/${id}/publish`, admin));
await expectError('publish twice', 'invalid_status_change', call('POST', `/admin/events/${id}/publish`, admin));
expectEqual('now in the app', (await call('GET', '/events', ahmad)).body.some((e: EventSummary) => e.id === id), true);
expectEqual('changing a draft tells nobody', (await eventNews()).length, 0);

// ---------------------------------------------------------------------------
console.log('\n— editing what people agreed to');
await expectOk('a member joins (terms accepted)', joinFully(ahmad, id));
await expectOk('a second member joins', joinFully(mariam, id));
await call('POST', `/events/${id}/join`, khaled); // still reading the terms: not joined
const joined = await detail(id);
await expectError('change the terms after someone accepted them', 'terms_locked', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(joined), terms: ['بند جديد'] }));
await expectError('make it women-only after men joined', 'category_locked', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(joined), gender_category: 'female' }));
await expectError('fewer seats than people joined', 'capacity_below_joined', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(joined), capacity: 1 }));
await expectError('remove the last supervisor of a published event', 'needs_organizer', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(joined), organizer_ids: [] }));
await expectOk('fix the title', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(joined), title: 'حملة نظافة الساحة' }));
expectEqual('the app shows the new title', (await call('GET', `/events/${id}`, ahmad)).body.title, 'حملة نظافة الساحة');
expectEqual('a corrected title tells nobody', (await eventNews()).length, 0);

const start = NOW + 49 * HOUR;
const end = NOW + 52 * HOUR;
await expectOk('move it an hour later', call('PUT', `/admin/events/${id}`, admin, { ...inputFrom(await detail(id)), starts_at: iso(start), ends_at: iso(end) }));
const moved = await eventNews();
expectEqual('the members who joined and the supervisor are told', who(moved), ['ahmad', 'f1', 'mariam']);
expectEqual(
  'with the new time, in Arabic',
  bodyFor(moved, 'ahmad'),
  `تغيّر موعد «حملة نظافة الساحة». الموعد الجديد: ${tripoli('ar-LY-u-nu-latn', start, DAY)}، ${tripoli('ar-LY-u-nu-latn', start, CLOCK)} – ${tripoli('ar-LY-u-nu-latn', end, CLOCK)}.`,
);
expectEqual(
  'and in English on an English phone',
  bodyFor(moved, 'mariam'),
  `"حملة نظافة الساحة" has a new time: ${tripoli('en-GB', start, DAY)}, ${tripoli('en-GB', start, CLOCK)} – ${tripoli('en-GB', end, CLOCK)}.`,
);
await expectOk('move it to another place', call('PUT', `/admin/events/${id}`, admin, {
  ...inputFrom(await detail(id)),
  address_text: 'ساحة الشهداء، طرابلس',
  lat: 32.8955,
  lng: 13.1803,
}));
const relocated = await eventNews();
expectEqual('told the new place', [who(relocated), bodyFor(relocated, 'ahmad')], [
  ['ahmad', 'f1', 'mariam'],
  'تغيّر مكان «حملة نظافة الساحة». المكان الجديد: ساحة الشهداء، طرابلس.',
]);
const running = await detail('e01');
await expectError('move an event that has recorded attendance', 'locked_after_attendance', call('PUT', '/admin/events/e01', admin, { ...inputFrom(running), starts_at: iso(NOW - 2 * HOUR) }));
await expectError('cancel an event that has recorded attendance', 'invalid_status_change', call('POST', '/admin/events/e01/cancel', admin));
await expectError('edit a finished event', 'event_not_editable', call('PUT', '/admin/events/e13', admin, inputFrom(await detail('e13'))));
await expectOk('cancel an event before it starts', call('POST', `/admin/events/${id}/cancel`, admin));
const cancelled = await eventNews();
expectEqual('everyone concerned is told it was cancelled', [who(cancelled), bodyFor(cancelled, 'mariam')], [
  ['ahmad', 'f1', 'mariam'],
  '"حملة نظافة الساحة" has been cancelled. We hope to see you at another event.',
]);
expectEqual('the app shows it cancelled', (await call('GET', `/events/${id}`, ahmad)).body.status, 'cancelled');
await expectError('join a cancelled event', 'event_closed', call('POST', `/events/${id}/join`, f1));

// ---------------------------------------------------------------------------
console.log('\n— settling disputed hours');
await call('PUT', '/me/push-token', ahmad, { token: 'ExponentPushToken[ahmad]', lang: 'ar' });
await expectOk('a member disputes recorded hours', call('POST', '/attendance/att_e15_u_ahmad/dispute', ahmad));
const disputes = (await call('GET', '/admin/disputes', admin)).body;
expectEqual('the admin sees it', disputes.map((d: { attendance: { id: string }; user: { id: string } }) => [d.attendance.id, d.user.id]), [['att_e15_u_ahmad', 'u_ahmad']]);
await expectError('a decision without a reason', 'invalid_request', call('POST', '/admin/disputes/att_e15_u_ahmad/resolve', admin, { decision: 'accept', note: '' }));
await expectError('more hours than the event lasted', 'hours_out_of_range', call('POST', '/admin/disputes/att_e15_u_ahmad/resolve', admin, { decision: 'correct', hours: 99, note: 'خطأ' }));
const before = await totalOf(ahmad);
await expectOk('correct the hours to 2', call('POST', '/admin/disputes/att_e15_u_ahmad/resolve', admin, { decision: 'correct', hours: 2, note: 'غادر قبل نهاية الحملة' }));
// Beach clean-up: 30 points × (2 h / 3 h event), all physical.
expectEqual('points credited for the corrected hours', Math.round(((await totalOf(ahmad)) - before) * 100) / 100, 20);
await settle();
expectEqual('the member is told', pushes.filter((p) => p.data.type === 'dispute_settled').map((p) => p.body), ['عُدّلت ساعاتك في «تنظيف شاطئ طرابلس» إلى 2 ساعة.']);
await expectError('settle it twice', 'not_disputed', call('POST', '/admin/disputes/att_e15_u_ahmad/resolve', admin, { decision: 'accept', note: 'مكرر' }));
await expectOk('another member disputes', call('POST', '/attendance/att_e15_u_mariam/dispute', mariam));
const mariamBefore = await totalOf(mariam);
await expectOk('decide the hours do not count', call('POST', '/admin/disputes/att_e15_u_mariam/resolve', admin, { decision: 'reject', note: 'لم تحضر' }));
expectEqual('no points', await totalOf(mariam), mariamBefore);
await expectOk('a member disputes hours still being worked', call('POST', '/attendance/att_e01_u_f1/dispute', f1));
await expectError('settle before the finish is known', 'still_open', call('POST', '/admin/disputes/att_e01_u_f1/resolve', admin, { decision: 'accept', note: 'لاحقاً' }));

// ---------------------------------------------------------------------------
console.log('\n— hours report');
const report = (await call('GET', `/admin/reports/hours?from=${iso(NOW - 30 * 24 * HOUR)}&to=${iso(NOW + 24 * HOUR)}`, admin)).body;
const rowOf = (userId: string) => report.find((r: { user_id: string }) => r.user_id === userId);
expectEqual("a member's confirmed hours and events", [rowOf('u_ahmad')?.hours, rowOf('u_ahmad')?.events], [7.5, 3]);
expectEqual('the same points as their profile', rowOf('u_ahmad')?.total_points, await totalOf(ahmad));
expectEqual('hours that do not count, counted as 0', [rowOf('u_mariam')?.hours, rowOf('u_mariam')?.events], [3, 2]);
await expectError('a period that ends before it starts', 'invalid_request', call('GET', `/admin/reports/hours?from=${iso(NOW)}&to=${iso(NOW - HOUR)}`, admin));

// ---------------------------------------------------------------------------
console.log('\n— audit log');
const log: AuditEntry[] = (await call('GET', '/admin/audit', admin)).body;
expectEqual('every decision, newest first', log.map((e) => e.action), [
  'resolve_dispute',
  'resolve_dispute',
  'cancel_event',
  'update_event',
  'update_event',
  'update_event',
  'publish_event',
  'update_event',
  'create_event',
  'change_role',
]);
expectEqual('with who made it', log.every((e) => e.actor?.id === 'u_admin'), true);
const role = log.find((e) => e.action === 'change_role')!.details;
expectEqual('and what changed', [log.filter((e) => e.action === 'update_event').map((e) => e.details.changed), role.from, role.to], [
  [['address_text', 'lat', 'lng'], ['starts_at', 'ends_at'], ['title'], []],
  'member',
  'supervisor',
]);

// ---------------------------------------------------------------------------
console.log('\n— events proposed in the app');
const { organizer_ids: _, publish: __, ...proposal } = base;
await eventNews();
const approved = (await call('POST', '/events', khaled, { ...proposal, title: 'تنظيف حديقة الحي' })).body.id;
const turnedDown = (await call('POST', '/events', khaled, { ...proposal, title: 'سقيا الماء في السوق' })).body.id;
expectEqual('the overview counts them', ((await call('GET', '/admin/overview', admin)).body as AdminOverview).proposals_waiting, 2);
const rows: AdminEventRow[] = (await call('GET', '/admin/events', admin)).body;
const row = rows.find((r) => r.event.id === approved);
expectEqual('with who proposed it, as its supervisor', [row?.event.status, row?.creator?.id, row?.creator?.role, row?.organizers.map((o) => o.id)], [
  'draft',
  'u_khaled',
  'supervisor',
  ['u_khaled'],
]);
await expectError('cancel a proposal (it is turned down instead)', 'invalid_status_change', call('POST', `/admin/events/${approved}/cancel`, admin));
await expectOk('approve one: publish it', call('POST', `/admin/events/${approved}/publish`, admin));
expectEqual('everyone sees it now', ((await call('GET', '/events', ahmad)).body as EventSummary[]).some((e) => e.id === approved), true);
const approval = await eventNews();
expectEqual('only its creator is told', [who(approval), approval[0]?.data.type, bodyFor(approval, 'khaled')], [
  ['khaled'],
  'event_approved',
  'اعتمدت إدارة الجمعية «تنظيف حديقة الحي»، وهي الآن على الخريطة.',
]);
await expectError('a reason longer than the limit', 'invalid_request', call('POST', `/admin/events/${turnedDown}/reject`, admin, { note: 'س'.repeat(501) }));
await expectOk('turn the other down, with a reason', call('POST', `/admin/events/${turnedDown}/reject`, admin, { note: 'المكان مزدحم وقت السوق؛ اقترح موعداً صباحياً.' }));
const refusal = await eventNews();
expectEqual('its creator is told why', [who(refusal), refusal[0]?.data.type, bodyFor(refusal, 'khaled')], [
  ['khaled'],
  'event_rejected',
  'لم تعتمد إدارة الجمعية «سقيا الماء في السوق». السبب: المكان مزدحم وقت السوق؛ اقترح موعداً صباحياً.',
]);
expectEqual('it stays out of the app for everyone else', ((await call('GET', '/events', ahmad)).body as EventSummary[]).some((e) => e.id === turnedDown), false);
expectEqual('its creator sees it was not approved', (await call('GET', `/events/${turnedDown}`, khaled)).body.status, 'rejected');
await expectError('nobody can join it', 'not_found', call('POST', `/events/${turnedDown}/join`, khaled));
await expectError('turn down a published event', 'invalid_status_change', call('POST', `/admin/events/${approved}/reject`, admin));
await expectError('publish a turned-down event', 'invalid_status_change', call('POST', `/admin/events/${turnedDown}/publish`, admin));
await expectError('edit a turned-down event', 'event_not_editable', call('PUT', `/admin/events/${turnedDown}`, admin, inputFrom(await detail(turnedDown))));
expectEqual('none wait any more', ((await call('GET', '/admin/overview', admin)).body as AdminOverview).proposals_waiting, 0);
const latest: AuditEntry[] = (await call('GET', '/admin/audit', admin)).body;
expectEqual('both decisions are in the audit log, the reason too', [latest[0].action, latest[0].details.note, latest[1].action], [
  'reject_event',
  'المكان مزدحم وقت السوق؛ اقترح موعداً صباحياً.',
  'publish_event',
]);

// ---------------------------------------------------------------------------
console.log('\n— removing an unsuitable profile photo');
// A JPEG header is enough: the server checks the file's segments, it does not decode the picture.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 1, 1, 0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0xff, 0xd9]);
const { avatar_url: photo } = (await call('PUT', '/me/photo', mariam, { jpeg_base64: jpeg.toString('base64') })).body;
const mariamRow = ((await call('GET', `/admin/users?q=${encodeURIComponent('مريم')}`, admin)).body as AdminUserRow[])[0];
expectEqual('the members list shows her photo', mariamRow?.avatar_url, photo);
expectEqual('an admin sees it, though a man', (await h.raw(photo, admin)).status, 200);
await expectError('a supervisor removes it', 'forbidden', call('DELETE', '/admin/users/u_mariam/photo', khaled));
await expectOk('an admin removes it', call('DELETE', '/admin/users/u_mariam/photo', admin));
expectEqual('gone from her profile and the server', [(await call('GET', '/me', mariam)).body.user.avatar_url, (await h.raw(photo, admin)).status], [null, 404]);
await expectError('remove it twice', 'not_found', call('DELETE', '/admin/users/u_mariam/photo', admin));
await settle();
expectEqual('she is told, in her phone\'s language', pushes.filter((p) => p.data.type === 'photo_removed').map((p) => [p.to, p.title]), [
  ['ExponentPushToken[mariam]', 'Your photo was removed'],
]);
const removal = ((await call('GET', '/admin/audit', admin)).body as AuditEntry[])[0];
expectEqual('the removal is in the audit log', [removal.action, removal.target_id, removal.details.name], ['remove_photo', 'u_mariam', 'مريم علي']);
await expectOk('she can add another', call('PUT', '/me/photo', mariam, { jpeg_base64: jpeg.toString('base64') }));

// ---------------------------------------------------------------------------
console.log("\n— members' reports");
const overviewNow = async (): Promise<AdminOverview> => (await call('GET', '/admin/overview', admin)).body;
const filed: MyReport = (await call('POST', '/reports', ahmad, { category: 'safety', event_id: 'e01', subject_id: 'u_khaled', note: 'لا قفازات تكفي الجميع.' })).body;
await expectError('a supervisor opens the reports', 'forbidden', call('GET', '/admin/reports', khaled));
const open: AdminReportRow[] = (await call('GET', '/admin/reports?status=open', admin)).body;
expectEqual('the admin sees it: who sent it, about which event, who is named', open.map((r) => [r.report.id, r.reporter?.id, r.reporter?.phone, r.event?.id, r.subject?.id]), [
  [filed.report.id, 'u_ahmad', '+218911000000', 'e01', 'u_khaled'],
]);
expectEqual('the overview counts it', (await overviewNow()).open_reports, 1);
await expectError('a status that does not exist', 'invalid_request', call('GET', '/admin/reports?status=lost', admin));
const handle = (token: string, note: string) => call('POST', `/admin/reports/${filed.report.id}/handle`, token, { note });
await expectError('a non-admin closes a report', 'forbidden', handle(khaled, 'تم.'));
await expectError('closed without a note', 'invalid_request', handle(admin, '  '));
await expectOk('an admin marks it handled, with what was done', handle(admin, 'كلّمنا المشرف ووفّرنا قفازات إضافية.'));
await expectError('handled twice', 'already_handled', handle(admin, 'مكرر.'));
await settle();
expectEqual('the reporter is told it was looked at, not what was done', pushes.filter((p) => p.data.type === 'report_handled').map((p) => [p.to, p.body]), [
  ['ExponentPushToken[ahmad]', 'راجعت إدارة الجمعية بلاغك. جزاك الله خيراً على حرصك.'],
]);
expectEqual('the supervisor he named is told nothing', pushes.some((p) => p.to === 'ExponentPushToken[khaled]' && !!p.data.report_id), false);
const seenByReporter = ((await call('GET', '/me/reports', ahmad)).body as MyReport[])[0];
expectEqual('he sees it reviewed, without the admin note', [seenByReporter.report.status, 'handled_note' in seenByReporter.report], ['handled', false]);
const handled: AdminReportRow[] = (await call('GET', '/admin/reports?status=handled', admin)).body;
expectEqual('the admin sees who handled it and how', handled.map((r) => [r.handled_by?.id, r.report.handled_note]), [['u_admin', 'كلّمنا المشرف ووفّرنا قفازات إضافية.']]);
expectEqual('none open now', (await overviewNow()).open_reports, 0);

// ---------------------------------------------------------------------------
console.log('\n— warnings and appeals');
const w1 = (await call('POST', '/events/e01/warnings/u_ahmad', khaled, { reason: 'غادر دون إبلاغ المشرف.' })).body.warning;
const w2 = (await call('POST', '/events/e01/warnings/u_mariam', khaled, { reason: 'تأخرت ساعة.' })).body.warning;
await expectError('a supervisor reads the warnings list', 'forbidden', call('GET', '/admin/warnings', khaled));
const hisWarnings: AdminWarningRow[] = (await call('GET', '/admin/warnings?user_id=u_ahmad', admin)).body;
expectEqual("one member's warnings, with who gave them and where", hisWarnings.map((r) => [r.warning.id, r.user.id, r.issued_by?.id, r.event.id]), [[w1.id, 'u_ahmad', 'u_khaled', 'e01']]);
const warningsOf = async (q: string) => ((await call('GET', `/admin/users?q=${encodeURIComponent(q)}`, admin)).body as AdminUserRow[])[0]?.warnings;
expectEqual('the members list counts them', [await warningsOf('أحمد'), await warningsOf('مريم')], [1, 1]);
const decide = (id: string, decision: 'uphold' | 'withdraw', note = 'رُوجع.') => call('POST', `/admin/warnings/${id}/decide`, admin, { decision, note });
await expectError('keep a warning nobody appealed', 'not_appealed', decide(w1.id, 'uphold'));
await expectOk('he appeals', call('POST', `/warnings/${w1.id}/appeal`, ahmad, { reason: 'أبلغت المشرف المساعد قبل أن أغادر.' }));
expectEqual('the overview counts the appeal', (await overviewNow()).appealed_warnings, 1);
const appeals: AdminWarningRow[] = (await call('GET', '/admin/warnings?status=appealed', admin)).body;
expectEqual('with his reason', appeals.map((r) => [r.warning.id, r.warning.appeal_reason]), [[w1.id, 'أبلغت المشرف المساعد قبل أن أغادر.']]);
await expectError('a decision without a note', 'invalid_request', decide(w1.id, 'uphold', ''));
await expectError('a supervisor decides', 'forbidden', call('POST', `/admin/warnings/${w1.id}/decide`, khaled, { decision: 'withdraw', note: 'سحبته.' }));
await expectOk('an admin keeps it', decide(w1.id, 'uphold', 'لم يكن في الفعالية مشرف مساعد.'));
await expectError('he appeals again', 'already_appealed', call('POST', `/warnings/${w1.id}/appeal`, ahmad, { reason: 'مرة أخرى.' }));
await expectOk('an admin withdraws the other, unasked', decide(w2.id, 'withdraw', 'سُجّل بالخطأ.'));
await expectError('withdraw it twice', 'already_withdrawn', decide(w2.id, 'withdraw'));
await expectError('she appeals a withdrawn warning', 'warning_withdrawn', call('POST', `/warnings/${w2.id}/appeal`, mariam, { reason: 'لم أتأخر.' }));
await settle();
expectEqual("each is told, in their phone's language", pushes.filter((p) => p.data.type === 'warning_decided').map((p) => [p.to, p.title]), [
  ['ExponentPushToken[ahmad]', 'رُوجع تظلّمك'],
  ['ExponentPushToken[mariam]', 'A warning was withdrawn'],
]);
const kept: MyWarning = (await call('GET', `/warnings/${w1.id}`, ahmad)).body;
expectEqual('he reads why in the app, not which admin decided', [kept.warning.status, kept.warning.decision_note, 'decided_by' in kept.warning], [
  'upheld',
  'لم يكن في الفعالية مشرف مساعد.',
  false,
]);
expectEqual('the members list counts only warnings that stand', [await warningsOf('أحمد'), await warningsOf('مريم')], [1, 0]);
await expectOk('a withdrawn warning may be given again', call('POST', '/events/e01/warnings/u_mariam', khaled, { reason: 'تأخرت ساعتين.' }));
const decisions: AuditEntry[] = (await call('GET', '/admin/audit', admin)).body;
expectEqual('every decision is in the audit log', decisions.slice(0, 3).map((e) => [e.action, e.details.note]), [
  ['withdraw_warning', 'سُجّل بالخطأ.'],
  ['uphold_warning', 'لم يكن في الفعالية مشرف مساعد.'],
  ['handle_report', 'كلّمنا المشرف ووفّرنا قفازات إضافية.'],
]);

console.log('\n— a cancelled event');
// Last, since it moves the clock (and so closes open attendance):
// a cancelled event's members stay joined and its supervisors stay, but nobody may work at it.
{
  const tokenOf: Record<string, string> = { u_ahmad: ahmad, u_mariam: mariam, u_khaled: khaled, u_f1: f1 };
  const gone = await detail(id);
  const recorder = gone.organizers.find((o) => tokenOf[o.id])!.id;
  const member = gone.participants.find((p) => p.registration.status === 'joined' && p.user.id !== recorder)!.user.id;
  h.setClock(Date.parse(gone.event.starts_at) + 30 * 60_000);
  await expectError('its supervisor records a start there anyway', 'event_closed', call('POST', `/events/${id}/attendance/${member}/start`, tokenOf[recorder]));
}

await h.done();
