import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { type LatLng, pickerPage, pickerStyles } from './leaflet';

export type { LatLng } from './leaflet';

interface Props {
  value: LatLng;
  onChange(next: LatLng): void;
  /** True while a finger is on the map, so the screen can stop scrolling and let the map pan. */
  onTouching?(touching: boolean): void;
}

/** Choosing a place: the pin stays in the middle and the map moves under it. The web has its own file. */
export function LocationPicker({ value, onChange, onTouching }: Props) {
  // Built once from the first value; afterwards the map itself is the source of the position.
  const [source] = useState(() => ({
    html: pickerPage(value, '(m) => window.ReactNativeWebView.postMessage(JSON.stringify(m))'),
    baseUrl: 'https://github.com/AnasAlnaas/good_deeds',
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as LatLng;
    if (Number.isFinite(m.lat) && Number.isFinite(m.lng)) onChange({ lat: m.lat, lng: m.lng });
  };

  return (
    <View
      style={pickerStyles.frame}
      onTouchStart={() => onTouching?.(true)}
      onTouchEnd={() => onTouching?.(false)}
      onTouchCancel={() => onTouching?.(false)}>
      <WebView
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
