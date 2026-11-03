import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, QueryState } from '@/components/ui';
import { useRoster } from '@/data/queries';
import { END_GRACE_MINUTES } from '@/demo/placeholders';
import { count, fmt, time } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import { WARN_DAYS_AFTER_EVENT } from '../../../../../shared/rules';

// Screen 14: the supervisor's list of joined participants and each one's state.
// From here the supervisor also records a warning for someone, once the event has started.
export default function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, now } = useApp();
  const me = useMe();
  const query = useRoster(id);
  if (!query.data) {
    return (
      <Screen back title={s.roster.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { event, participants } = query.data;
  const status = event.status;
  const canStart = status === 'running';
  const canEnd = now >= new Date(event.starts_at).getTime() && now <= new Date(event.ends_at).getTime() + END_GRACE_MINUTES * 60_000;
  // The same window as rules.assertCanWarn; the server decides.
  const canWarn =
    status !== 'cancelled' &&
    now >= new Date(event.starts_at).getTime() &&
    now <= new Date(event.ends_at).getTime() + WARN_DAYS_AFTER_EVENT * 24 * 3_600_000;

  const open = (userId: string, mode: 'start' | 'end') =>
    router.push({ pathname: '/event/[id]/record', params: { id, userId, mode } });
  const warn = (userId: string) => router.push({ pathname: '/event/[id]/warn', params: { id, userId } });

  return (
    <Screen back title={s.roster.title}>
      <Txt variant="bodyStrong">{event.title}</Txt>
      {status === 'published' && (
        <Card style={styles.notice}>
          <Txt color={colors.inkMuted}>{s.roster.notRunning}</Txt>
        </Card>
      )}
      {participants.length === 0 && <EmptyState icon="people-outline" text={s.roster.empty} />}
      {participants.map(({ user: u, attendance: a, i_warned }) => {
        const state = !a ? 'notStarted' : a.ended_at ? 'done' : 'working';
        const self = u.id === me.id;
        return (
          <Card key={u.id}>
            <View style={styles.head}>
              <Avatar user={u} size={40} />
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
            {i_warned ? (
              <Txt variant="caption" color={colors.danger}>
                {u.gender === 'female' ? s.roster.warnedFemale : s.roster.warned}
              </Txt>
            ) : (
              !self && canWarn && <Button variant="quiet" icon="alert-circle-outline" label={s.roster.warn} onPress={() => warn(u.id)} />
            )}
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
