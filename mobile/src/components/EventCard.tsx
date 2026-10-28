import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { EventSummary } from '@/data/api';
import { dayTimeRange, fmt } from '@/i18n/format';
import { openDirections } from '@/lib/directions';
import { useApp } from '@/state/app';
import { classIcon, className } from '@/theme/classes';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { Txt } from './Txt';
import { Badge, Card, IconButton, Row } from './ui';

/**
 * An event in the list, and the chosen pin's card on the map (`floating`, with
 * a directions button).
 */
export function EventCard({ event, floating }: { event: EventSummary; floating?: boolean }) {
  const { s, now, lang } = useApp();
  const full = event.joined_count >= event.capacity;
  const badges =
    event.status === 'running' ||
    event.status === 'draft' ||
    event.status === 'rejected' ||
    event.status === 'cancelled' ||
    event.my_registration_status === 'joined' ||
    event.gender_category !== 'mixed';

  const card = (
    // Over the map the card stays solid; the men / women badge says why the event is not for this person.
    <Card
      onPress={() => router.push(`/event/${event.id}`)}
      style={[!event.can_join_category && !floating && styles.dim, floating && shadow]}>
      <View style={[styles.head, floating && styles.headRoom]}>
        <View style={styles.icon}>
          <Ionicons name={classIcon(event.event_class)} size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Txt variant="caption" color={colors.inkMuted}>
            {className(event.event_class, lang)}
          </Txt>
          <Txt variant="sectionTitle" numberOfLines={2}>
            {event.title}
          </Txt>
        </View>
      </View>
      <View style={styles.meta}>
        <Ionicons name="location" size={16} color={colors.inkMuted} />
        <Txt variant="caption" color={colors.inkMuted} style={styles.flex} numberOfLines={1}>
          {event.address_text}
        </Txt>
      </View>
      {badges && (
        <Row>
          {event.status === 'running' && <Badge label={s.status.running} color={colors.danger} icon="radio-button-on" />}
          {event.status === 'draft' && <Badge label={s.status.draft} color={colors.warning} icon="hourglass-outline" />}
          {(event.status === 'rejected' || event.status === 'cancelled') && <Badge label={s.status[event.status]} color={colors.inkMuted} />}
          {event.my_registration_status === 'joined' && <Badge label={s.event.joined} color={colors.success} icon="checkmark-circle" />}
          {event.gender_category !== 'mixed' && <Badge label={s.category[event.gender_category]} color={colors.inkMuted} />}
        </Row>
      )}
      <View style={styles.block}>
        <Txt variant="bodyStrong" color={colors.accentInk}>
          {dayTimeRange(event.starts_at, event.ends_at, s, now)}
        </Txt>
        <Txt variant="caption" color={full ? colors.danger : colors.accentInk} tabular>
          {full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
        </Txt>
      </View>
    </Card>
  );
  if (!floating) return card;
  // The directions button sits on the card, not in it: a button inside a button is not allowed.
  return (
    <View>
      {card}
      <View style={styles.directions}>
        <IconButton icon="navigate" label={s.event.directions} look="dark" onPress={() => openDirections(event)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.55 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headRoom: { paddingEnd: 48 + space.sm },
  directions: { position: 'absolute', top: space.md + space.xs, end: space.md + space.xs },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  block: {
    backgroundColor: colors.accent,
    borderRadius: radius.card - space.xs,
    padding: space.md,
    gap: space.xs,
  },
});
