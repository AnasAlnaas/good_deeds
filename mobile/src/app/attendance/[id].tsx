import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmedMotion } from '@/components/brand';
import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState } from '@/components/ui';
import { useAttendance, useMeSummary } from '@/data/queries';
import { PILLARS, type Pillar } from '@/data/types';
import { count, day, fmt, num, time } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, pillarColor, space } from '@/theme/tokens';

// Screen 17: the participant confirms or disputes what the supervisor recorded.
// Confirming is the app's one reward moment: the pillar bar fills over 600ms.
export default function ConfirmHours() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, now } = useApp();
  const { run, busy } = useAction();
  const query = useAttendance(id);
  const summary = useMeSummary();
  const [reward, setReward] = useState<{ before: number; earned: Record<Pillar, number> } | null>(null);

  if (reward) {
    const earnedTotal = PILLARS.reduce((sum, p) => sum + reward.earned[p], 0);
    const after = summary.data?.total_points ?? reward.before + earnedTotal;
    return (
      <Screen footer={<Button label={s.confirm.done} onPress={() => router.back()} />}>
        <View style={styles.reward}>
          <ConfirmedMotion values={reward.earned} />
          <Txt variant="screenTitle" align="center">
            {s.confirm.confirmed}
          </Txt>
          <Txt variant="sectionTitle" align="center" color={colors.primary}>
            {fmt(s.confirm.earned, { points: count(earnedTotal, s.units.point) })}
          </Txt>
          <View style={styles.fullWidth}>
            <PillarBar
              values={summary.data?.points_by_pillar ?? reward.earned}
              height={20}
              fill={1}
              animateFrom={after > 0 ? reward.before / after : 0}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    return (
      <Screen back>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { attendance: a, event, recorded_by: supervisor, points: preview } = query.data;
  const previewTotal = PILLARS.reduce((sum, p) => sum + preview[p], 0);

  const confirm = async () => {
    const before = summary.data?.total_points ?? 0;
    const done = await run((b) => b.confirmAttendance(a.id));
    if (done) setReward({ before, earned: done.value.points_earned });
  };
  const dispute = () =>
    dialog.confirm({
      title: s.confirm.disputeTitle,
      message: s.confirm.disputeBody,
      cancel: s.cancel,
      action: s.confirm.dispute,
      destructive: true,
      onConfirm: () => run((b) => b.disputeAttendance(a.id)),
    });

  const pending = a.participant_status === 'pending' && !!a.ended_at;

  return (
    <Screen
      back
      title={s.confirm.title}
      footer={
        pending ? (
          <>
            <Button icon="checkmark" label={s.confirm.confirm} disabled={busy} onPress={confirm} />
            <Button variant="danger" icon="alert-circle-outline" label={s.confirm.dispute} disabled={busy} onPress={dispute} />
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
