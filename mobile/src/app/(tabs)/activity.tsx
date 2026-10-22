import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, QueryState, SectionTitle } from '@/components/ui';
import { useMeSummary, useMyAttendance } from '@/data/queries';
import { count, day, num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

export default function ActivityScreen() {
  const { s, now, isRTL } = useApp();
  const records = useMyAttendance();
  const summary = useMeSummary();

  if (!records.data || !summary.data) {
    return (
      <Screen title={s.activity.title}>
        <QueryState query={records.data ? summary : records} />
      </Screen>
    );
  }

  const mine = records.data;
  const working = mine.filter((x) => !x.attendance.ended_at);
  const pending = mine.filter((x) => x.attendance.ended_at && x.attendance.participant_status === 'pending');
  const history = mine.filter((x) => x.attendance.participant_status !== 'pending');
  const total = summary.data.total_points;

  return (
    <Screen title={s.activity.title}>
      <View style={styles.metrics}>
        <Card style={styles.metric}>
          <Txt variant="metric" tabular>
            {num(summary.data.confirmed_hours)}
          </Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.activity.hours}
          </Txt>
        </Card>
        <Card style={styles.metric}>
          <Txt variant="metric" tabular>
            {num(total)}
          </Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.activity.points}
          </Txt>
        </Card>
      </View>
      {total > 0 && <PillarBar values={summary.data.points_by_pillar} height={16} />}

      {mine.length === 0 && <EmptyState icon="leaf-outline" text={s.activity.empty} />}

      {working.map(({ attendance: a, event: e }) => (
        <Card key={a.id} onPress={() => router.push(`/event/${e.id}`)}>
          <Badge label={s.activity.workingLabel} color={colors.danger} icon="radio-button-on" />
          <Txt variant="bodyStrong">{e.title}</Txt>
        </Card>
      ))}

      {pending.length > 0 && <SectionTitle>{s.activity.pending}</SectionTitle>}
      {pending.map(({ attendance: a, event: e }) => (
        <Card key={a.id} onPress={() => router.push(`/attendance/${a.id}`)} style={styles.pending}>
          <Txt variant="bodyStrong">{e.title}</Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {day(a.started_at, s, now)} · {count(a.hours ?? 0, s.units.hour)}
          </Txt>
          <View style={styles.cta}>
            <Txt variant="bodyStrong" color={colors.primary}>
              {s.activity.review}
            </Txt>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.primary} />
          </View>
        </Card>
      ))}

      {history.length > 0 && <SectionTitle>{s.activity.history}</SectionTitle>}
      {history.map(({ attendance: a, event: e }) => {
        const confirmed = a.participant_status === 'confirmed';
        return (
          <Card key={a.id} onPress={() => router.push(`/attendance/${a.id}`)}>
            <Badge
              label={confirmed ? s.activity.confirmedLabel : s.activity.disputedLabel}
              color={confirmed ? colors.success : colors.warning}
              icon={confirmed ? 'checkmark-circle' : 'alert-circle'}
            />
            <Txt variant="bodyStrong">{e.title}</Txt>
            <Txt variant="caption" color={colors.inkMuted}>
              {day(a.started_at, s, now)} · {count(a.hours ?? 0, s.units.hour)}
            </Txt>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: space.md },
  metric: { flex: 1 },
  pending: { borderColor: colors.primary, borderWidth: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
