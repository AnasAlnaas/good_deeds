import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { EventSummary } from '@/data/api';
import { dayTimeRange, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import { PillarBar } from './PillarBar';
import { Txt } from './Txt';
import { Badge, Card, Row } from './ui';

export function EventCard({ event }: { event: EventSummary }) {
  const { s, now } = useApp();
  const full = event.joined_count >= event.capacity;

  return (
    <Card onPress={() => router.push(`/event/${event.id}`)} style={event.can_join_category ? undefined : styles.dim}>
      <Row>
        {event.status === 'running' && <Badge label={s.status.running} color={colors.danger} icon="radio-button-on" />}
        {event.status === 'draft' && <Badge label={s.status.draft} color={colors.warning} icon="hourglass-outline" />}
        {(event.status === 'rejected' || event.status === 'cancelled') && <Badge label={s.status[event.status]} color={colors.inkMuted} />}
        {event.my_registration_status === 'joined' && <Badge label={s.event.joined} color={colors.success} icon="checkmark-circle" />}
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
      <PillarBar values={event.pillar_weights} />
      <Txt variant="caption" color={full ? colors.danger : colors.inkMuted} tabular>
        {full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
});
