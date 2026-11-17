import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { EventSummary } from '@/data/api';
import { usePrefetchEvent } from '@/data/queries';
import { day, fmt, time } from '@/i18n/format';
import { openDirections } from '@/lib/directions';
import { placeLabel, withZone } from '@/lib/place';
import { useApp } from '@/state/app';
import { classIcon, className } from '@/theme/classes';
import { cardShadow, colors, radius, shadow, space } from '@/theme/tokens';
import { EventCover } from './EventCover';
import { Txt } from './Txt';
import { Badge, IconButton, Row } from './ui';

/**
 * An event in the list, and the chosen pin's card on the map (`floating`, with
 * a directions button). Design ج (owner's decision, 2026-11-17): its cover on
 * top (the proposer's photo, or one drawn from its class) with the title and
 * the day over it; what, where and when below.
 */
export function EventCard({ event, floating }: { event: EventSummary; floating?: boolean }) {
  const { s, now, lang } = useApp();
  const prefetch = usePrefetchEvent();
  const full = event.joined_count >= event.capacity;
  const online = event.location_type === 'online';
  const badges =
    event.status === 'running' ||
    event.status === 'draft' ||
    event.status === 'rejected' ||
    event.status === 'cancelled' ||
    event.my_registration_status === 'joined' ||
    event.gender_category !== 'mixed';

  const card = (
    // Over the map the card stays solid; the men / women badge says why the event is not for this person.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => router.push(`/event/${event.id}`)}
      onPressIn={() => prefetch(event.id)}
      style={({ pressed }) => [styles.card, floating ? shadow : cardShadow, !event.can_join_category && !floating && styles.dim, pressed && styles.pressed]}>
      <EventCover cover={event.cover} eventClass={event.event_class} height={floating ? 104 : 140} title={event.title} date={day(event.starts_at, s, now)} rounded />
      <View style={styles.body}>
        {event.institution && (
          <View style={styles.meta}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Txt variant="caption" color={colors.primary} style={styles.flex} numberOfLines={1}>
              {fmt(s.institutions.organizedBy, { name: event.institution.name })}
            </Txt>
          </View>
        )}
        <View style={styles.meta}>
          <Ionicons name={classIcon(event.event_class)} size={16} color={colors.inkMuted} />
          <Txt variant="caption" color={colors.inkMuted} style={styles.flex} numberOfLines={1}>
            {className(event.event_class, lang)} · {withZone(`${time(event.starts_at, s)} – ${time(event.ends_at, s)}`, event, s)}
          </Txt>
        </View>
        <View style={styles.meta}>
          <Ionicons name={online ? 'videocam' : 'location'} size={16} color={colors.inkMuted} />
          <Txt variant="caption" color={colors.inkMuted} style={styles.flex} numberOfLines={1}>
            {placeLabel(event, s)}
          </Txt>
          <Txt variant="caption" color={full ? colors.danger : colors.inkMuted} tabular>
            {full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
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
      </View>
    </Pressable>
  );
  // Only an event in a place has a pin on the map, and so directions.
  if (!floating || online) return card;
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.92 },
  dim: { opacity: 0.55 },
  body: { padding: space.md, gap: space.xs + 2 },
  directions: { position: 'absolute', top: space.sm, end: space.sm },
  flex: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
