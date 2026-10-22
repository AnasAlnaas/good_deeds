import type { WarningStatus } from '@/data/types';
import { useApp } from '@/state/app';
import { colors } from '@/theme/tokens';
import { Badge } from './ui';

/** Where a warning stands: in force, appealed, kept after the appeal, or withdrawn. */
export function WarningBadge({ status }: { status: WarningStatus }) {
  const { s } = useApp();
  const look = {
    active: { color: colors.danger, icon: 'alert-circle' },
    appealed: { color: colors.warning, icon: 'hourglass-outline' },
    upheld: { color: colors.danger, icon: 'alert-circle' },
    withdrawn: { color: colors.success, icon: 'checkmark-circle' },
  } as const;
  return <Badge label={s.warnings.status[status]} color={look[status].color} icon={look[status].icon} />;
}
