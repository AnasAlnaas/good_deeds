import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, EmptyState, QueryState } from '@/components/ui';
import { WarningBadge } from '@/components/WarningBadge';
import { useMyWarnings } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// The warnings a supervisor gave this member. Nobody else's reach the app, and
// nobody but the member and the association's admins sees these.
export default function MyWarningsScreen() {
  const { s, now } = useApp();
  const query = useMyWarnings();
  if (!query.data) {
    return (
      <Screen back title={s.warnings.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  return (
    <Screen back title={s.warnings.title}>
      <Card style={styles.intro}>
        <Txt>{s.warnings.intro}</Txt>
      </Card>
      {query.data.length === 0 && <EmptyState icon="shield-checkmark-outline" text={s.warnings.empty} />}
      {query.data.map(({ warning: w, event, issued_by }) => (
        <Card key={w.id} onPress={() => router.push(`/warnings/${w.id}`)}>
          <View style={styles.head}>
            <Txt variant="bodyStrong" style={styles.flex}>
              {event.title}
            </Txt>
            <WarningBadge status={w.status} />
          </View>
          <Txt numberOfLines={2}>{w.reason}</Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {[issued_by && fmt(issued_by.gender === 'female' ? s.warnings.fromFemale : s.warnings.from, { name: issued_by.full_name }), day(w.created_at, s, now)]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
