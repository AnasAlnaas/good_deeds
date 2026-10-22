// What the two maps share (OsmMap: the events; LocationPicker: an event's
// place): OpenStreetMap tiles drawn by Leaflet inside a web page.

import { StyleSheet } from 'react-native';

import { colors, radius } from '@/theme/tokens';

export interface LatLng {
  lat: number;
  lng: number;
}

/** The location picker's frame (LocationPicker.tsx and its web version). */
export const pickerStyles = StyleSheet.create({
  frame: {
    height: 260,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
});

// Public OSM tiles are fine for testing; before launch, switch TILE_URL to a
// tile provider (their usage policy forbids heavy app use).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** A page with a full-size Leaflet map in `#map`. `script` runs after Leaflet has loaded. */
export function leafletPage(script: string, extraCss = '') {
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
  ${extraCss}
</style></head><body><div id="map"></div><script>
  const tiles = (map) => {
    map.attributionControl.setPrefix(false);
    L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  };
  ${script}
</script></body></html>`;
}

/**
 * The location picker's page: the pin stays in the middle and the map moves
 * under it; a tap moves the map to the tapped point. `post` sends a message out
 * of the page (the WebView's bridge on a phone, the parent window on the web).
 */
export function pickerPage(center: { lat: number; lng: number }, post: string) {
  return leafletPage(
    `
  const post = ${post};
  const map = L.map('map', { zoomControl: true }).setView([${center.lat}, ${center.lng}], 16);
  tiles(map);
  map.on('click', (e) => map.panTo(e.latlng));
  map.on('moveend', () => { const c = map.getCenter(); post({ lat: c.lat, lng: c.lng }); });`,
    `
  /* The pin: its point is the middle of the map. */
  #pin { position: absolute; left: 50%; top: 50%; z-index: 1000; pointer-events: none;
         width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
         background: ${colors.primary}; border: 3px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  #pin::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px;
                margin: -2px 0 0 -2px; border-radius: 50%; background: #FFFFFF; }`,
  ).replace('<div id="map"></div>', '<div id="map"></div><div id="pin"></div>');
}
