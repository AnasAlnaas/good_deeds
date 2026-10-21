import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState } from '@/components/ui';
import * as server from '@/demo/server';
import { END_GRACE_MINUTES } from '@/demo/placeholders';
import { count, fmt, time } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// Screen 14: the supervisor's list of joined participants and each one's state.
export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, s, now } = useApp();
  const me = useMe();
  const event = server.getEvent(db, id);
  const status = server.effectiveStatus(event, now);
  const participants = server.joinedUsers(db, id);
  const canStart = status === 'running';
  const canEnd = now >= new Date(event.starts_at).getTime() && now <= new Date(event.ends_at).getTime() + END_GRACE_MINUTES * 60_000;

  const open = (userId: string, mode: 'start' | 'end') =>
    router.push({ pathname: '/event/[id]/record', params: { id, userId, mode } });

  return (
    <Screen back title={s.roster.title}>
      <Txt variant="bodyStrong">{event.title}</Txt>
      {status === 'published' && (
        <Card style={styles.notice}>
          <Txt color={colors.inkMuted}>{s.roster.notRunning}</Txt>
        </Card>
      )}
      {participants.length === 0 && <EmptyState icon="people-outline" text={s.roster.empty} />}
      {participants.map((u) => {
        const a = server.attendanceOf(db, id, u.id);
        const state = !a ? 'notStarted' : a.ended_at ? 'done' : 'working';
        const self = u.id === me.id;
        return (
          <Card key={u.id}>
            <View style={styles.head}>
              <Txt variant="bodyStrong" style={styles.flex}>
                {u.full_name}
              </Txt>
              <Badge
                label={s.roster[state]}
                color={state === 'working' ? colors.danger : state === 'done' ? colors.success : colors.inkMuted}
                icon={state === 'working' ? 'radio-button-on' : state === 'done' ? 'checkmark-circle' : undefined}
              />
            </View>
            {a && (
              <Txt variant="caption" color={colors.inkMuted}>
                {fmt(s.roster.startedAt, { time: time(a.started_at, s) })}
                {a.ended_at ? ` · ${fmt(s.roster.endedAt, { time: time(a.ended_at, s) })} · ${count(a.hours ?? 0, s.units.hour)}` : ''}
                {a.end_source === 'auto_closed' ? ` · ${s.roster.autoClosed}` : ''}
              </Txt>
            )}
            {self ? (
              <Txt variant="caption" color={colors.inkMuted}>
                {s.roster.self}
              </Txt>
            ) : !a && canStart ? (
              <Button icon="play" label={s.roster.recordStart} onPress={() => open(u.id, 'start')} />
            ) : a && !a.ended_at && canEnd ? (
              <Button variant="secondary" icon="stop" label={s.roster.recordEnd} onPress={() => open(u.id, 'end')} />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.surfaceAlt },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
