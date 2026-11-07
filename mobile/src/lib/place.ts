import type { AppEvent } from '@/data/types';
import type { Strings } from '@/i18n/strings';

type Place = Pick<AppEvent, 'location_type' | 'address_text' | 'meeting_platform'>;

/** Where an event happens, in a line: its address, or "online on Zoom". */
export function placeLabel(e: Place, s: Strings) {
  if (e.location_type === 'online') {
    return e.meeting_platform && e.meeting_platform !== 'other'
      ? s.event.onlineVia.replace('{platform}', s.platforms[e.meeting_platform])
      : s.event.online;
  }
  return e.address_text ?? '';
}

/**
 * Owner's decision (2026-11-07): an online event's times say they are Tripoli's
 * (someone may join from elsewhere). An event in a place needs no such note.
 */
export function withZone(text: string, e: Pick<AppEvent, 'location_type'>, s: Strings) {
  return e.location_type === 'online' ? `${text} (${s.event.tripoliTime})` : text;
}
