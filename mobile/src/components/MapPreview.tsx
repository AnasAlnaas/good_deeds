import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, radius } from '@/theme/tokens';
import { TILE_URL } from './leaflet';

const TILE = 256;

/** A point's place on the world map, in pixels at `zoom` (Web Mercator, as the map's tiles). */
function worldPx(lat: number, lng: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

export interface PreviewPin {
  lat: number;
  lng: number;
  /** What the pin shows, matching the list under the map (1, 2, 3…). */
  label: string;
}

/**
 * A still picture of the map around a point, with numbered pins and the
 * person's place (owner's decision, 2026-11-21: "events near you" shows a map
 * preview and the few events in range). Tapping it opens the full map. Made of
 * the same tiles as the map; nothing to load but the pictures.
 */
export function MapPreview({
  center,
  pins,
  zoom: fixedZoom,
  height = 170,
  showCenter,
  onPress,
  label,
}: {
  center: { lat: number; lng: number };
  pins: PreviewPin[];
  /** Absent: as close as every pin (and the centre) fits, between 11 and 15. */
  zoom?: number;
  height?: number;
  /** Mark the centre as "you" (the phone's location). */
  showCenter?: boolean;
  onPress: () => void;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const fits = (z: number) => {
    const m = worldPx(center.lat, center.lng, z);
    return pins.every((p) => {
      const w = worldPx(p.lat, p.lng, z);
      return Math.abs(w.x - m.x) <= width / 2 - 20 && Math.abs(w.y - m.y) <= height / 2 - 20;
    });
  };
  const zoom = fixedZoom ?? ([15, 14, 13, 12].find((z) => width > 0 && fits(z)) ?? 11);
  const c = worldPx(center.lat, center.lng, zoom);
  // The picture's top-left corner on the world map.
  const left = c.x - width / 2;
  const top = c.y - height / 2;
  const tiles: { x: number; y: number }[] = [];
  if (width > 0) {
    const max = 2 ** zoom;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty });
      }
    }
  }
  const url = (x: number, y: number) =>
    TILE_URL.replace('{z}', String(zoom))
      .replace('{x}', String(((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom))
      .replace('{y}', String(y));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.box, { height }]}>
      {tiles.map((t) => (
        <Image
          key={`${t.x}-${t.y}`}
          source={{ uri: url(t.x, t.y) }}
          style={{ position: 'absolute', width: TILE, height: TILE, left: t.x * TILE - left, top: t.y * TILE - top }}
          cachePolicy="disk"
        />
      ))}
      {width > 0 &&
        pins.map((p) => {
          const w = worldPx(p.lat, p.lng, zoom);
          const x = w.x - left;
          const y = w.y - top;
          if (x < 0 || x > width || y < 0 || y > height) return null;
          return (
            <View key={p.label} style={[styles.pin, { left: x - 13, top: y - 13 }]}>
              <Txt variant="caption" color={colors.surface} tabular>
                {p.label}
              </Txt>
            </View>
          );
        })}
      {showCenter && width > 0 && <View style={[styles.me, { left: width / 2 - 8, top: height / 2 - 8 }]} />}
      <View style={styles.credit}>
        <Txt variant="caption" color={colors.inkMuted} style={styles.creditText}>
          © OpenStreetMap
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: radius.card, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  pin: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  me: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.link, borderWidth: 3, borderColor: colors.surface },
  credit: { position: 'absolute', bottom: 0, left: 0, backgroundColor: colors.surface, paddingHorizontal: 4, borderTopRightRadius: 6 },
  creditText: { fontSize: 10 },
});
