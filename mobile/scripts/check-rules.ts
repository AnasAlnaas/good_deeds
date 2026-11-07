// Tries to break the demo server's rules, as Build_Plan.md phase 5 asks:
// record for someone absent, backdate before the event, record yourself,
// confirm someone else's hours, report below the allowed level, warn someone
// who was not at your event, change someone else's proposal or your own gender.
// Every cheat must be refused.
// Run: npm run check:rules

import type { EventProposal, ProfileEdit, ReportBody, RosterResponse } from '../src/data/api';
import { rosterWithQueued } from '../src/data/queuedRoster';
import type { Db } from '../src/data/types';
import { buildSeed } from '../src/demo/seed';
import * as server from '../src/demo/server';
import { cityName, LIBYAN_CITIES } from '../../shared/cities';
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
  for (const lesson of server.eventLessons(d, eventId)) d = server.learnLesson(d, userId, eventId, lesson.id, now);
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

console.log('\n— a cancelled event');
const cancelledEvent = (from: Db, eventId: string): Db => ({
  ...from,
  events: from.events.map((e) => (e.id === eventId ? { ...e, status: 'cancelled' as const } : e)),
});
expectError('a supervisor records a start at a cancelled event', 'event_closed', () =>
  server.recordStart(cancelledEvent(db, 'e01'), 'u_khaled', { eventId: 'e01', userId: 'u_ahmad' }, NOW),
);
expectError('or a finish', 'event_closed', () => server.recordEnd(cancelledEvent(db, 'e01'), 'u_khaled', { eventId: 'e01', userId: 'u_f1' }, NOW));
expectError('hours recorded there earn nothing', 'event_closed', () => server.confirmAttendance(cancelledEvent(d, 'e01'), 'u_ahmad', a.id, NOW));

console.log('\n— the learning corner');
{
  const [l1, l2] = server.eventLessons(db, 'e03');
  const started = server.startJoin(db, 'u_ahmad', 'e03', NOW);
  expectError('accept a term before learning', 'lessons_incomplete', () =>
    server.acceptTerm(started, 'u_ahmad', 'e03', server.eventTerms(started, 'e03')[0].id, NOW),
  );
  expectError('join before learning', 'lessons_incomplete', () => server.completeJoin(started, 'u_ahmad', 'e03', NOW));
  expectError('a lesson of another event', 'not_found', () => server.learnLesson(db, 'u_ahmad', 'e02', l1.id, NOW));
  const one = server.learnLesson(db, 'u_mariam', 'e03', l2.id, NOW);
  expectEqual('learned without joining, in any order', server.learnedAt(one, 'u_mariam').has(l2.id), true);
  expectEqual('learning it again adds nothing', server.learnLesson(one, 'u_mariam', 'e03', l2.id, NOW) === one, true);
  const joinedAfter = joinFully(db, 'u_ahmad', 'e03', NOW);
  expectEqual('learns both, then joins', server.registrationOf(joinedAfter, 'e03', 'u_ahmad')?.status, 'joined');
}

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
  terms: ['أحضر قفازيك.'],
  lessons: [],
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
expectEqual('he withdraws it: gone, with its terms and supervisors', [
  withdrawn.events.some((e) => e.id === draft.id),
  withdrawn.event_terms.some((x) => x.event_id === draft.id),
  withdrawn.event_organizers.some((x) => x.event_id === draft.id),
  server.waitingProposals(withdrawn, 'u_khaled'),
], [false, false, false, 2]);
expectError('withdrawn twice', 'not_found', () => server.withdrawProposal(withdrawn, 'u_khaled', draft.id));

console.log('\n— phone numbers, names and cities');
for (const typed of ['0912345678', '091 234 5678', '091-234-5678', '912345678', '+218912345678', '+218 91 234 5678', '00218912345678', '218912345678', '٠٩١٢٣٤٥٦٧٨', '⁦+218912345678⁩']) {
  expectEqual(`"${typed}" is a Libyan mobile number`, rules.libyanMobile(typed), '+218912345678');
}
expectEqual('each of 091–095', ['0912345678', '0922345678', '0932345678', '0942345678', '0952345678'].map((p) => !!rules.libyanMobile(p)), [true, true, true, true, true]);
for (const [why, typed] of [
  ['096 is not a mobile prefix', '0962345678'],
  ['090 neither', '0902345678'],
  ['a landline (021, Tripoli)', '0213334444'],
  ['a digit short', '091234567'],
  ['a digit too many', '09123456789'],
  ['another country', '+201012345678'],
  ['a missing 9 after +218', '+21812345678'],
  ['letters in it', '091234567a'],
  ['two plus signs', '++218912345678'],
  ['nothing', ''],
] as const) {
  expectEqual(`refused: ${why}`, rules.libyanMobile(typed), null);
}
expectEqual('a first and family name, spaces tidied', rules.cleanName('  أحمد   محمد ـسالم '), 'أحمد محمد سالم');
expectEqual('names with marks, hyphens and Latin letters', ['عبدُ الله', 'Ahmed Al-Mansouri', "Sara O'Neil"].map((n) => rules.cleanName(n)), ['عبدُ الله', 'Ahmed Al-Mansouri', "Sara O'Neil"]);
for (const [why, typed] of [
  ['one word only', 'أحمد'],
  ['a one-letter part', 'أحمد م'],
  ['digits', 'أحمد 123'],
  ['symbols', 'أحمد @سالم'],
  ['an emoji', 'أحمد سالم 😀'],
  ['too long', `أحمد ${'س'.repeat(100)}`],
] as const) {
  expectEqual(`not a name: ${why}`, rules.cleanName(typed), null);
}
expectEqual('cities from the list, kept by their Arabic name', ['طرابلس', ' بني  وليد ', 'Zawiya', 'misrata'].map((c) => rules.cleanCity(c)), ['طرابلس', 'بني وليد', 'الزاوية', 'مصراتة']);
expectEqual('anything else is refused', ['', 'ط', '123', 'طرابلس!', 'القاهرة', 'Tripolis'].map((c) => rules.cleanCity(c)), [null, null, null, null, null, null]);
expectEqual('every city in the list has two names, and none twice', [
  LIBYAN_CITIES.every((c) => c.ar && c.en && rules.cleanCity(c.ar) === c.ar && rules.cleanCity(c.en) === c.ar),
  new Set(LIBYAN_CITIES.map((c) => c.ar)).size === LIBYAN_CITIES.length,
], [true, true]);
expectEqual('a city is shown in the app language', [cityName('مصراتة', 'en'), cityName('مصراتة', 'ar'), cityName('مدينة قديمة', 'en')], ['Misrata', 'مصراتة', 'مدينة قديمة']);

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

console.log('\n— supervisors added in the app');
{
  // e01 is happening now: Khaled supervises it; Ahmad, Mariam and f1–f4 joined.
  const add = (d: Db, actor: string, user: string) => server.addSupervisor(d, actor, 'e01', user, NOW);
  expectError('a member makes himself a supervisor', 'not_organizer', () => add(db, 'u_ahmad', 'u_ahmad'));
  expectError('someone who has not joined', 'not_joined', () => add(db, 'u_khaled', 'u_fatima'));
  const one = add(db, 'u_khaled', 'u_ahmad');
  expectEqual('Ahmad is a supervisor, added in the app by Khaled', server.supervisorsOf(one, 'e01').map((u) => [u.id, u.added_by]), [['u_khaled', null], ['u_ahmad', 'u_khaled']]);
  expectEqual('he may record attendance now', server.isOrganizer(one, 'e01', 'u_ahmad'), true);
  expectError('added twice', 'already_supervisor', () => add(one, 'u_khaled', 'u_ahmad'));
  const two = add(one, 'u_ahmad', 'u_mariam');
  expectError('a fourth supervisor', 'too_many_supervisors', () => add(two, 'u_khaled', 'u_f1'));
  expectError('the one it was made with is not taken off in the app', 'cannot_remove_supervisor', () => server.removeSupervisor(two, 'u_ahmad', 'e01', 'u_khaled', NOW));
  const stepped = server.removeSupervisor(two, 'u_mariam', 'e01', 'u_mariam', NOW);
  expectEqual('Mariam steps down', server.isOrganizer(stepped, 'e01', 'u_mariam'), false);
  expectError('nobody is added once the event is over', 'event_closed', () => server.addSupervisor(db, 'u_khaled', 'e01', 'u_f1', NOW + 48 * 3_600_000));
  expectEqual('an admin may run any event', rules.canManageEvent({ role: 'admin' }, false), true);

  console.log('\n— notices to an event');
  expectError('a member posts one', 'not_organizer', () => server.postNotice(db, 'u_f1', 'e01', 'غيّرنا الموعد.', 'announcement', NOW));
  expectError('an empty one', 'message_required', () => server.postNotice(db, 'u_khaled', 'e01', '   ', 'announcement', NOW));
  const posted = server.postNotice(one, 'u_ahmad', 'e01', '  أحضروا الماء.  ', 'announcement', NOW + 60_000);
  expectEqual('a supervisor added in the app posts one, trimmed, newest first', server.noticesOf(posted.db, 'e01').map((n) => n.body), ['أحضروا الماء.', db.event_notices[1].body, db.event_notices[0].body]);
  expectEqual('those who joined read them', rules.canReadNotices({ role: 'member' }, { status: 'joined' }, false), true);
  expectEqual('others do not', rules.canReadNotices({ role: 'member' }, undefined, false), false);
  expectError('a member deletes it', 'not_your_notice', () => server.deleteNotice(posted.db, 'u_f1', 'e01', posted.notice.id));
  expectEqual('its author does', server.noticesOf(server.deleteNotice(posted.db, 'u_ahmad', 'e01', posted.notice.id), 'e01').length, 2);
  expectError('none once the event is long over', 'event_closed', () => server.postNotice(db, 'u_khaled', 'e01', 'شكراً لكم.', 'announcement', NOW + 9 * 24 * 3_600_000));
}

console.log('\n— reactions to a notice');
{
  const [notice, question] = db.event_notices;
  const counts = (d: Db, viewer: string, n = notice) =>
    rules.reactionSummary(n.kind, d.notice_reactions.filter((r) => r.notice_id === n.id), viewer);
  expectEqual('the seed has an announcement and a question', [notice.kind, question.kind], ['announcement', 'question']);
  expectEqual('an announcement: noted, disagree, sad', counts(db, 'u_ahmad'), { reactions: [{ reaction: 'noted', count: 2 }, { reaction: 'disagree', count: 0 }, { reaction: 'sad', count: 1 }], my_reaction: null });
  expectEqual('a question: agree, disagree, not sure yet', counts(db, 'u_ahmad', question).reactions.map((r) => [r.reaction, r.count]), [['agree', 2], ['disagree', 1], ['undecided', 1]]);
  expectError('someone who did not join reacts', 'not_found', () => server.reactToNotice(db, 'u_fatima', 'e01', notice.id, 'noted', NOW));
  expectError("a question's answer on an announcement", 'not_found', () => server.reactToNotice(db, 'u_ahmad', 'e01', notice.id, 'agree', NOW));
  expectError('"noted" is no answer to a question', 'not_found', () => server.reactToNotice(db, 'u_ahmad', 'e01', question.id, 'noted', NOW));
  const agreed = server.reactToNotice(db, 'u_ahmad', 'e01', question.id, 'agree', NOW);
  expectEqual('Ahmad, who joined, answers', counts(agreed, 'u_ahmad', question).my_reaction, 'agree');
  const switched = server.reactToNotice(agreed, 'u_ahmad', 'e01', question.id, 'disagree', NOW);
  expectEqual('a new answer replaces his first', counts(switched, 'u_ahmad', question).reactions.map((r) => r.count), [2, 2, 1]);
  expectEqual('and he can take it back', counts(server.reactToNotice(switched, 'u_ahmad', 'e01', question.id, null, NOW), 'u_ahmad', question).my_reaction, null);
  expectEqual('a deleted notice takes its reactions with it', server.deleteNotice(switched, 'u_khaled', 'e01', question.id).notice_reactions.some((r) => r.notice_id === question.id), false);
  expectError('a kind of notice that does not exist', 'not_found', () => server.postNotice(db, 'u_khaled', 'e01', 'نعم أم لا؟', 'poll' as never, NOW));
}

console.log('\n— attendance kept on the phone with no connection');
{
  const MIN = 60_000;
  const db = buildSeed(NOW);
  const e01 = db.events.find((e) => e.id === 'e01')!;
  const ends = new Date(e01.ends_at).getTime();
  const base = { actorId: 'u_khaled', participantId: 'u_f3', actorIsOrganizer: true, event: e01, attendance: undefined };
  const reg = db.registrations.find((r) => r.event_id === 'e01' && r.user_id === 'u_f3');
  const late = ends + 3 * 60 * MIN;
  const start = rules.decideRecordStart({ ...base, registration: reg, recordedAt: ends - 60 * MIN, now: late });
  expectEqual('a start tapped during the event, sent after it', [start.started_at, start.start_source], [new Date(ends - 60 * MIN).toISOString(), 'live']);
  expectError('the same, sent without its tap time', 'event_closed', () => rules.decideRecordStart({ ...base, registration: reg, now: late }));
  expectError('a tap time two days and more ago', 'sent_too_late', () =>
    rules.decideRecordStart({ ...base, registration: reg, recordedAt: late - 49 * 60 * MIN, now: late }),
  );
  expectError('a tap time ahead of the server by more than a phone clock may be', 'time_in_future', () =>
    rules.decideRecordStart({ ...base, registration: reg, recordedAt: NOW + 10 * MIN, now: NOW }),
  );

  // As the server sends it: who joined, and what it has recorded for each.
  const roster = {
    event: { id: 'e01' } as RosterResponse['event'],
    participants: server.joinedUsers(db, 'e01').map((u) => ({
      user: { id: u.id, full_name: u.full_name, avatar_url: null, gender: u.gender },
      attendance: server.attendanceOf(db, 'e01', u.id) ?? null,
      i_warned: false,
    })),
  };
  const queued = [
    { id: 'q1', kind: 'start' as const, eventId: 'e01', userId: 'u_f3', name: 'f3', recordedAt: NOW - 30 * MIN },
    { id: 'q2', kind: 'end' as const, eventId: 'e01', userId: 'u_f3', name: 'f3', recordedAt: NOW - 6 * MIN },
    { id: 'q3', kind: 'end' as const, eventId: 'e01', userId: 'u_f1', name: 'f1', at: NOW - 10 * MIN, recordedAt: NOW - 5 * MIN },
    { id: 'q4', kind: 'start' as const, eventId: 'e02', userId: 'u_f4', name: 'f4', recordedAt: NOW },
  ];
  const shown = rosterWithQueued(roster, queued);
  const of = (id: string) => shown.find((p) => p.user.id === id)!;
  expectEqual('a start and finish kept on the phone show on the roster', [of('u_f3').attendance?.hours, of('u_f3').queued], [0.4, true]);
  expectEqual('a finish for someone the server has working', [of('u_f1').attendance?.ended_at, of('u_f1').queued], [new Date(NOW - 10 * MIN).toISOString(), true]);
  expectEqual("another event's records stay out", of('u_f4').queued, false);
  expectEqual('people with nothing kept on the phone are as the server says', of('u_mariam'), { ...roster.participants.find((p) => p.user.id === 'u_mariam'), queued: false });
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
