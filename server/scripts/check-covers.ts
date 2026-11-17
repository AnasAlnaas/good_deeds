// Events' cover photos (owner's decisions, 2026-11-17, design ج): the proposer
// chooses one with the event (sent first like a lesson's picture), it shows at
// once on the list and the page, an admin removes an unsuitable one (and the
// proposer is told), and a picture no event or lesson uses is not kept.
// Run: npm run check:api (runs this after check-institutions.ts)

import type { EventProposal, EventSummary } from '../../shared/api';
import { COVER_HEIGHT_PX, COVER_WIDTH_PX } from '../../shared/rules';
import * as s from '../src/db/schema';
import { startHarness } from './harness';

const NOW = new Date('2026-10-21T12:00:00').getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const h = await startHarness(NOW);
const { call, conn, login, expectError, expectOk, expectEqual } = h;

const admin = await login('u_admin');
const khaled = await login('u_khaled');
const ahmad = await login('u_ahmad');
await call('PUT', '/me/push-token', khaled, { token: 'ExponentPushToken[khaled]', lang: 'ar' });

// A JPEG's segments with a frame header giving the cover's size, as check-api.ts builds lesson pictures:
// the server checks the segments and reads the size; it does not decode the picture.
const segment = (marker: number, payload: Buffer) =>
  Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
const [w, ht] = [COVER_WIDTH_PX, COVER_HEIGHT_PX];
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  segment(0xdb, Buffer.alloc(65, 1)),
  segment(0xc0, Buffer.from([8, ht >> 8, ht & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0])),
  Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]),
]).toString('base64');

const proposal = (cover_image_id: string | null | undefined): EventProposal => ({
  title: 'تنظيف حديقة الحي',
  description: 'ننظّف الحديقة ونزرع الشتلات.',
  subtype: 'street_cleanup',
  location_type: 'in_person',
  address_text: 'حديقة الحي، طرابلس',
  lat: 32.87,
  lng: 13.13,
  meeting_platform: null,
  meeting_url: null,
  starts_at: iso(NOW + 4 * DAY),
  ends_at: iso(NOW + 4 * DAY + 2 * HOUR),
  capacity: 10,
  gender_category: 'mixed',
  terms: [],
  lessons: [],
  ...(cover_image_id === undefined ? {} : { cover_image_id }),
});

await expectError('a cover nobody sent', 'invalid_request', call('POST', '/events', khaled, proposal('no-such-picture')));
const sent = await expectOk('khaled sends a cover photo', call('POST', '/lesson-images', khaled, { jpeg_base64: jpeg }));
const { id } = await expectOk('and proposes an event with it', call('POST', '/events', khaled, proposal(sent.image.id)));
const mine: EventSummary[] = (await call('GET', '/events', khaled)).body;
expectEqual('his list shows it', mine.find((e) => e.id === id)?.cover?.id, sent.image.id);
await expectOk('an edit from an older app keeps it', call('PUT', `/events/${id}`, khaled, proposal(undefined)));
expectEqual('  still there', ((await call('GET', `/events/${id}`, khaled)).body as EventSummary).cover?.id, sent.image.id);
await expectOk('an admin approves the event', call('POST', `/admin/events/${id}/publish`, admin, {}));
const theirs: EventSummary[] = (await call('GET', '/events', ahmad)).body;
expectEqual('everyone sees the cover', theirs.find((e) => e.id === id)?.cover?.url, sent.image.url);
await expectError('a member cannot remove it', 'forbidden', call('DELETE', `/admin/events/${id}/cover`, ahmad));
await expectOk('an admin removes it', call('DELETE', `/admin/events/${id}/cover`, admin));
expectEqual('the event has none now', ((await call('GET', `/events/${id}`, ahmad)).body as EventSummary).cover, null);
const left = await conn.db.select().from(s.lesson_images);
expectEqual('and the picture is not kept', left.some((x) => x.id === sent.image.id), false);
await h.settle();
expectEqual(
  'khaled was told',
  h.pushes.filter((p) => p.to === 'ExponentPushToken[khaled]' && p.data?.type === 'cover_removed').length,
  1,
);

const again = await expectOk('a new one for the withdrawn case', call('POST', '/lesson-images', khaled, { jpeg_base64: jpeg }));
const draft = await expectOk('another proposal with a cover', call('POST', '/events', khaled, proposal(again.image.id)));
await expectOk('withdrawn', call('DELETE', `/events/${draft.id}`, khaled));
const after = await conn.db.select().from(s.lesson_images);
expectEqual('its picture goes with it', after.some((x) => x.id === again.image.id), false);

await h.done();
