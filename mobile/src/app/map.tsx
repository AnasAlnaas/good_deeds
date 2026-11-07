import { Redirect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { EventCard } from '@/components/EventCard';
import { NAV_GAP, NAV_HEIGHT } from '@/components/NavIsland';
import { OsmMap, type MapPin } from '@/components/OsmMap';
import { Txt } from '@/components/Txt';
import { ClassFilter, IconButton, OfflineBanner, QueryState } from '@/components/ui';
import { useEvents, useKeepOwnDataReady, usePrefetchEvent } from '@/data/queries';
import { fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useNotificationTaps } from '@/state/useNotificationTaps';
import type { EventClassId } from '@/theme/classes';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { cityName } from '../../../shared/cities';

const TRIPOLI = { lat: 32.868, lng: 13.18, zoom: 12 };

// The app's home. The events list and activity open from the nav island
// (components/NavIsland.tsx, drawn over every main screen), everything else
// from the icons and cards here.
export default function MapScreen() {
  const { s, me, lang, isRTL } = useApp();
  useNotificationTaps();
  const insets = useSafeAreaInsets();
  const query = useEvents();
  const [filter, setFilter] = useState<EventClassId | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const clear = useCallback(() => setSelected(null), []);
  const prefetch = usePrefetchEvent();
  // The chosen pin's page is fetched while its card shows, so opening it is instant.
  const select = useCallback(
    (id: string) => {
      setSelected(id);
      prefetch(id);
    },
    [prefetch],
  );
  useKeepOwnDataReady(query.data);

  const events = useMemo(
    () =>
      (query.data ?? []).filter((e) => {
        if (e.status !== 'published' && e.status !== 'running') return false;
        return !filter || e.event_class === filter;
      }),
    [query.data, filter],
  );
  // Online events have no pin: the bar at the bottom counts them and opens them in the list.
  const pins: MapPin[] = useMemo(
    () =>
      events.flatMap((e) =>
        e.lat === null || e.lng === null ? [] : [{ id: e.id, lat: e.lat, lng: e.lng, dim: !e.can_join_category, selected: e.id === selected }],
      ),
    [events, selected],
  );
  const onlineCount = events.length - pins.length;

  if (!me) return <Redirect href="/login" />;
  const selectedEvent = events.find((e) => e.id === selected);
  const bottom = insets.bottom + NAV_GAP;

  return (
    <View style={styles.root}>
      <OsmMap
        home={TRIPOLI}
        pins={pins}
        bottomInset={bottom + NAV_HEIGHT + space.sm}
        recenter={recenter}
        onSelect={select}
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
              {cityName(me.city, lang)}
            </Txt>
          </View>
          <IconButton icon="search" label={s.map.search} look="dark" onPress={() => router.push({ pathname: '/events', params: { search: '1' } })} />
        </View>
        <View style={styles.banner}>
          <OfflineBanner floating />
        </View>
        <View style={styles.filter}>
          <ClassFilter value={filter} onChange={(c) => { setFilter(c); setSelected(null); }} floating />
        </View>
        <View style={styles.side}>
          <IconButton icon="locate" label={s.map.recenter} lifted onPress={() => setRecenter((n) => n + 1)} />
        </View>
      </View>

      <View style={[styles.bottom, { bottom }]} pointerEvents="box-none">
        {/* The chosen pin's card rises in, and sinks away when the map is tapped. */}
        {selectedEvent ? (
          <Animated.View key={selectedEvent.id} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(160)}>
            <EventCard event={selectedEvent} floating />
          </Animated.View>
        ) : !query.data && (query.isError || query.fetchStatus === 'paused') ? (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.note, shadow]}>
            <QueryState query={query} />
          </Animated.View>
        ) : onlineCount > 0 ? (
          <Animated.View key={`online-${filter ?? 'all'}`} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${fmt(s.map.onlineBar, { n: onlineCount })}. ${s.map.onlineBarHint}`}
              onPress={() => router.push({ pathname: '/events', params: { where: 'online' } })}
              style={({ pressed }) => [styles.online, shadow, pressed && styles.pressed]}>
              <Ionicons name="videocam" size={20} color={colors.primary} />
              <Txt variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                {fmt(s.map.onlineBar, { n: onlineCount })}
              </Txt>
              <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.inkMuted} />
            </Pressable>
          </Animated.View>
        ) : query.data && events.length === 0 ? (
          <Animated.View key={filter ?? 'all'} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={[styles.note, shadow]}>
            <Txt align="center" color={colors.inkMuted}>
              {filter ? s.map.emptyClass : s.map.empty}
            </Txt>
          </Animated.View>
        ) : null}

        {/* The nav island floats here, drawn over the whole stack. */}
        <View style={styles.navSpace} />
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
  banner: { marginHorizontal: space.md },
  filter: { flexDirection: 'row' },
  side: { alignItems: 'flex-end', paddingHorizontal: space.md },
  bottom: { position: 'absolute', start: space.md, end: space.md, gap: space.sm },
  note: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  pressed: { opacity: 0.8 },
  flex: { flex: 1 },
  navSpace: { height: NAV_HEIGHT },
});
