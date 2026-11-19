import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ClaimStatus } from '@/components/ClaimStatus';
import { Card, EmptyState, QueryState } from '@/components/ui';
import { useInstitutions, useMyOutsideHours } from '@/data/queries';
import { date, fmt } from '@/i18n/format';
import { durationText } from '@/lib/duration';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// Owner's decisions (2026-11-19): hours done for an institution outside the
// app's events, logged here and decided by its representative.
export default function MyOutsideHoursScreen() {
  const { s } = useApp();
  const query = useMyOutsideHours();
  const institutions = useInstitutions();

  if (!query.data || !institutions.data) {
    return (
      <Screen back title={s.outsideHours.title}>
        <QueryState query={query.data ? institutions : query} />
      </Screen>
    );
  }

  const mine = institutions.data.mine.filter((x) => x.status === 'confirmed' && x.institution.status === 'approved');
  const footer =
    mine.length > 0 ? (
      <Button icon="add-circle-outline" label={s.outsideHours.add} onPress={() => router.push('/outside-hours/new')} />
    ) : (
      <Button variant="secondary" icon="people-outline" label={s.outsideHours.joinInstitution} onPress={() => router.push('/institutions/join')} />
    );

  return (
    <Screen back title={s.outsideHours.title} footer={footer}>
      <Txt color={colors.inkMuted}>{mine.length > 0 ? s.outsideHours.intro : s.outsideHours.noInstitution}</Txt>
      {query.data.length === 0 && <EmptyState icon="time-outline" text={s.outsideHours.empty} />}
      {query.data.map((item) => (
        <Card key={item.claim.id}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Txt variant="bodyStrong">{durationText(item.claim.minutes, s)}</Txt>
              <Txt variant="caption" color={colors.inkMuted}>
                {date(`${item.claim.done_on}T12:00:00`, s)}
                {item.claim.place ? ` · ${item.claim.place}` : ''}
              </Txt>
            </View>
            <ClaimStatus item={item} s={s} />
          </View>
          <Txt>{item.claim.description}</Txt>
          <Txt variant="caption" color={colors.primary}>
            {fmt(s.outsideHours.forInstitution, { name: item.institution.name })}
          </Txt>
          {item.decided_by && (
            <Txt variant="caption" color={colors.inkMuted}>
              {fmt(s.outsideHours.decidedBy, { name: item.decided_by.full_name })}
            </Txt>
          )}
          {item.claim.decision_note && <Txt color={colors.inkMuted}>{fmt(s.outsideHours.reason, { note: item.claim.decision_note })}</Txt>}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
