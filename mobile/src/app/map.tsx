import { Redirect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { EventCard } from '@/components/EventCard';
import { OsmMap, type MapPin } from '@/components/OsmMap';
import { Txt } from '@/components/Txt';
import { ClassFilter, IconButton, QueryState } from '@/components/ui';
import { useEvents, useMeSummary } from '@/data/queries';
import { useApp } from '@/state/app';
import { useNotificationTaps } from '@/state/useNotificationTaps';
import type { EventClassId } from '@/theme/classes';
import { colors, radius, shadow, space } from '@/theme/tokens';

const TRIPOLI = { lat: 32.868, lng: 13.18, zoom: 12 };
// The floating bar at the bottom: its height and its gap to the screen edge.
const NAV = 64;

// The app's one main screen. Everything else opens from the icons on it, as a
// full screen that comes back here.
export default function MapScreen() {
  const { s, me } = useApp();
  useNotificationTaps();
  const insets = useSafeAreaInsets();
  const query = useEvents();
  const canPropose = useMeSummary().data?.can_create_events ?? false;
  const [filter, setFilter] = useState<EventClassId | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const clear = useCallback(() => setSelected(null), []);

  const events = useMemo(
    () =>
      (query.data ?? []).filter((e) => {
        if (e.status !== 'published' && e.status !== 'running') return false;
        return !filter || e.event_class === filter;
      }),
    [query.data, filter],
  );
  const pins: MapPin[] = useMemo(
    () => events.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, dim: !e.can_join_category, selected: e.id === selected })),
    [events, selected],
  );

  if (!me) return <Redirect href="/login" />;
  const selectedEvent = events.find((e) => e.id === selected);
  const bottom = insets.bottom + space.md;

  return (
    <View style={styles.root}>
      <OsmMap
        center={TRIPOLI}
        pins={pins}
        bottomInset={bottom + NAV + space.sm}
        recenter={recenter}
        onSelect={setSelected}
        onClear={clear}
      />

      <View style={[styles.top, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={[styles.bar, shadow]}>
          <Pressable accessibilityRole="button" accessibilityLabel={s.map.profile} onPress={() => router.push('/profile')} hitSlop={4}>
            <Avatar user={me} size={48} />
          </Pressable>
          <View style={styles.titles}>
            <Txt variant="bodyStrong" align="center" numberOfLines={1}>
              {s.map.title}
            </Txt>
            <Txt variant="caption" color={colors.inkMuted} align="center" numberOfLines={1}>
              {me.city}
            </Txt>
          </View>
          <IconButton icon="search" label={s.map.search} look="dark" onPress={() => router.push({ pathname: '/events', params: { search: '1' } })} />
        </View>
        <View style={styles.filter}>
          <ClassFilter value={filter} onChange={(c) => { setFilter(c); setSelected(null); }} floating />
        </View>
        <View style={styles.side}>
          <IconButton icon="locate" label={s.map.recenter} lifted onPress={() => setRecenter((n) => n + 1)} />
        </View>
      </View>

      <View style={[styles.bottom, { bottom }]} pointerEvents="box-none">
        {selectedEvent ? (
          <EventCard event={selectedEvent} floating />
        ) : !query.data && query.isError ? (
          <View style={[styles.note, shadow]}>
            <QueryState query={query} />
          </View>
        ) : query.data && events.length === 0 ? (
          <View style={[styles.note, shadow]}>
            <Txt align="center" color={colors.inkMuted}>
              {filter ? s.map.emptyClass : s.map.empty}
            </Txt>
          </View>
        ) : null}

        <View style={[styles.nav, shadow]} accessibilityRole="toolbar" accessibilityLabel={s.map.nav}>
          <IconButton icon="map" label={s.tabs.map} look="dark" />
          <IconButton icon="list" label={s.map.events} look="light" onPress={() => router.push('/events')} />
          <IconButton icon="pulse" label={s.map.activity} look="light" onPress={() => router.push('/activity')} />
          {canPropose && <IconButton icon="add" label={s.map.propose} look="accent" onPress={() => router.push('/event/new')} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.slate },
  top: { position: 'absolute', start: 0, end: 0, gap: space.sm },
  bar: {
    marginHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  titles: { flex: 1 },
  filter: { flexDirection: 'row' },
  side: { alignItems: 'flex-end', paddingHorizontal: space.md },
  bottom: { position: 'absolute', start: space.md, end: space.md, gap: space.sm },
  note: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md },
  nav: {
    alignSelf: 'center',
    height: NAV,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
});
