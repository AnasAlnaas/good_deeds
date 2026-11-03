import type { Ionicons } from '@expo/vector-icons';

import type { Lang } from '@/i18n/strings';
import { classOf, EVENT_CLASSES, type EventClass, type EventClassId } from '../../../shared/classes';

export { classOf, EVENT_CLASSES, type EventClass, type EventClassId };

type Icon = keyof typeof Ionicons.glyphMap;

// A class added in shared/classes.ts shows `leaf` until it gets its own icon here.
const ICONS: Partial<Record<EventClassId, Icon>> = {
  environment: 'leaf',
  health: 'medkit',
  learning: 'book',
  community: 'people',
};

export const classIcon = (id: EventClassId): Icon => ICONS[id] ?? 'leaf';

export function className(id: EventClassId, lang: Lang) {
  const c = EVENT_CLASSES.find((k) => k.id === id);
  return c ? (lang === 'ar' ? c.name_ar : c.name_en) : id;
}
