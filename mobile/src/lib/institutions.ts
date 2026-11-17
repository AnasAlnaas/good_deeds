import type { Ionicons } from '@expo/vector-icons';

import type { InstitutionKind } from '@/data/types';

/** An icon for each kind of institution (shared/types.ts INSTITUTION_KINDS). */
const ICONS: Record<InstitutionKind, keyof typeof Ionicons.glyphMap> = {
  association: 'people-circle-outline',
  foundation: 'business-outline',
  school: 'school-outline',
  university: 'library-outline',
  mosque: 'moon-outline',
  company: 'briefcase-outline',
  team: 'hand-left-outline',
  other: 'ellipse-outline',
};

export const institutionIcon = (kind: InstitutionKind) => ICONS[kind] ?? ICONS.other;
