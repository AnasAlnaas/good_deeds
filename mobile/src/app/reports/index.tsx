import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, QueryState } from '@/components/ui';
import { useMeSummary, useMyReports } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// The reports this member made, and whether the association has looked at
// them. What the association did about one stays with the association.
export default function MyReportsScreen() {
  const { s, now } = useApp();
  const query = useMyReports();
  const me = useMeSummary();
  const footer = me.data?.can_report ? (
    <Button icon="flag-outline" label={s.report.new} onPress={() => router.push('/reports/new')} />
  ) : undefined;

  if (!query.data) {
    return (
      <Screen back title={s.report.mine}>
        <QueryState query={query} />
      </Screen>
    );
  }
  return (
    <Screen back title={s.report.mine} footer={footer}>
      {query.data.length === 0 && <EmptyState icon="flag-outline" text={s.report.empty} />}
      {query.data.map(({ report: r, event, subject }) => (
        <Card key={r.id}>
          <View style={styles.head}>
            <Txt variant="bodyStrong" style={styles.flex}>
              {s.reportCategory[r.category]}
            </Txt>
            <Badge
              label={r.status === 'open' ? s.report.open : s.report.handled}
              color={r.status === 'open' ? colors.warning : colors.success}
              icon={r.status === 'open' ? 'hourglass-outline' : 'checkmark-circle'}
            />
          </View>
          {(event || subject) && (
            <Txt variant="caption" color={colors.inkMuted}>
              {[event?.title, subject && fmt(s.report.about, { name: subject.full_name })].filter(Boolean).join(' · ')}
            </Txt>
          )}
          {r.note && <Txt>{r.note}</Txt>}
          <Txt variant="caption" color={colors.inkMuted}>
            {day(r.created_at, s, now)}
          </Txt>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
