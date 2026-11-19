import { Share } from 'react-native';

import { SHARE_URL } from '@/data/config';
import type { Strings } from '@/i18n/strings';
import { date, fmt, time } from '@/i18n/format';
import { placeLabel, withZone } from '@/lib/place';
import type { AppEvent } from '@/data/types';

type Shared = Pick<AppEvent, 'title' | 'starts_at' | 'ends_at' | 'location_type' | 'address_text' | 'meeting_platform'>;

/**
 * Owner's decision (2026-11-19): an event is shared through the system's share
 * sheet (WhatsApp among its choices) as its title, its date and time, and its
 * place or "online", with the app's store link (EXPO_PUBLIC_SHARE_URL) when set.
 * The date is written out in full, never "tomorrow": the message is read later.
 */
export function shareText(event: Shared, s: Strings) {
  const start = new Date(event.starts_at);
  const when = withZone(
    `${s.time.weekdays[start.getDay()]} ${date(event.starts_at, s)} · ${time(event.starts_at, s)} – ${time(event.ends_at, s)}`,
    event,
    s,
  );
  const lines = [
    `«${event.title}»`,
    `${s.event.when}: ${when}`,
    `${s.event.where}: ${placeLabel(event, s)}`,
    '',
    SHARE_URL ? fmt(s.event.shareJoin, { app: s.appName, url: SHARE_URL }) : fmt(s.event.shareJoinNoLink, { app: s.appName }),
  ];
  return lines.join('\n');
}

export function shareEvent(event: Shared, s: Strings) {
  return Share.share({ title: event.title, message: shareText(event, s) }).catch(() => {});
}
