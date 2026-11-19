import { Badge } from '@/components/ui';
import type { OutsideHoursItem } from '@/data/api';
import type { Strings } from '@/i18n/strings';
import { colors } from '@/theme/tokens';

/** Its state, as the volunteer and the representative both see it. */
export function ClaimStatus({ item, s }: { item: OutsideHoursItem; s: Strings }) {
  const { status } = item.claim;
  return (
    <Badge
      label={s.outsideHours[status]}
      color={status === 'approved' ? colors.success : status === 'rejected' ? colors.danger : colors.warning}
      icon={status === 'approved' ? 'checkmark-circle' : status === 'rejected' ? 'close-circle' : 'hourglass-outline'}
    />
  );
}
