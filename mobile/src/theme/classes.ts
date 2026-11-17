import type { Ionicons } from '@expo/vector-icons';

import type { Lang } from '@/i18n/strings';
import { classOf, classOfEvent, EVENT_CLASSES, type EventClass, type EventClassId } from '../../../shared/classes';

export { classOf, classOfEvent, EVENT_CLASSES, type EventClass, type EventClassId };

type Icon = keyof typeof Ionicons.glyphMap;

// A class added in shared/classes.ts shows `leaf` until it gets its own icon here.
const ICONS: Partial<Record<EventClassId, Icon>> = {
  environment: 'leaf',
  health: 'medkit',
  learning: 'book',
  community: 'people',
};

export const classIcon = (id: EventClassId): Icon => ICONS[id] ?? 'leaf';

/** The colours of a cover drawn for an event with no photo (components/EventCover.tsx): one family per class. */
type CoverLook = { background: string; ring: string; ink: string };
const COVERS: Partial<Record<EventClassId, CoverLook>> = {
  environment: { background: '#DCEBDD', ring: '#B9D5BC', ink: '#1E5E3B' },
  health: { background: '#F6E2DA', ring: '#ECC3B3', ink: '#8A3418' },
  learning: { background: '#E5E3F5', ring: '#C9C4EC', ink: '#3C3489' },
  community: { background: '#F7EED6', ring: '#EAD7A2', ink: '#6B4C0C' },
};

export const classCover = (id: EventClassId): CoverLook => COVERS[id] ?? COVERS.environment!;

export function className(id: EventClassId, lang: Lang) {
  const c = EVENT_CLASSES.find((k) => k.id === id);
  return c ? (lang === 'ar' ? c.name_ar : c.name_en) : id;
}
