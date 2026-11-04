import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useOnline } from '@/data/network';
import { colors } from '@/theme/tokens';
import { eventsPage, type MapPin, type MapSnapshot, type MapView } from './leaflet';
import { readMapCache, saveMapSnapshot, saveMapView } from './mapCache';

export type { MapPin } from './leaflet';

export interface OsmMapProps {
  /** Where the recenter button goes; also where the map first opens on a new phone. */
  home: MapView;
  pins: MapPin[];
  /** Room left at the bottom for what floats over the map. */
  bottomInset: number;
  /** Changing it moves the map back to `home`. */
  recenter: number;
  onSelect(id: string): void;
  onClear(): void;
}

type Message =
  | { type: 'ready' | 'shown' | 'clear' }
  | { type: 'select'; id: string }
  | { type: 'view'; view: MapView }
  | { type: 'snapshot'; snapshot: MapSnapshot };

const FADE_MS = 260;

const sameView = (a: MapView, b: MapView) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6 && a.zoom === b.zoom;

// OpenStreetMap through Leaflet in a web view (leaflet.ts): no API key, same
// look on Android and iOS. It opens where it was left. Until its first tiles
// are drawn, the last picture of that view covers it (or the map's own colour
// on a first opening), then fades away, so the map never appears tile by tile.
// Without the internet, the tiles seen before come from the web view's cache,
// and the last picture lies under the tiles for the ones that cannot load.
export function OsmMap({ home, pins, bottomInset, recenter, onSelect, onClear }: OsmMapProps) {
  const ref = useRef<WebView>(null);
  const online = useOnline();
  const [loaded, setLoaded] = useState(false);
  // The page is built once; later changes go in as pins only, so the map keeps its position.
  const [{ source, cover }] = useState(() => {
    const { view, snapshot } = readMapCache();
    const start = view ?? home;
    return {
      source: {
        html: eventsPage({ home, start, snapshot }, bottomInset, '(m) => window.ReactNativeWebView.postMessage(JSON.stringify(m))'),
        baseUrl: 'https://github.com/AnasAlnaas/good_deeds',
      },
      // The picture covers the map only if it shows exactly where the map opens.
      cover: snapshot && sameView(snapshot.view, start) ? snapshot.url : null,
    };
  });
  const [covered, setCovered] = useState(true);
  const coverOpacity = useSharedValue(1);
  const coverStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.get() }));

  useEffect(() => {
    if (loaded) ref.current?.injectJavaScript(`window.setPins(${JSON.stringify(pins)}); true;`);
  }, [loaded, pins]);

  useEffect(() => {
    if (loaded && recenter > 0) ref.current?.injectJavaScript('window.recenter(); true;');
  }, [loaded, recenter]);

  const uncover = () => {
    coverOpacity.set(withTiming(0, { duration: FADE_MS }));
    setTimeout(() => setCovered(false), FADE_MS + 50);
  };
  // The page says when; this is in case it never does.
  useEffect(() => {
    const id = setTimeout(uncover, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as Message;
    if (msg.type === 'ready') setLoaded(true);
    else if (msg.type === 'shown') uncover();
    else if (msg.type === 'select') onSelect(msg.id);
    else if (msg.type === 'clear') onClear();
    else if (msg.type === 'view') saveMapView(msg.view);
    // Offline, a picture could only be worse than the one kept.
    else if (msg.type === 'snapshot' && online) saveMapSnapshot(msg.snapshot);
  };

  return (
    <View style={styles.root}>
      <WebView
        ref={ref}
        style={styles.web}
        originWhitelist={['*']}
        source={source}
        onMessage={onMessage}
        // Android: offline, tiles seen before are used however old they are.
        cacheMode={online ? 'LOAD_DEFAULT' : 'LOAD_CACHE_ELSE_NETWORK'}
        applicationNameForUserAgent="GoodDeedsApp/0.1"
        setSupportMultipleWindows={false}
        javaScriptEnabled
      />
      {covered && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.cover, coverStyle]} pointerEvents="none">
          {cover && <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0, backgroundColor: colors.slate },
  // The map's own colour from the first frame, never a white flash.
  web: { flex: 1, backgroundColor: colors.slate },
  cover: { backgroundColor: colors.slate },
});
