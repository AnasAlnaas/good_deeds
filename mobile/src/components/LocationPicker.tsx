import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { type LatLng, type MovedBy, pickerPage, type PickerProps, pickerStyles } from './leaflet';

export type { LatLng, MapTarget, MovedBy } from './leaflet';

/** Choosing a place: the pin stays in the middle and the map moves under it. The web has its own file. */
export function LocationPicker({ value, zoom, target, onChange, onTouching }: PickerProps) {
  // Built once from the first value; afterwards the map itself is the source of the position.
  const [source] = useState(() => ({
    html: pickerPage(value, '(m) => window.ReactNativeWebView.postMessage(JSON.stringify(m))', zoom),
    baseUrl: 'https://github.com/AnasAlnaas/good_deeds',
  }));
  const web = useRef<WebView>(null);
  // The map opens at the first target (it is the first value); only a later one is flown to.
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    if (target) web.current?.injectJavaScript(`window.goTo && window.goTo(${target.lat}, ${target.lng}, ${target.zoom}); true;`);
  }, [target]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as LatLng & { by?: MovedBy };
    if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) onChange({ lat: m.lat, lng: m.lng }, m.by === 'app' ? 'app' : 'hand');
  };

  return (
    <View
      style={pickerStyles.frame}
      onTouchStart={() => onTouching?.(true)}
      onTouchEnd={() => onTouching?.(false)}
      onTouchCancel={() => onTouching?.(false)}>
      <WebView
        ref={web}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        source={source}
        onMessage={onMessage}
        applicationNameForUserAgent="GoodDeedsApp/0.1"
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        javaScriptEnabled
      />
    </View>
  );
}
