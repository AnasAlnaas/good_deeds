import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors } from '@/theme/tokens';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  dim: boolean;
  selected: boolean;
}

interface Props {
  center: { lat: number; lng: number; zoom: number };
  pins: MapPin[];
  onSelect(id: string): void;
  onClear(): void;
}

// OpenStreetMap through Leaflet in a web view: no API key, same look on
// Android and iOS. Public OSM tiles are fine for testing; before launch,
// switch TILE_URL to a tile provider (their usage policy forbids heavy app use).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function html(center: Props['center']) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH" crossorigin=""></script>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.surfaceAlt}; }
  /* DESIGN.md: the map is context, the pins are content. */
  .leaflet-tile-pane { filter: saturate(0.4); }
</style></head><body><div id="map"></div><script>
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const map = L.map('map', { zoomControl: false }).setView([${center.lat}, ${center.lng}], ${center.zoom});
  map.attributionControl.setPrefix(false);
  L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  map.on('click', () => post({ type: 'clear' }));
  window.setPins = (pins) => {
    layer.clearLayers();
    for (const p of pins) {
      const select = (e) => { L.DomEvent.stopPropagation(e); post({ type: 'select', id: p.id }); };
      // Invisible 48px hit area: the smallest touch target in DESIGN.md.
      L.circleMarker([p.lat, p.lng], { radius: 24, stroke: false, fillOpacity: 0 }).on('click', select).addTo(layer);
      // Pin in the dominant pillar's colour with a white halo.
      L.circleMarker([p.lat, p.lng], {
        radius: p.selected ? 15 : 11, color: '#FFFFFF', weight: p.selected ? 3 : 2,
        fillColor: p.color, fillOpacity: p.dim ? 0.4 : 1, opacity: p.dim ? 0.4 : 1,
      }).on('click', select).addTo(layer);
    }
  };
  post({ type: 'ready' });
</script></body></html>`;
}

export function OsmMap({ center, pins, onSelect, onClear }: Props) {
  const ref = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  // The page is built once; later changes go in as pins only, so the map keeps its position.
  const [source] = useState(() => ({ html: html(center), baseUrl: 'https://github.com/AnasAlnaas/good_deeds' }));

  useEffect(() => {
    if (loaded) ref.current?.injectJavaScript(`window.setPins(${JSON.stringify(pins)}); true;`);
  }, [loaded, pins]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data) as { type: 'ready' | 'select' | 'clear'; id?: string };
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
