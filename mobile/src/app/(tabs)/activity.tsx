import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, SectionTitle } from '@/components/ui';
import * as server from '@/demo/server';
import { count, day, num } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { colors, space } from '@/theme/tokens';

export default function ActivityScreen() {
  const { db, s, now, isRTL } = useApp();
  const me = useMe();

  const mine = db.attendance
    .filter((a) => a.user_id === me.id)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const working = mine.filter((a) => !a.ended_at);
  const pending = mine.filter((a) => a.ended_at && a.participant_status === 'pending');
  const history = mine.filter((a) => a.participant_status !== 'pending');
  const byPillar = server.pointsByPillar(db, me.id);
  const total = server.totalPoints(db, me.id);

  return (
    <Screen title={s.activity.title}>
      <View style={styles.metrics}>
        <Card style={styles.metric}>
          <Txt variant="metric" tabular>
            {num(server.confirmedHours(db, me.id))}
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
      {total > 0 && <PillarBar values={byPillar} height={16} />}

      {mine.length === 0 && <EmptyState icon="leaf-outline" text={s.activity.empty} />}

      {working.map((a) => {
        const e = server.getEvent(db, a.event_id);
        return (
          <Card key={a.id} onPress={() => router.push(`/event/${e.id}`)}>
            <Badge label={s.activity.workingLabel} color={colors.danger} icon="radio-button-on" />
            <Txt variant="bodyStrong">{e.title}</Txt>
          </Card>
        );
      })}

      {pending.length > 0 && <SectionTitle>{s.activity.pending}</SectionTitle>}
      {pending.map((a) => {
        const e = server.getEvent(db, a.event_id);
        return (
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
        );
      })}

      {history.length > 0 && <SectionTitle>{s.activity.history}</SectionTitle>}
      {history.map((a) => {
        const e = server.getEvent(db, a.event_id);
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
