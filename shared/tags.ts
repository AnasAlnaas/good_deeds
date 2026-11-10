// Tags: what kind of good work an event is, under its class (shared/classes.ts).
// A form offers the known types of the chosen class (shared/placeholders.ts
// lists them, with their points) and lets a person write a tag of their own.
// A written tag that came into use is then offered to everyone (promotedTags).
//
// An event keeps its tag in `subtype`: a known type's id, or the tag as
// written. With a written tag the event also keeps the class it was put under
// (`event_class`); a known type's class is always its own.

import { CLASS_OF_SUBTYPE, type EventClassId, isEventClass } from './classes';
import { BASE_POINTS_BY_SUBTYPE, CUSTOM_TAG_BASE_POINTS } from './placeholders';
import type { AppEvent } from './types';

export const TAG_MIN = 2;
export const TAG_MAX = 30;
/**
 * A written tag is offered to everyone once this many approved events carry it.
 * Only approved events count, so the association's review is what lets a tag in.
 */
export const TAG_PROMOTION_USES = 3;

/** A tag people wrote, offered under its class. */
export interface EventTag {
  tag: string;
  event_class: EventClassId;
}

export function isKnownType(subtype: string) {
  return Object.prototype.hasOwnProperty.call(BASE_POINTS_BY_SUBTYPE, subtype);
}

/** A written tag, tidied: one line, single spaces, with a letter in it. null = not a tag. */
export function cleanTag(text: string): string | null {
  const tag = text.replace(/\s+/g, ' ').trim();
  if (tag.length < TAG_MIN || tag.length > TAG_MAX || !/\p{L}/u.test(tag)) return null;
  return tag;
}

/**
 * What makes two written tags the same one: letter case, spaces, and in Arabic
 * the marks (تشكيل), the stretch (ـ) and the hamza on an alef do not count.
 */
export function tagKey(text: string) {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * An event's tag and class, as a form sent them. A known type goes under its
 * own class whatever was sent; a written tag needs a class. null = not valid.
 */
export function cleanKind(input: { subtype: string; event_class?: string | null }): { subtype: string; event_class: EventClassId } | null {
  if (isKnownType(input.subtype)) return { subtype: input.subtype, event_class: CLASS_OF_SUBTYPE[input.subtype] ?? 'community' };
  const tag = cleanTag(input.subtype);
  if (!tag || !isEventClass(input.event_class)) return null;
  return { subtype: tag, event_class: input.event_class };
}

/** What attending an event of this tag is worth: its type's points, or those of a written tag. */
export function basePointsOf(subtype: string) {
  return isKnownType(subtype) ? BASE_POINTS_BY_SUBTYPE[subtype] : CUSTOM_TAG_BASE_POINTS;
}

/**
 * The written tags that came into use: carried by TAG_PROMOTION_USES approved
 * events of one class (a waiting or turned-down proposal does not count). Each
 * is spelled the way most of its events spell it; the most used come first.
 */
export function promotedTags(events: Pick<AppEvent, 'subtype' | 'event_class' | 'status'>[]): EventTag[] {
  const groups = new Map<string, { event_class: EventClassId; uses: number; spellings: Map<string, number> }>();
  for (const e of events) {
    if (isKnownType(e.subtype) || !e.event_class || e.status === 'draft' || e.status === 'rejected') continue;
    const key = `${e.event_class}\n${tagKey(e.subtype)}`;
    const group = groups.get(key) ?? { event_class: e.event_class, uses: 0, spellings: new Map<string, number>() };
    group.uses += 1;
    group.spellings.set(e.subtype, (group.spellings.get(e.subtype) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.uses >= TAG_PROMOTION_USES)
    .sort((a, b) => b.uses - a.uses)
    .map((g) => ({ tag: [...g.spellings].sort((a, b) => b[1] - a[1])[0][0], event_class: g.event_class }));
}
