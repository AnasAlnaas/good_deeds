// The lesson library: lessons of earlier events, offered to a new event's form
// so a lesson written once is not written again (the app's EventForm adds one
// as a copy, which the person may then change). Server and offline demo both
// build it with lessonLibrary, so they offer the same lessons.
//
// Which lessons: those of the person's own events, whatever became of them, and
// those of events the association approved (not a draft, not turned down):
// lessons it has reviewed already. A picture is reused, not sent again: a
// lesson names the same picture (server/src/lesson-images.ts keeps a picture
// while any lesson shows it).

import type { AppEvent, EventLesson } from './types';

/** At most this many lessons are offered: the person's own first, then the latest. */
export const LESSON_LIBRARY_MAX = 60;

type LibraryEvent = Pick<AppEvent, 'id' | 'title' | 'status' | 'created_by' | 'starts_at'>;
type LibraryLesson = Pick<EventLesson, 'id' | 'event_id' | 'order_index' | 'title' | 'body' | 'image_id' | 'video_id'>;

/** A lesson the library offers, with the event it was written for. */
export interface LibraryEntry<L extends LibraryLesson = LibraryLesson> {
  lesson: L;
  event: LibraryEvent;
  mine: boolean;
}

const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Two lessons that say the same are offered once. */
export const lessonKey = (l: Pick<LibraryLesson, 'title' | 'body' | 'image_id' | 'video_id'>) =>
  [squeeze(l.title), squeeze(l.body), l.image_id ?? '', l.video_id ?? ''].join('\u0000');

/** May this person reuse this event's lessons? */
export function inLessonLibrary(meId: string, e: Pick<AppEvent, 'status' | 'created_by'>) {
  return e.created_by === meId || (e.status !== 'draft' && e.status !== 'rejected');
}

/**
 * The lessons offered to this person's new event, in the order shown: their
 * own events' first, then the others'; within each, the latest event first and
 * an event's lessons in their order. The same lesson (lessonKey) only once.
 */
export function lessonLibrary<L extends LibraryLesson>(meId: string, events: LibraryEvent[], lessons: L[], max = LESSON_LIBRARY_MAX): LibraryEntry<L>[] {
  const byId = new Map(events.filter((e) => inLessonLibrary(meId, e)).map((e) => [e.id, e]));
  const entries = lessons.flatMap((lesson) => {
    const event = byId.get(lesson.event_id);
    return event ? [{ lesson, event, mine: event.created_by === meId }] : [];
  });
  entries.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      Date.parse(b.event.starts_at) - Date.parse(a.event.starts_at) ||
      a.event.id.localeCompare(b.event.id) ||
      a.lesson.order_index - b.lesson.order_index,
  );
  const seen = new Set<string>();
  const out: LibraryEntry<L>[] = [];
  for (const entry of entries) {
    const key = lessonKey(entry.lesson);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}
