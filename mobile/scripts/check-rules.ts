// Tries to break the demo server's rules, as Build_Plan.md phase 5 asks:
// record for someone absent, backdate before the event, record yourself,
// confirm someone else's hours, report below the allowed level, warn someone
// who was not at your event, change someone else's proposal or your own gender.
// Every cheat must be refused.
// Run: npm run check:rules

import type { EventProposal, ProfileEdit, ReportBody } from '../src/data/api';
import type { Db } from '../src/data/types';
import { buildSeed } from '../src/demo/seed';
import * as server from '../src/demo/server';
import * as rules from '../../shared/rules';

const NOW = new Date('2026-10-21T12:00:00').getTime();
let failed = 0;

function expectError(name: string, code: server.ApiErrorCode, fn: () => unknown) {
  try {
    fn();
    console.log(`✗ ${name}: was allowed, expected ${code}`);
    failed++;
  } catch (e) {
    if (e instanceof server.ApiError && e.code === code) console.log(`✓ ${name} → ${code}`);
    else {
      console.log(`✗ ${name}: got ${e instanceof server.ApiError ? e.code : e}, expected ${code}`);
      failed++;
    }
  }
}

function expectEqual(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) console.log(`✓ ${name} = ${JSON.stringify(actual)}`);
  else {
    console.log(`✗ ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

function joinFully(db: Db, userId: string, eventId: string, now: number) {
  let d = server.startJoin(db, userId, eventId, now);
  for (const term of server.eventTerms(d, eventId)) d = server.acceptTerm(d, userId, eventId, term.id, now);
  return server.completeJoin(d, userId, eventId, now);
}

const db = buildSeed(NOW);
const running = server.getEvent(db, 'e01');
const start = new Date(running.starts_at).getTime();

console.log('\n— joining');
expectError('6th person joins a full event (capacity 5)', 'event_full', () => joinFully(db, 'u_ahmad', 'e12', NOW));
expectError('join without accepting the terms', 'terms_incomplete', () =>
  server.completeJoin(server.startJoin(db, 'u_ahmad', 'e02', NOW), 'u_ahmad', 'e02', NOW),
);
expectError('accept the last term first', 'term_out_of_order', () => {
  const d = server.startJoin(db, 'u_ahmad', 'e02', NOW);
  const terms = server.eventTerms(d, 'e02');
  return server.acceptTerm(d, 'u_ahmad', 'e02', terms[terms.length - 1].id, NOW);
});
expectError('man joins a women-only event', 'gender_not_allowed', () => server.startJoin(db, 'u_ahmad', 'e04', NOW));
expectError('join a finished event', 'event_closed', () => server.startJoin(db, 'u_ahmad', 'e13', NOW));
const afterJoin = joinFully(db, 'u_ahmad', 'e02', NOW);
expectEqual('terms locked after first acceptance', !!server.getEvent(afterJoin, 'e02').terms_locked_at, true);

console.log('\n— recording attendance');
expectError('participant records someone else', 'not_organizer', () =>
  server.recordStart(db, 'u_ahmad', { eventId: 'e01', userId: 'u_mariam' }, NOW),
);
expectError('supervisor of ANOTHER event records here', 'not_organizer', () =>
  server.recordStart(db, 'u_fatima', { eventId: 'e01', userId: 'u_ahmad' }, NOW),
);
expectError('supervisor records himself', 'cannot_record_self', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_khaled' }, NOW),
);
expectError('record someone who never joined', 'not_joined', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_f5' }, NOW),
);
expectError('backdate before the event started', 'start_before_event', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_ahmad', startedAt: start - 60_000 }, NOW),
);
expectError('start time in the future', 'time_in_future', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_ahmad', startedAt: NOW + 60_000 }, NOW),
);
expectError('record start before the event begins', 'event_not_started', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e02', userId: 'u_f3' }, NOW),
);
expectError('record start twice', 'already_started', () =>
  server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_f1' }, NOW),
);
expectError('finish before start', 'end_before_start', () =>
  server.recordEnd(db, 'u_khaled', { eventId: 'e01', userId: 'u_f1', endedAt: NOW - 60 * 60_000 }, NOW),
);

// The honest path: backdated start 30 min ago, finish now → 0.5 h.
let d = server.recordStart(db, 'u_khaled', { eventId: 'e01', userId: 'u_ahmad', startedAt: NOW - 30 * 60_000 }, NOW);
d = server.recordEnd(d, 'u_khaled', { eventId: 'e01', userId: 'u_ahmad' }, NOW);
const a = server.attendanceOf(d, 'e01', 'u_ahmad')!;
expectEqual('hours computed on the server', a.hours, 0.5);
expectEqual('start marked backdated', a.start_source, 'backdated');
expectEqual('recorded_by kept', a.recorded_by, 'u_khaled');

console.log('\n— confirming hours and points');
expectError("confirm someone else's hours", 'not_your_attendance', () => server.confirmAttendance(d, 'u_mariam', a.id, NOW));
const before = server.totalPoints(d, 'u_ahmad');
const confirmed = server.confirmAttendance(d, 'u_ahmad', a.id, NOW);
// Placeholder formula: base 30 × (0.5 h / 4 h event) = 3.75, all physical.
expectEqual('fractional points credited', Math.round((server.totalPoints(confirmed, 'u_ahmad') - before) * 100) / 100, 3.75);
expectError('confirm twice', 'already_acted', () => server.confirmAttendance(confirmed, 'u_ahmad', a.id, NOW));
const disputed = server.disputeAttendance(d, 'u_ahmad', a.id, NOW);
expectEqual('disputed hours earn nothing', server.totalPoints(disputed, 'u_ahmad'), before);

console.log('\n— scheduled auto-close');
const later = server.tick(db, new Date(running.ends_at).getTime() + 1000);
const closed = server.attendanceOf(later, 'e01', 'u_f1')!;
expectEqual('open attendance closed at event end', [closed.end_source, closed.ended_at], ['auto_closed', running.ends_at]);

console.log('\n— proposing an event');
const HOUR = 3_600_000;
const proposal = (over: Partial<EventProposal> = {}): EventProposal => ({
  title: 'تنظيف حديقة الحي',
  description: 'جمع المخلفات من الحديقة.',
  subtype: 'street_cleanup',
  address_text: 'حديقة الحي، طرابلس',
  lat: 32.88,
  lng: 13.19,
  starts_at: new Date(NOW + 72 * HOUR).toISOString(),
  ends_at: new Date(NOW + 75 * HOUR).toISOString(),
  capacity: 15,
  gender_category: 'mixed',
  branch_ids: ['b01'],
  terms: ['أحضر قفازيك.'],
  ...over,
});
expectError('a member below level 5 proposes', 'cannot_create_events', () => server.proposeEvent(db, 'u_ahmad', proposal(), NOW));
expectError('a man proposes a women-only event', 'category_not_allowed', () =>
  server.proposeEvent(db, 'u_khaled', proposal({ gender_category: 'female' }), NOW),
);
expectError('an event that has already started', 'starts_in_past', () =>
  server.proposeEvent(db, 'u_khaled', proposal({ starts_at: new Date(NOW - HOUR).toISOString() }), NOW),
);
const { db: withDraft, event: draft } = server.proposeEvent(db, 'u_khaled', proposal(), NOW);
expectEqual('it waits for an admin, with its creator as supervisor', [draft.status, server.isOrganizer(withDraft, draft.id, 'u_khaled')], ['draft', true]);
expectError('nobody joins it', 'not_found', () => server.startJoin(withDraft, 'u_ahmad', draft.id, NOW));
let three = withDraft;
for (let i = 0; i < 2; i++) three = server.proposeEvent(three, 'u_khaled', proposal(), NOW).db;
expectError('a fourth while three wait', 'too_many_proposals', () => server.proposeEvent(three, 'u_khaled', proposal(), NOW));

console.log('\n— the proposer edits or withdraws his waiting event');
const edited = proposal({ title: 'حلقة تلاوة في الحديقة', subtype: 'quran_circle', terms: ['أحضر مصحفك.', 'احضر قبل الموعد بربع ساعة.'] });
expectError('a member edits his proposal', 'not_found', () => server.editProposal(three, 'u_ahmad', draft.id, edited, NOW));
expectError('another supervisor withdraws it', 'not_found', () => server.withdrawProposal(three, 'u_fatima', draft.id));
expectError('he makes it women-only', 'category_not_allowed', () =>
  server.editProposal(three, 'u_khaled', draft.id, { ...edited, gender_category: 'female' }, NOW),
);
expectError('he moves it into the past', 'starts_in_past', () =>
  server.editProposal(three, 'u_khaled', draft.id, { ...edited, starts_at: new Date(NOW - HOUR).toISOString() }, NOW),
);
const afterEdit = server.editProposal(three, 'u_khaled', draft.id, edited, NOW);
const editedEvent = afterEdit.events.find((e) => e.id === draft.id)!;
expectEqual('he edits it while three wait; it still waits, with the points of its new type', [
  editedEvent.title,
  editedEvent.status,
  editedEvent.base_points,
  server.eventTerms(afterEdit, draft.id).map((x) => x.text),
  server.isOrganizer(afterEdit, draft.id, 'u_khaled'),
], ['حلقة تلاوة في الحديقة', 'draft', 20, ['أحضر مصحفك.', 'احضر قبل الموعد بربع ساعة.'], true]);
const rejected: Db = { ...three, events: three.events.map((e) => (e.id === draft.id ? { ...e, status: 'rejected' as const } : e)) };
expectError('he edits it after an admin turned it down', 'proposal_not_waiting', () => server.editProposal(rejected, 'u_khaled', draft.id, edited, NOW));
expectError('a supervisor edits a published event he runs', 'proposal_not_waiting', () => server.editProposal(three, 'u_khaled', 'e02', edited, NOW));
expectError('or withdraws it', 'proposal_not_waiting', () => server.withdrawProposal(three, 'u_khaled', 'e02'));
const withdrawn = server.withdrawProposal(three, 'u_khaled', draft.id);
expectEqual('he withdraws it: gone, with its terms, branches and supervisors', [
  withdrawn.events.some((e) => e.id === draft.id),
  withdrawn.event_terms.some((x) => x.event_id === draft.id),
  withdrawn.event_branches.some((x) => x.event_id === draft.id),
  withdrawn.event_organizers.some((x) => x.event_id === draft.id),
  server.waitingProposals(withdrawn, 'u_khaled'),
], [false, false, false, false, 2]);
expectError('withdrawn twice', 'not_found', () => server.withdrawProposal(withdrawn, 'u_khaled', draft.id));

console.log('\n— editing the profile');
expectEqual('a name of one letter is refused', rules.cleanProfileEdit({ full_name: ' أ ' }), null);
expectEqual('so is an empty city', rules.cleanProfileEdit({ city: '   ' }), null);
expectEqual('and nothing to change', rules.cleanProfileEdit({}), null);
const cleaned = rules.cleanProfileEdit({ full_name: '  أحمد سالم ', city: ' مصراتة ' })!;
expectEqual('name and city trimmed', cleaned, { full_name: 'أحمد سالم', city: 'مصراتة' });
// What a changed app could send: the rule and the demo keep only the name and the city.
const cheat = { ...cleaned, gender: 'female', phone: '+218910000000', role: 'admin' } as ProfileEdit;
expectEqual('gender, phone and role are not taken from an edit', rules.cleanProfileEdit(cheat), cleaned);
const ahmad = server.getUser(server.updateProfile(db, 'u_ahmad', cheat), 'u_ahmad')!;
const ahmadBefore = server.getUser(db, 'u_ahmad')!;
expectEqual('nor written', [ahmad.full_name, ahmad.city, ahmad.gender, ahmad.phone, ahmad.role], [
  'أحمد سالم',
  'مصراتة',
  ahmadBefore.gender,
  ahmadBefore.phone,
  ahmadBefore.role,
]);

console.log('\n— reports (بلاغ)');
const report = (d: Db, userId: string, body: ReportBody) => server.fileReport(d, userId, body, NOW);
const noReporting: Db = { ...db, levels: db.levels.map((l) => ({ ...l, can_report: false })) };
expectError('a member reports below the level that allows it', 'cannot_report', () => report(noReporting, 'u_ahmad', { category: 'app' }));
expectEqual('a supervisor may, whatever the level', report(noReporting, 'u_khaled', { category: 'app' }).report.status, 'open');
expectError('"something else" without a word', 'note_required', () => report(db, 'u_ahmad', { category: 'other', note: '  ' }));
expectError('about an event he was not at', 'not_at_event', () => report(db, 'u_ahmad', { category: 'safety', event_id: 'e04' }));
expectError('naming someone who was not at that event', 'person_not_at_event', () =>
  report(db, 'u_ahmad', { category: 'behaviour', event_id: 'e01', subject_id: 'u_f5' }),
);
expectError('naming someone without an event', 'person_not_at_event', () => report(db, 'u_ahmad', { category: 'behaviour', subject_id: 'u_f1' }));
expectError('naming himself', 'cannot_report_self', () => report(db, 'u_ahmad', { category: 'behaviour', event_id: 'e01', subject_id: 'u_ahmad' }));
const filed = report(db, 'u_ahmad', { category: 'behaviour', event_id: 'e01', subject_id: 'u_khaled', note: '  تأخر في فتح نقطة التجمع. ' });
expectEqual('he may name the supervisor; it waits, the note trimmed', [filed.report.status, filed.report.subject_id, filed.report.note], [
  'open',
  'u_khaled',
  'تأخر في فتح نقطة التجمع.',
]);
let five = filed.db;
for (let i = 0; i < 4; i++) five = report(five, 'u_ahmad', { category: 'safety' }).db;
expectError('a sixth while five wait', 'too_many_reports', () => report(five, 'u_ahmad', { category: 'safety' }));

console.log('\n— warnings (إنذار)');
const warn = (d: Db, actorId: string, eventId: string, userId: string, reason = 'غادر دون إبلاغ المشرف.', now = NOW) =>
  server.warn(d, actorId, { eventId, userId, reason }, now);
expectError('a member gives a warning', 'not_organizer', () => warn(db, 'u_ahmad', 'e01', 'u_f1'));
expectError('a supervisor of ANOTHER event', 'not_organizer', () => warn(db, 'u_fatima', 'e01', 'u_ahmad'));
expectError('a supervisor warns someone not at his event', 'not_joined', () => warn(db, 'u_khaled', 'e01', 'u_f5'));
expectError('a supervisor warns himself', 'cannot_warn_self', () => warn(db, 'u_khaled', 'e01', 'u_khaled'));
expectError('before the event starts', 'event_not_started', () => warn(db, 'u_khaled', 'e02', 'u_f3'));
expectError('more than a week after it ended', 'event_closed', () => warn(db, 'u_khaled', 'e13', 'u_ahmad'));
expectError('without a reason', 'reason_required', () => warn(db, 'u_khaled', 'e01', 'u_ahmad', '   '));
const given = warn(db, 'u_khaled', 'e01', 'u_ahmad');
expectEqual('recorded only: no points taken', server.totalPoints(given.db, 'u_ahmad'), server.totalPoints(db, 'u_ahmad'));
expectEqual('his roster shows it', server.warnedBy(given.db, 'e01', 'u_khaled').has('u_ahmad'), true);
expectError('the same supervisor, twice', 'already_warned', () => warn(given.db, 'u_khaled', 'e01', 'u_ahmad'));
expectEqual('it blocks nothing: he still joins an event', server.registrationOf(joinFully(given.db, 'u_ahmad', 'e02', NOW), 'e02', 'u_ahmad')?.status, 'joined');

console.log('\n— appealing a warning');
const w = given.warning;
expectError('someone else appeals it', 'not_your_warning', () => server.appealWarning(given.db, 'u_mariam', w.id, 'ظُلم.', NOW));
expectError('an appeal without a reason', 'reason_required', () => server.appealWarning(given.db, 'u_ahmad', w.id, ' ', NOW));
const appealed = server.appealWarning(given.db, 'u_ahmad', w.id, 'أبلغت المشرف المساعد.', NOW);
expectEqual('it waits for an admin', appealed.warnings.find((x) => x.id === w.id)?.status, 'appealed');
expectError('appeal twice', 'already_appealed', () => server.appealWarning(appealed, 'u_ahmad', w.id, 'مرة أخرى.', NOW));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
