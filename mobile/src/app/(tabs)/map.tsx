import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/EventCard';
import { Txt } from '@/components/Txt';
import { Chip } from '@/components/ui';
import type { Pillar } from '@/data/types';
import { PILLARS } from '@/data/types';
import * as server from '@/demo/server';
import { useApp, useMe } from '@/state/app';
import { colors, pillarColor, radius, space } from '@/theme/tokens';

const TRIPOLI = { latitude: 32.868, longitude: 13.18, latitudeDelta: 0.22, longitudeDelta: 0.22 };

// DESIGN.md: the map is context, the pins are content — desaturate the map.
// (Google Maps on Android only; Apple Maps on iOS ignores custom styles.)
const MAP_STYLE = [{ stylers: [{ saturation: -60 }] }];

export default function MapScreen() {
  const { db, s, now } = useApp();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Pillar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const events = useMemo(
    () =>
      db.events.filter((e) => {
        const st = server.effectiveStatus(e, now);
        if (st !== 'published' && st !== 'running') return false;
        return !filter || server.eventPillarWeights(db, e.id)[filter] > 0;
      }),
    [db, now, filter],
  );
  const selectedEvent = events.find((e) => e.id === selected);

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={TRIPOLI}
        customMapStyle={MAP_STYLE}
        onPress={() => setSelected(null)}
        toolbarEnabled={false}>
        {events.map((e) => {
          const forMe = server.canUserJoinCategory(me, e);
          return (
            <Marker
              key={e.id}
              coordinate={{ latitude: e.lat, longitude: e.lng }}
              onPress={(ev) => {
                ev.stopPropagation();
                setSelected(e.id);
              }}>
              <View
                style={[
                  styles.pin,
                  { backgroundColor: pillarColor[server.dominantPillar(db, e.id)], opacity: forMe ? 1 : 0.4 },
                  selected === e.id && styles.pinSelected,
                ]}
              />
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.filters, { top: insets.top + space.sm }]}>
        <Chip label={s.map.all} selected={!filter} onPress={() => setFilter(null)} />
        {PILLARS.map((p) => (
          <Chip key={p} label={s.pillar[p]} dotColor={pillarColor[p]} selected={filter === p} onPress={() => setFilter(p)} />
        ))}
      </View>

      {events.length === 0 && (
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
  // Pin in the dominant pillar's colour with a 2px white halo (DESIGN.md).
  pin: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.surface },
  pinSelected: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
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
