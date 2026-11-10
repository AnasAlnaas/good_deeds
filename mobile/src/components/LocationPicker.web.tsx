// The web build (for trying the app in a browser): the same map page in an
// iframe, since react-native-webview has no web version.

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { type LatLng, type MovedBy, pickerPage, type PickerProps, pickerStyles } from './leaflet';

export type { LatLng, MapTarget, MovedBy } from './leaflet';

export function LocationPicker({ value, zoom, target, onChange }: PickerProps) {
  const [html] = useState(() => pickerPage(value, "(m) => window.parent.postMessage({ goodDeedsPicker: m }, '*')", zoom));
  const frame = useRef<HTMLIFrameElement>(null);
  // The map opens at the first target (it is the first value); only a later one is flown to.
  const opened = useRef(false);

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      // Only this picker's own page: a form shows one map at a time, but another may still be closing.
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data?.goodDeedsPicker as (LatLng & { by?: MovedBy }) | undefined;
      if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) onChange({ lat: m.lat, lng: m.lng }, m.by === 'app' ? 'app' : 'hand');
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [onChange]);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    if (target) frame.current?.contentWindow?.postMessage({ goodDeedsGoTo: target }, '*');
  }, [target]);

  return (
    <View style={pickerStyles.frame}>
      <iframe ref={frame} title="map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
