import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { eventsPage, type MapPin } from './leaflet';

export type { MapPin } from './leaflet';

export interface OsmMapProps {
  center: { lat: number; lng: number; zoom: number };
  pins: MapPin[];
  /** Room left at the bottom for what floats over the map. */
  bottomInset: number;
  /** Changing it moves the map back to `center`. */
  recenter: number;
  onSelect(id: string): void;
  onClear(): void;
}

type Message = { type: 'ready' | 'select' | 'clear'; id?: string };

// OpenStreetMap through Leaflet in a web view (leaflet.ts): no API key, same
// look on Android and iOS.
export function OsmMap({ center, pins, bottomInset, recenter, onSelect, onClear }: OsmMapProps) {
  const ref = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  // The page is built once; later changes go in as pins only, so the map keeps its position.
  const [source] = useState(() => ({
    html: eventsPage(center, bottomInset, '(m) => window.ReactNativeWebView.postMessage(JSON.stringify(m))'),
    baseUrl: 'https://github.com/AnasAlnaas/good_deeds',
  }));

  useEffect(() => {
    if (loaded) ref.current?.injectJavaScript(`window.setPins(${JSON.stringify(pins)}); true;`);
  }, [loaded, pins]);

  useEffect(() => {
    if (loaded && recenter > 0) ref.current?.injectJavaScript('window.recenter(); true;');
  }, [loaded, recenter]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as Message;
    if (msg.type === 'ready') setLoaded(true);
    else if (msg.type === 'select' && msg.id) onSelect(msg.id);
    else if (msg.type === 'clear') onClear();
  };

  return (
    <WebView
      ref={ref}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={source}
      onMessage={onMessage}
      applicationNameForUserAgent="GoodDeedsApp/0.1"
      setSupportMultipleWindows={false}
      javaScriptEnabled
    />
  );
}
