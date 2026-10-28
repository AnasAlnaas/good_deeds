// The web build (for trying the app in a browser): the same map page in an
// iframe, since react-native-webview has no web version.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { eventsPage } from './leaflet';
import type { OsmMapProps } from './OsmMap';

export type { MapPin } from './leaflet';

type MapWindow = Window & { setPins?(pins: unknown): void; recenter?(): void };

export function OsmMap({ center, pins, bottomInset, recenter, onSelect, onClear }: OsmMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [html] = useState(() => eventsPage(center, bottomInset, "(m) => window.parent.postMessage({ goodDeedsMap: m }, '*')"));
  const page = () => frame.current?.contentWindow as MapWindow | null | undefined;

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      const m = e.data?.goodDeedsMap as { type: string; id?: string } | undefined;
      if (!m) return;
      if (m.type === 'ready') setLoaded(true);
      else if (m.type === 'select' && m.id) onSelect(m.id);
      else if (m.type === 'clear') onClear();
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [onSelect, onClear]);

  useEffect(() => {
    if (loaded) page()?.setPins?.(pins);
  }, [loaded, pins]);

  useEffect(() => {
    if (loaded && recenter > 0) page()?.recenter?.();
  }, [loaded, recenter]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <iframe ref={frame} title="map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
