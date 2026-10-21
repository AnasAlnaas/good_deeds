import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { AppEvent } from '@/data/types';
import * as server from '@/demo/server';
import { dayTimeRange, fmt } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import { PillarBar } from './PillarBar';
import { Txt } from './Txt';
import { Badge, Card, Row } from './ui';

export function EventCard({ event }: { event: AppEvent }) {
  const { db, s, now } = useApp();
  const me = useMe();
  const status = server.effectiveStatus(event, now);
  const joinedCount = server.joinedUsers(db, event.id).length;
  const forMe = server.canUserJoinCategory(me, event);
  const mine = server.registrationOf(db, event.id, me.id)?.status === 'joined';

  return (
    <Card onPress={() => router.push(`/event/${event.id}`)} style={forMe ? undefined : styles.dim}>
      <Row>
        {status === 'running' && <Badge label={s.status.running} color={colors.danger} icon="radio-button-on" />}
        {mine && <Badge label={s.event.joined} color={colors.success} icon="checkmark-circle" />}
        {event.gender_category !== 'mixed' && <Badge label={s.category[event.gender_category]} color={colors.inkMuted} />}
      </Row>
      <Txt variant="sectionTitle">{event.title}</Txt>
      <View style={styles.meta}>
        <Ionicons name="time-outline" size={18} color={colors.inkMuted} />
        <Txt variant="caption" color={colors.inkMuted} style={styles.flex}>
          {dayTimeRange(event.starts_at, event.ends_at, s, now)}
        </Txt>
      </View>
      <View style={styles.meta}>
        <Ionicons name="location-outline" size={18} color={colors.inkMuted} />
        <Txt variant="caption" color={colors.inkMuted} style={styles.flex}>
          {event.address_text}
        </Txt>
      </View>
      <PillarBar values={server.eventPillarWeights(db, event.id)} />
      <Txt variant="caption" color={joinedCount >= event.capacity ? colors.danger : colors.inkMuted} tabular>
        {joinedCount >= event.capacity ? s.event.full : fmt(s.event.seats, { joined: joinedCount, capacity: event.capacity })}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
});
