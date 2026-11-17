// Institutions (owner's decisions, 2026-11-17; shared/types.ts Institution):
// asking for one (an admin approves it; whoever asked represents it), asking to
// belong (a representative confirms), proposing events in its name (only its
// representatives, at any level; its first three approved events wait for an
// admin, then they go out at once), and the hours report naming institutions.
// Run: npm run check:api (runs this after check-waitlist.ts)

import type { AdminInstitutionRow, HoursReportRow } from '../../shared/admin-api';
import type { EventFormMeta, EventProposal, EventSummary, InstitutionMembersResponse, InstitutionsResponse, MeResponse } from '../../shared/api';
import { INSTITUTION_REVIEWED_EVENTS } from '../../shared/rules';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const khaled = await login('u_khaled'); // a supervisor: represents the demo's team
const ahmad = await login('u_ahmad'); // a member of level 1: belongs to the team
const mariam = await login('u_mariam');
const f2 = await login('u_f2');
const DEMO = 'inst_saraj';

const proposal = (n: number, institution_id: string | null): EventProposal => ({
  title: `حملة تنظيف رقم ${n}`,
  description: 'ننظّف الحي معاً.',
  subtype: 'street_cleanup',
  location_type: 'in_person',
  address_text: 'حي الأندلس، طرابلس',
  lat: 32.87,
  lng: 13.13,
  meeting_platform: null,
  meeting_url: null,
  starts_at: iso(NOW + (3 + n) * DAY),
  ends_at: iso(NOW + (3 + n) * DAY + 2 * HOUR),
  capacity: 10,
  gender_category: 'mixed',
  terms: [],
  lessons: [],
  institution_id,
});

console.log('\n— asking for an institution');
await expectError('a name too short', 'invalid_institution', call('POST', '/institutions', mariam, { name: 'أب', kind: 'school' }));
await expectError('a kind that is not one', 'invalid_institution', call('POST', '/institutions', mariam, { name: 'مدرسة النور', kind: 'club' }));
await expectError(
  'one already there, spelled otherwise',
  'institution_exists',
  call('POST', '/institutions', mariam, { name: 'فريق  شباب السراج التطوعى', kind: 'team' }),
);
const school = await expectOk('mariam asks for her school', call('POST', '/institutions', mariam, { name: 'مدرسة الأمل الثانوية', kind: 'school' }));
expectEqual('it waits, and she represents it', [school.institution.status, school.role, school.status], ['pending', 'representative', 'confirmed']);
await expectOk('and a second one', call('POST', '/institutions', mariam, { name: 'جامعة طرابلس', kind: 'university' }));
await expectError('a third waits too many', 'too_many_institution_requests', call('POST', '/institutions', mariam, { name: 'مسجد الصحابة', kind: 'mosque' }));
await expectError('nobody can belong to it before an admin decides', 'not_found', call('POST', `/institutions/${school.institution.id}/join`, f2));
await expectError(
  'nor propose an event in its name',
  'not_representative',
  call('POST', '/events', mariam, proposal(1, school.institution.id)),
);
const overview = (await call('GET', '/admin/overview', admin)).body;
expectEqual('the panel counts those waiting', overview.institutions_waiting, 2);
await expectError('a member cannot approve it', 'forbidden', call('POST', `/admin/institutions/${school.institution.id}/approve`, ahmad));
await expectOk('an admin approves the school', call('POST', `/admin/institutions/${school.institution.id}/approve`, admin, {}));
await expectError('not twice', 'institution_not_waiting', call('POST', `/admin/institutions/${school.institution.id}/reject`, admin, {}));
const uni: InstitutionsResponse = (await call('GET', '/institutions', mariam)).body;
const uniId = uni.mine.find((x) => x.institution.name === 'جامعة طرابلس')!.institution.id;
await expectOk('and turns the university down, with a reason', call('POST', `/admin/institutions/${uniId}/reject`, admin, { note: 'اسمها الرسمي غير ذلك' }));
const mine: InstitutionsResponse = (await call('GET', '/institutions', mariam)).body;
expectEqual(
  'mariam sees both decisions',
  mine.mine.map((x) => [x.institution.name, x.institution.status, x.institution.decision_note]),
  [
    ['جامعة طرابلس', 'rejected', 'اسمها الرسمي غير ذلك'],
    ['مدرسة الأمل الثانوية', 'approved', null],
  ],
);
await expectError('she cannot leave the school she represents', 'representative_cannot_leave', call('DELETE', `/institutions/${school.institution.id}/membership`, mariam));
await expectOk('but puts the turned-down one away', call('DELETE', `/institutions/${uniId}/membership`, mariam));

console.log('\n— belonging to one');
await expectOk('f2 asks to belong to the school', call('POST', `/institutions/${school.institution.id}/join`, f2));
await expectError('not twice', 'join_request_pending', call('POST', `/institutions/${school.institution.id}/join`, f2));
await expectError('a member cannot see who belongs', 'not_representative', call('GET', `/institutions/${school.institution.id}/members`, f2));
await expectError('nor confirm herself', 'not_representative', call('POST', `/institutions/${school.institution.id}/members/u_f2/confirm`, f2));
const me: MeResponse = (await call('GET', '/me', mariam)).body;
expectEqual('mariam sees a request waiting for her', me.institution_requests, 1);
const members: InstitutionMembersResponse = (await expectOk('mariam confirms it', call('POST', `/institutions/${school.institution.id}/members/u_f2/confirm`, mariam)));
expectEqual(
  'f2 belongs now',
  members.members.map((m) => `${m.user.id} ${m.role} ${m.status}`).sort(),
  ['u_f2 member confirmed', 'u_mariam representative confirmed'],
);
await expectError('nor can a representative be taken off by another', 'not_found', call('DELETE', `/institutions/${school.institution.id}/members/u_mariam`, mariam));

console.log('\n— events in its name');
const form: EventFormMeta = (await call('GET', '/events/form', ahmad)).body;
expectEqual('ahmad (level 1, not a representative) may not open the form', !!form.subtypes, false);
await expectError('nor propose in the team\'s name', 'not_representative', call('POST', '/events', ahmad, proposal(1, DEMO)));
const mariamForm: EventFormMeta = (await call('GET', '/events/form', mariam)).body;
expectEqual('mariam (level 1) opens it for her school only', [mariamForm.own_events, mariamForm.institutions?.map((i) => i.name)], [false, ['مدرسة الأمل الثانوية']]);
await expectError('not in her own name', 'cannot_create_events', call('POST', '/events', mariam, proposal(1, null)));
const ids: string[] = [];
for (let n = 1; n <= INSTITUTION_REVIEWED_EVENTS; n++) {
  const r = await expectOk(`her school's event ${n} waits for an admin`, call('POST', '/events', mariam, proposal(n, school.institution.id)));
  expectEqual(`  event ${n}`, r.status, 'draft');
  ids.push(r.id);
}
await expectError('a fourth waiting is too many for her', 'too_many_proposals', call('POST', '/events', mariam, proposal(9, school.institution.id)));
for (const id of ids.slice(0, 2)) await expectOk('an admin approves one', call('POST', `/admin/events/${id}/publish`, admin, {}));
await expectOk('and turns the third down', call('POST', `/admin/events/${ids[2]}/reject`, admin, {}));
const r4 = await expectOk('two approved: the next still waits', call('POST', '/events', mariam, proposal(4, school.institution.id)));
expectEqual('  its status', r4.status, 'draft');
await expectOk('an admin approves it', call('POST', `/admin/events/${r4.id}/publish`, admin, {}));
const r5 = await expectOk('three approved: the next goes out at once', call('POST', '/events', mariam, proposal(5, school.institution.id)));
expectEqual('  its status', r5.status, 'published');
const list: EventSummary[] = (await call('GET', '/events', ahmad)).body;
expectEqual('everyone sees whose it is', list.find((e) => e.id === r5.id)?.institution?.name, 'مدرسة الأمل الثانوية');
const khaledForm: EventFormMeta = (await call('GET', '/events/form', khaled)).body;
expectEqual('khaled may propose in his own name and his team\'s', [khaledForm.own_events, khaledForm.institutions?.map((i) => [i.id, i.publishes_directly])], [true, [[DEMO, false]]]);

console.log('\n— the panel and the hours report');
const rows: AdminInstitutionRow[] = (await call('GET', '/admin/institutions?status=approved', admin)).body;
const schoolRow = rows.find((x) => x.institution.id === school.institution.id)!;
expectEqual('the school: its representative, members and approved events', [schoolRow.representatives.map((r) => r.id), schoolRow.members, schoolRow.approved_events], [['u_mariam'], 1, 4]);
await expectError('a representative by a phone nobody has', 'no_such_user', call('POST', `/admin/institutions/${school.institution.id}/representatives`, admin, { phone: '0959999999' }));
const f2Phone = h.seed.users.find((u) => u.id === 'u_f2')!.phone;
await expectOk('f2 is made a representative', call('POST', `/admin/institutions/${school.institution.id}/representatives`, admin, { phone: f2Phone }));
await expectError('not twice', 'already_representative', call('POST', `/admin/institutions/${school.institution.id}/representatives`, admin, { phone: f2Phone }));
await expectOk('and taken off again (she stays a member)', call('DELETE', `/admin/institutions/${school.institution.id}/representatives/u_f2`, admin));
const report = async (q: string): Promise<HoursReportRow[]> =>
  (await call('GET', `/admin/reports/hours?from=${iso(NOW - 60 * DAY)}&to=${iso(NOW + DAY)}${q}`, admin)).body;
const all = await report('');
expectEqual('the report names the institutions a person belongs to', all.find((r) => r.user_id === 'u_ahmad')?.institutions, ['فريق شباب السراج التطوعي']);
expectEqual('and none for the team: no hours at its events yet', (await report(`&institution_id=${DEMO}`)).length, 0);
expectEqual('the association\'s own events: every confirmed hour so far', (await report('&institution_id=association')).length, all.length);

await h.done();
