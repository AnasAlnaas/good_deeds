// Skills and matching (owner's decisions, 2026-11-20): the association's
// list (admins add, rename, hide), a person's skills and liked classes (only
// they see them), the skills an event names (its type's suggestions unless the
// proposer chose), and the upcoming events that fit a person, best first.
// Run: npm run check:api (runs this after check-engagement.ts)

import type { AdminSkillRow, EventDetail, EventFormMeta, EventMatch, EventProposal, MySkillsResponse } from '../../shared/api';
import { matchScore, STARTING_SKILLS } from '../../shared/skills';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const DAY = 24 * 3_600_000;
const h = await startHarness(NOW);
const { call, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const ahmad = await login('u_ahmad'); // teaches, works with children, likes learning and the environment
const mariam = await login('u_mariam');
const khaled = await login('u_khaled');

console.log('\n— the score');
expectEqual('a skill counts 2, a liked class 1', matchScore({ event_class: 'learning', skill_ids: ['teaching', 'driving'] }, { skill_ids: ['teaching'], classes: ['learning'] }), 3);
expectEqual('nothing in common: 0', matchScore({ event_class: 'health', skill_ids: ['nursing'] }, { skill_ids: ['teaching'], classes: ['learning'] }), 0);

console.log('\n— a person\'s skills');
const mine: MySkillsResponse = (await call('GET', '/me/skills', ahmad)).body;
expectEqual('ahmad\'s, from the demo', [mine.skill_ids.sort(), mine.classes.sort()], [['children', 'teaching'], ['environment', 'learning']]);
expectEqual('the starting list is offered', mine.offered.length, STARTING_SKILLS.length);
const saved: MySkillsResponse = await expectOk(
  'mariam chooses hers (an unknown skill and class are dropped, each once)',
  call('PUT', '/me/skills', mariam, { skill_ids: ['nursing', 'first_aid', 'nursing', 'flying'], classes: ['health', 'space'] }),
);
expectEqual('as kept', [saved.skill_ids.sort(), saved.classes], [['first_aid', 'nursing'], ['health']]);
await expectError('nobody else can read them (no such route)', 'not_found', call('GET', '/users/u_mariam/skills', ahmad));

console.log('\n— an event\'s skills');
const meta: EventFormMeta = (await call('GET', '/events/form', khaled)).body;
expectEqual('the form offers the list', meta.skills?.length, STARTING_SKILLS.length);
const proposal = (over: Partial<EventProposal> = {}): EventProposal => ({
  title: 'دروس تقوية للأطفال',
  description: 'نساعد أطفال الحي في دروسهم.',
  subtype: 'tutoring',
  location_type: 'in_person',
  address_text: 'حي الأندلس، طرابلس',
  lat: 32.87,
  lng: 13.13,
  meeting_platform: null,
  meeting_url: null,
  starts_at: new Date(NOW + 3 * DAY).toISOString(),
  ends_at: new Date(NOW + 3 * DAY + 2 * 3_600_000).toISOString(),
  capacity: 10,
  gender_category: 'mixed',
  terms: [],
  lessons: [],
  ...over,
});
const suggested = await expectOk('khaled proposes tutoring, naming no skills', call('POST', '/events', khaled, proposal()));
const detail: EventDetail = (await call('GET', `/events/${suggested.id}`, khaled)).body;
expectEqual('it takes its type\'s suggestions', detail.skill_ids?.sort(), ['children', 'teaching']);
const chosen = await expectOk('one naming its own', call('POST', '/events', khaled, proposal({ title: 'قيادة سيارات للتوزيع', subtype: 'food_baskets', skill_ids: ['driving', 'flying'] })));
expectEqual('only the known ones', ((await call('GET', `/events/${chosen.id}`, khaled)).body as EventDetail).skill_ids, ['driving']);

console.log('\n— matches');
const matches: EventMatch[] = (await call('GET', '/me/skills/matches', ahmad)).body;
expectEqual('ahmad\'s best fit: the demo\'s tutoring (two skills and a liked class)', [matches[0]?.event_id, matches[0]?.score, matches[0]?.matched_skill_ids.sort()], ['e05', 5, ['children', 'teaching']]);
expectEqual('khaled\'s proposal still waits for an admin, so it is not suggested', matches.some((m) => m.event_id === suggested.id), false);
expectEqual('only events that fit', matches.every((m) => m.score > 0), true);
expectEqual('someone with nothing chosen has none', ((await call('GET', '/me/skills/matches', khaled)).body as EventMatch[]).length, 0);

console.log('\n— the panel');
const list: AdminSkillRow[] = (await call('GET', '/admin/skills', admin)).body;
expectEqual('it counts who chose each', list.find((x) => x.id === 'teaching')?.people, 1);
await expectError('a member cannot', 'forbidden', call('GET', '/admin/skills', ahmad));
const added: AdminSkillRow[] = await expectOk('an admin adds one', call('POST', '/admin/skills', admin, { name_ar: 'خياطة', name_en: 'Sewing' }));
const sewing = added.find((x) => x.name_ar === 'خياطة')!;
await expectError('not twice', 'skill_exists', call('POST', '/admin/skills', admin, { name_ar: 'خياطة', name_en: '' }));
await expectOk('and hides teaching', call('PATCH', '/admin/skills/teaching', admin, { is_active: false }));
const offered: MySkillsResponse = (await call('GET', '/me/skills', ahmad)).body;
expectEqual('teaching is no longer offered, sewing is', [offered.offered.some((x) => x.id === 'teaching'), offered.offered.some((x) => x.id === sewing.id)], [false, true]);
expectEqual('but ahmad keeps it', offered.skill_ids.includes('teaching'), true);
const kept: MySkillsResponse = await expectOk('and keeps it when he saves', call('PUT', '/me/skills', ahmad, { skill_ids: ['teaching', 'children'], classes: ['learning'] }));
expectEqual('still his', kept.skill_ids.sort(), ['children', 'teaching']);
await expectOk('an admin renames sewing', call('PATCH', `/admin/skills/${sewing.id}`, admin, { name_en: 'Tailoring' }));
expectEqual('renamed', ((await call('GET', '/admin/skills', admin)).body as AdminSkillRow[]).find((x) => x.id === sewing.id)?.name_en, 'Tailoring');

await h.done();
