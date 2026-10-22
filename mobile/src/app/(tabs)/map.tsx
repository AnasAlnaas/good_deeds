import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/EventCard';
import { OsmMap, type MapPin } from '@/components/OsmMap';
import { Txt } from '@/components/Txt';
import { Chip, QueryState } from '@/components/ui';
import { useEvents } from '@/data/queries';
import type { Pillar } from '@/data/types';
import { PILLARS } from '@/data/types';
import { useApp } from '@/state/app';
import { colors, pillarColor, radius, space } from '@/theme/tokens';

const TRIPOLI = { lat: 32.868, lng: 13.18, zoom: 12 };

export default function MapScreen() {
  const { s } = useApp();
  const insets = useSafeAreaInsets();
  const query = useEvents();
  const [filter, setFilter] = useState<Pillar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const events = useMemo(
    () =>
      (query.data ?? []).filter((e) => {
        if (e.status !== 'published' && e.status !== 'running') return false;
        return !filter || e.pillar_weights[filter] > 0;
      }),
    [query.data, filter],
  );
  const selectedEvent = events.find((e) => e.id === selected);
  const pins: MapPin[] = events.map((e) => ({
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    color: pillarColor[e.dominant_pillar],
    dim: !e.can_join_category,
    selected: e.id === selected,
  }));

  return (
    <View style={styles.root}>
      <OsmMap center={TRIPOLI} pins={pins} onSelect={setSelected} onClear={() => setSelected(null)} />

      <View style={[styles.filters, { top: insets.top + space.sm }]}>
        <Chip label={s.map.all} selected={!filter} onPress={() => setFilter(null)} />
        {PILLARS.map((p) => (
          <Chip key={p} label={s.pillar[p]} dotColor={pillarColor[p]} selected={filter === p} onPress={() => setFilter(p)} />
        ))}
      </View>

      {!query.data && query.isError && (
        <View style={styles.bottom}>
          <View style={styles.emptyCard}>
            <QueryState query={query} />
          </View>
        </View>
      )}

      {query.data && events.length === 0 && (
        <View style={styles.bottom}>
          <View style={styles.emptyCard}>
            <Txt align="center" color={colors.inkMuted}>
              {s.map.empty}
            </Txt>
          </View>
        </View>
      )}

      {selectedEvent && (
        <View style={styles.bottom}>
          <EventCard event={selectedEvent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filters: {
    position: 'absolute',
    start: space.md,
    end: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  bottom: { position: 'absolute', start: space.md, end: space.md, bottom: space.md },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
});
