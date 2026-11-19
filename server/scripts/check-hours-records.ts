// Hours outside the app's events, certificates and the hours reports (owner's
// decisions, 2026-11-19): a member claims hours for their institution, within
// two weeks, up to 12 hours, one waiting at a time; its representative
// approves (points a minute) or turns it down with a reason; certificates are
// made from the server's records and checked on a public page; and the
// representative's report, the panel's report and its charts count them.
// Run: npm run check:api (runs this after check-covers.ts)

import type { AdminHoursStats, HoursReportRow } from '../../shared/admin-api';
import type { CertificateResponse, InstitutionHoursReport, MeResponse, OutsideHoursItem } from '../../shared/api';
import { dayIn } from '../../shared/rules';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const DAY = 24 * 3_600_000;
const TZ = 'Africa/Tripoli';
const dayAgo = (n: number) => dayIn(NOW - n * DAY, TZ);
const h = await startHarness(NOW);
const { call, raw, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const khaled = await login('u_khaled'); // represents the demo's team
const ahmad = await login('u_ahmad'); // belongs to it, and has 2½ hours waiting for khaled
const mariam = await login('u_mariam'); // belongs to no institution
const TEAM = 'inst_saraj';
await call('PUT', '/me/push-token', ahmad, { token: 'ExponentPushToken[ahmad]', lang: 'ar' });
await call('PUT', '/me/push-token', khaled, { token: 'ExponentPushToken[khaled]', lang: 'ar' });
const claim = (over: Record<string, unknown> = {}) => ({ institution_id: TEAM, done_on: dayAgo(1), minutes: 90, description: 'نظّفت ساحة المسجد', ...over });
const points = async (token: string) => ((await call('GET', '/me', token)).body as MeResponse).user.total_points;

console.log('\n— claiming hours outside the app');
await expectError('one waiting already for the team', 'outside_hours_pending', call('POST', '/outside-hours', ahmad, claim()));
await expectError('not for an institution one does not belong to', 'not_found', call('POST', '/outside-hours', mariam, claim()));
const queue: OutsideHoursItem[] = (await call('GET', `/institutions/${TEAM}/outside-hours`, khaled)).body;
expectEqual('khaled sees it waiting', queue.map((x) => [x.claim.id, x.claim.status, x.user.id]), [['oh_ahmad', 'pending', 'u_ahmad']]);
await expectError('a member cannot see the team\'s claims', 'not_representative', call('GET', `/institutions/${TEAM}/outside-hours`, ahmad));
await expectError('nor decide them', 'not_representative', call('POST', `/institutions/${TEAM}/outside-hours/oh_ahmad/decide`, ahmad, { decision: 'approved' }));
await expectError('turning down needs a reason', 'reason_required', call('POST', `/institutions/${TEAM}/outside-hours/oh_ahmad/decide`, khaled, { decision: 'rejected', note: '  ' }));
const before = await points(ahmad);
const approved = await expectOk('khaled approves it', call('POST', `/institutions/${TEAM}/outside-hours/oh_ahmad/decide`, khaled, { decision: 'approved' }));
expectEqual('it is approved, by khaled', [approved.claim.status, approved.decided_by?.id], ['approved', 'u_khaled']);
expectEqual('ahmad earns a point a minute', (await points(ahmad)) - before, 150);
await expectError('not twice', 'already_acted', call('POST', `/institutions/${TEAM}/outside-hours/oh_ahmad/decide`, khaled, { decision: 'rejected', note: 'خطأ' }));
await h.settle();
expectEqual('ahmad was told', h.pushes.some((p) => p.to === 'ExponentPushToken[ahmad]' && p.data.type === 'outside_hours_decided'), true);

await expectError('a day in the future', 'time_in_future', call('POST', '/outside-hours', ahmad, claim({ done_on: dayIn(NOW + DAY, TZ) })));
await expectError('more than two weeks ago', 'outside_hours_too_old', call('POST', '/outside-hours', ahmad, claim({ done_on: dayAgo(15) })));
await expectError('not a day at all', 'outside_hours_too_old', call('POST', '/outside-hours', ahmad, claim({ done_on: 'yesterday' })));
await expectError('more than 12 hours', 'outside_hours_too_long', call('POST', '/outside-hours', ahmad, claim({ minutes: 721 })));
await expectError('no time at all', 'outside_hours_too_long', call('POST', '/outside-hours', ahmad, claim({ minutes: 0 })));
await expectError('nothing said of what was done', 'description_required', call('POST', '/outside-hours', ahmad, claim({ description: '   ' })));
await h.settle();
const told = h.pushes.length;
const second = await expectOk('two weeks ago exactly is fine', call('POST', '/outside-hours', ahmad, claim({ done_on: dayAgo(14), place: '  حي السراج  ' })));
expectEqual('its place is tidied', second.claim.place, 'حي السراج');
await h.settle();
expectEqual('khaled is told it waits', h.pushes.slice(told).some((p) => p.to === 'ExponentPushToken[khaled]' && p.data.type === 'outside_hours_claimed'), true);
await expectOk('khaled turns it down, with a reason', call('POST', `/institutions/${TEAM}/outside-hours/${second.claim.id}/decide`, khaled, { decision: 'rejected', note: 'لم نكن هناك' }));
const mine: OutsideHoursItem[] = (await call('GET', '/outside-hours', ahmad)).body;
expectEqual('ahmad sees both, newest first, with the reason', mine.map((x) => [x.claim.status, x.claim.decision_note]), [['rejected', 'لم نكن هناك'], ['approved', null]]);
const own = await expectOk('khaled claims his own hours', call('POST', '/outside-hours', khaled, claim({ minutes: 60 })));
await expectOk('and may approve them himself (owner\'s decision)', call('POST', `/institutions/${TEAM}/outside-hours/${own.claim.id}/decide`, khaled, { decision: 'approved' }));

console.log('\n— the representative\'s report');
const report: InstitutionHoursReport = (await call('GET', `/institutions/${TEAM}/hours-report?from=${dayAgo(30)}&to=${dayAgo(0)}`, khaled)).body;
expectEqual(
  'ahmad\'s approved outside hours, at none of the team\'s events',
  report.rows.filter((r) => r.hours > 0).map((r) => [r.user.id, r.outside_hours, r.event_hours]),
  [['u_ahmad', 2.5, 0], ['u_khaled', 1, 0]],
);
await expectError('a member cannot read it', 'not_representative', call('GET', `/institutions/${TEAM}/hours-report?from=${dayAgo(30)}&to=${dayAgo(0)}`, ahmad));

console.log('\n— certificates');
const all: CertificateResponse = await expectOk('ahmad makes a certificate', call('POST', '/me/certificates', ahmad, {}));
expectEqual('it counts his outside hours and has a link', [all.certificate.outside_hours, all.verify_url?.endsWith(`/api/verify/${all.certificate.id}`)], [2.5, true]);
const team: CertificateResponse = await expectOk('and one for the team only', call('POST', '/me/certificates', ahmad, { institution_id: TEAM }));
expectEqual('the team\'s: only its hours', [team.certificate.hours, team.institution?.id], [2.5, TEAM]);
await expectError('not for an institution he is not in', 'not_found', call('POST', '/me/certificates', mariam, { institution_id: TEAM }));
const page = await raw(`/api/verify/${all.certificate.id.toLowerCase()}`);
const text = page.bytes.toString('utf8');
expectEqual('its page shows his name and hours, without signing in', [page.status, text.includes('أحمد'), text.includes(String(all.certificate.hours))], [200, true, true]);
expectEqual('and no phone number', text.includes(h.seed.users.find((u) => u.id === 'u_ahmad')!.phone), false);
expectEqual('an unknown code is not found', (await raw('/api/verify/NOTACODE00')).status, 404);

console.log('\n— the panel');
const rows: HoursReportRow[] = (await call('GET', `/admin/reports/hours?from=${new Date(NOW - 30 * DAY).toISOString()}&to=${new Date(NOW + DAY).toISOString()}`, admin)).body;
expectEqual('its report counts approved outside hours', rows.find((r) => r.user_id === 'u_ahmad')?.outside_hours, 2.5);
const teamRows: HoursReportRow[] = (await call('GET', `/admin/reports/hours?from=${new Date(NOW - 30 * DAY).toISOString()}&to=${new Date(NOW + DAY).toISOString()}&institution_id=association`, admin)).body;
expectEqual('but not under the association\'s own events', teamRows.find((r) => r.user_id === 'u_ahmad')?.outside_hours ?? 0, 0);
const stats: AdminHoursStats = (await call('GET', '/admin/stats/hours', admin)).body;
expectEqual('the charts: twelve months, this one last', [stats.months.length, stats.months[11].month], [12, dayAgo(0).slice(0, 7)]);
expectEqual('the team is among the organisers', stats.institutions.some((x) => x.name === 'فريق شباب السراج التطوعي' && x.hours >= 3.5), true);
await expectError('a member cannot read them', 'forbidden', call('GET', '/admin/stats/hours', ahmad));

await h.done();
