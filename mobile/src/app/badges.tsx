import { BadgeGrid } from '@/components/Badges';
import { Screen } from '@/components/Screen';
import { QueryState } from '@/components/ui';
import { useMeSummary } from '@/data/queries';
import { useApp } from '@/state/app';

// Every badge there is: those earned, and the rest dimmed, each saying what earns it.
export default function AllBadgesScreen() {
  const { s } = useApp();
  const summary = useMeSummary();
  return (
    <Screen back title={s.badges.allTitle}>
      {summary.data ? <BadgeGrid badges={summary.data.badges ?? []} all /> : <QueryState query={summary} />}
    </Screen>
  );
}
