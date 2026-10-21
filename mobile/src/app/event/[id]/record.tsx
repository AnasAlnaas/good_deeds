import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Row } from '@/components/ui';
import * as server from '@/demo/server';
import { END_GRACE_MINUTES } from '@/demo/placeholders';
import { fmt, time } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space, touch } from '@/theme/tokens';

// Screens 15–16: record a participant's start or finish. The time defaults to
// now; backdating is offered only inside the allowed window. The demo server
// re-checks every rule, as the real server must.
export default function RecordScreen() {
  const { id, userId, mode } = useLocalSearchParams<{ id: string; userId: string; mode: 'start' | 'end' }>();
  const { db, s, now } = useApp();
  const me = useMe();
  const act = useAction();
  const [ack, setAck] = useState(mode === 'end');
  const [choice, setChoice] = useState(0);
  const [done, setDone] = useState(false);
  // Fixed when the screen opens, so the options don't shift while the supervisor reads them.
  const [openedAt] = useState(() => Date.now());

  const event = server.getEvent(db, id);
  const user = server.getUser(db, userId)!;
  const attendance = server.attendanceOf(db, id, userId);
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();

  const options = (() => {
    const all: { label: string; at: number | undefined }[] = [
      { label: s.record.now, at: undefined },
      { label: fmt(s.record.minutesAgo, { n: 15 }), at: openedAt - 15 * 60_000 },
      { label: fmt(s.record.minutesAgo, { n: 30 }), at: openedAt - 30 * 60_000 },
      { label: s.record.hourAgo, at: openedAt - 60 * 60_000 },
      mode === 'start' ? { label: s.record.atEventStart, at: starts } : { label: s.record.atEventEnd, at: ends },
    ];
    const min = mode === 'start' ? starts : new Date(attendance?.started_at ?? 0).getTime() + 60_000;
    const max = mode === 'start' ? openedAt : Math.min(openedAt, ends + END_GRACE_MINUTES * 60_000);
    return all.filter((o, i) => i === 0 || (o.at! >= min && o.at! <= max && o.at! < openedAt - 60_000));
  })();

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.back(), 900);
    return () => clearTimeout(timer);
  }, [done]);

  const chosen = options[Math.min(choice, options.length - 1)];

  const submit = () => {
    const ok = act((d, t) =>
      mode === 'start'
        ? server.recordStart(d, me.id, { eventId: id, userId, startedAt: chosen.at }, t)
        : server.recordEnd(d, me.id, { eventId: id, userId, endedAt: chosen.at }, t),
    );
    if (ok) setDone(true);
  };

  if (done) {
    return (
      <Screen scroll={false}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Txt variant="screenTitle" align="center">
            {mode === 'start' ? s.record.doneStart : s.record.doneEnd}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {user.full_name}
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={mode === 'start' ? s.record.startTitle : s.record.endTitle}
      footer={
        <Button
          icon={mode === 'start' ? 'play' : 'stop'}
          label={mode === 'start' ? s.record.submitStart : s.record.submitEnd}
          disabled={!ack}
          onPress={submit}
        />
      }>
      <Card>
        <Txt variant="sectionTitle">{user.full_name}</Txt>
        <Txt variant="caption" color={colors.inkMuted}>
          {event.title}
        </Txt>
      </Card>

      {mode === 'start' && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ack }}
          onPress={() => setAck(!ack)}
          style={styles.ack}>
          <Ionicons name={ack ? 'checkbox' : 'square-outline'} size={28} color={colors.primary} />
          <Txt variant="bodyStrong" style={styles.flex}>
            {fmt(user.gender === 'female' ? s.record.acknowledgeFemale : s.record.acknowledge, { name: user.full_name })}
          </Txt>
        </Pressable>
      )}

      <Txt variant="sectionTitle">{mode === 'start' ? s.record.whenStart : s.record.whenEnd}</Txt>
      <Row>
        {options.map((o, i) => (
          <Chip key={o.label} label={o.label} selected={chosen === o} onPress={() => setChoice(i)} />
        ))}
      </Row>
      <Txt variant="metric" tabular>
        {time(chosen.at ?? now, s)}
      </Txt>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.record.backdateRule}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ack: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch },
  flex: { flex: 1 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
