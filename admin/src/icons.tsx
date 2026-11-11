// The panel's icons: line drawings on a 24 grid in the spirit of the app's
// Ionicons outlines, drawn in the text colour (currentColor). They are
// decorative: the words next to them carry the meaning.

import type { EventClassId } from '../../shared/classes';

const PATHS = {
  overview: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10.5h16M8.5 3.5v4M15.5 3.5v4',
  scale: 'M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z',
  flag: 'M5.5 21V4M5.5 4.5c4-2 6.5 2 11 0l1.5-.5v9l-1.5.5c-4.5 2-7-2-11 0',
  warning: 'M12 4 21 19.5H3zM12 10v4.5M12 17v.01',
  people:
    'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.4-3.6 3-5.5 6.5-5.5s6.1 1.9 6.5 5.5M16 11.5a3 3 0 1 0-.5-5.95M17.5 14.6c2.3.5 3.7 2.2 4 5.4',
  time: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  logout: 'M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  add: 'M12 5v14M5 12h14',
  location: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  videocam: 'M3.5 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM15.5 10.5 21 7.5v9l-5.5-3',
  hourglass: 'M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 10',
  // event classes (mobile/src/theme/classes.ts)
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-13 15M5 19l7-7',
  medkit: 'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V8M12 11v6M9 14h6',
  book: 'M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5zM12 6.5V20',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

// The same icon for each class as in the app; a new class shows the leaf until it gets one.
const CLASS_ICONS: Partial<Record<EventClassId, IconName>> = {
  environment: 'leaf',
  health: 'medkit',
  learning: 'book',
  community: 'people',
};

export const classIcon = (id: EventClassId): IconName => CLASS_ICONS[id] ?? 'leaf';

/** An icon in a cream circle, as on the app's event cards. */
export function IconCircle({ name, size = 40 }: { name: IconName; size?: number }) {
  return (
    <span className="class-icon" style={{ width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** A class's icon in its circle. */
export const ClassIcon = ({ id, size }: { id: EventClassId; size?: number }) => <IconCircle name={classIcon(id)} size={size} />;
