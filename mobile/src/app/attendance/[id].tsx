import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, InfoRow } from '@/components/ui';
import { PILLARS, type Pillar } from '@/data/types';
import * as server from '@/demo/server';
import { count, day, fmt, num, time } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, pillarColor, space } from '@/theme/tokens';

// Screen 17: the participant confirms or disputes what the supervisor recorded.
// Confirming is the app's one reward moment: the pillar bar fills over 600ms.
export default function ConfirmHours() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, s, now } = useApp();
  const me = useMe();
  const act = useAction();
  const [reward, setReward] = useState<{ before: number; earned: number } | null>(null);

  const a = db.attendance.find((x) => x.id === id && x.user_id === me.id);
  if (!a) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" text={s.errors.not_your_attendance} />
      </Screen>
    );
  }
  const event = server.getEvent(db, a.event_id);
  const supervisor = server.getUser(db, a.recorded_by);
  const preview = server.pointsForAttendance(db, a);
  const previewTotal = PILLARS.reduce((sum, p) => sum + preview[p], 0);

  const confirm = () => {
    const before = server.totalPoints(db, me.id);
    if (act((d, t) => server.confirmAttendance(d, me.id, a.id, t))) setReward({ before, earned: previewTotal });
  };
  const dispute = () =>
    Alert.alert(s.confirm.disputeTitle, s.confirm.disputeBody, [
      { text: s.cancel, style: 'cancel' },
      { text: s.confirm.dispute, style: 'destructive', onPress: () => act((d, t) => server.disputeAttendance(d, me.id, a.id, t)) },
    ]);

  if (reward) {
    const after = server.totalPoints(db, me.id);
    return (
      <Screen footer={<Button label={s.confirm.done} onPress={() => router.back()} />}>
        <View style={styles.reward}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Txt variant="screenTitle" align="center">
            {s.confirm.confirmed}
          </Txt>
          <Txt variant="sectionTitle" align="center" color={colors.primary}>
            {fmt(s.confirm.earned, { points: count(reward.earned, s.units.point) })}
          </Txt>
          <View style={styles.fullWidth}>
            <PillarBar values={server.pointsByPillar(db, me.id)} height={20} fill={1} animateFrom={after > 0 ? reward.before / after : 0} />
          </View>
        </View>
      </Screen>
    );
  }

  const pending = a.participant_status === 'pending' && !!a.ended_at;

  return (
    <Screen
      back
      title={s.confirm.title}
      footer={
        pending ? (
          <>
            <Button icon="checkmark" label={s.confirm.confirm} onPress={confirm} />
            <Button variant="danger" icon="alert-circle-outline" label={s.confirm.dispute} onPress={dispute} />
          </>
        ) : undefined
      }>
      {a.participant_status === 'confirmed' && <Badge label={s.activity.confirmedLabel} color={colors.success} icon="checkmark-circle" />}
      {a.participant_status === 'disputed' && <Badge label={s.confirm.disputed} color={colors.warning} icon="alert-circle" />}

      <Txt variant="sectionTitle">
        {fmt(s.confirm.summary, {
          supervisor: supervisor?.full_name ?? '',
          hours: count(a.hours ?? 0, s.units.hour),
          event: event.title,
        })}
      </Txt>

      <Card>
        <InfoRow icon="calendar-outline" label={event.title} value={day(a.started_at, s, now)} />
        <InfoRow icon="play-outline" label={s.confirm.from} value={time(a.started_at, s)} />
        {a.ended_at && <InfoRow icon="stop-outline" label={s.confirm.to} value={time(a.ended_at, s)} />}
      </Card>
      {a.end_source === 'auto_closed' && <Txt variant="caption" color={colors.warning}>{s.confirm.autoClosed}</Txt>}
      {a.start_source === 'backdated' && <Txt variant="caption" color={colors.inkMuted}>{s.confirm.backdated}</Txt>}
      {a.participant_status === 'disputed' && <Txt color={colors.inkMuted}>{s.confirm.disputedBody}</Txt>}

      {pending && (
        <Card>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.confirm.willEarn}
          </Txt>
          <Txt variant="metric" tabular>
            {num(previewTotal)}
          </Txt>
          <PillarBar values={preview} height={14} />
          <View style={styles.split}>
            {PILLARS.filter((p: Pillar) => preview[p] > 0).map((p) => (
              <Badge key={p} label={`${s.pillar[p]} ${num(preview[p])}`} color={pillarColor[p]} />
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  reward: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  fullWidth: { alignSelf: 'stretch', marginTop: space.lg },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
