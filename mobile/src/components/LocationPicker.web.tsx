// The web build (for trying the app in a browser): the same map page in an
// iframe, since react-native-webview has no web version.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { type LatLng, pickerPage, pickerStyles } from './leaflet';

export type { LatLng } from './leaflet';

export function LocationPicker({ value, onChange }: { value: LatLng; onChange(next: LatLng): void; onTouching?(touching: boolean): void }) {
  const [html] = useState(() => pickerPage(value, "(m) => window.parent.postMessage({ goodDeedsPicker: m }, '*')"));

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      const m = e.data?.goodDeedsPicker as LatLng | undefined;
      if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) onChange({ lat: m.lat, lng: m.lng });
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [onChange]);

  return (
    <View style={pickerStyles.frame}>
      <iframe title="map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
