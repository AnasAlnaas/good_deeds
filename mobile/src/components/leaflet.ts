// What the two maps share (OsmMap: the events; LocationPicker: an event's
// place): OpenStreetMap tiles drawn by Leaflet inside a web page. Each runs in a
// WebView on a phone and in an iframe in the web build (the .web.tsx files).
// Leaflet itself is inside the page (leaflet-lib.ts), so a map opens at once
// and without the internet; only the tiles come from the network.

import { StyleSheet } from 'react-native';

import { colors, radius } from '@/theme/tokens';
import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-lib';

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
<style>${LEAFLET_CSS}</style>
<script>${LEAFLET_JS}</script>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${colors.surfaceAlt}; }
  /* DESIGN.md: the map is context, the pins are content. */
  .leaflet-tile-pane { filter: saturate(0.4); }
  .leaflet-control-attribution { font: 11px sans-serif; border-radius: 8px 0 0 0; }
  ${extraCss}
</style></head><body><div id="map"></div><script>
  // crossOrigin: the tiles may be copied into a picture (the events map's snapshot).
  // keepBuffer: tiles just off screen are kept, so panning back shows them at once.
  const tiles = (map) => {
    map.attributionControl.setPrefix(false);
    return L.tileLayer('${TILE_URL}', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true, keepBuffer: 4 }).addTo(map);
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

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  dim: boolean;
  selected: boolean;
}

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

/**
 * A picture of the events map as it was last seen with every tile loaded, and
 * the area it shows ([south, west], [north, east]). Kept on the phone
 * (mapCache.ts) and laid under the tiles, so the map still shows its streets
 * where no tile can be loaded (no internet); also shown while the map starts.
 */
export interface MapSnapshot {
  url: string;
  bounds: [[number, number], [number, number]];
  view: MapView;
}

/** The events map's deep green look: grey streets, tinted toward the forest slate and darkened. */
const EVENTS_TILE_FILTER = 'grayscale(1) brightness(0.5) contrast(1.5) sepia(0.45) hue-rotate(95deg) saturate(1.3)';

/**
 * The events map: blue-grey streets, green pins. Only for seeing where events
 * are; directions open the phone's maps app (src/lib/directions.ts).
 * It opens at `start` (where it was left) over `snapshot`; `home` is where the
 * recenter button goes. `bottomInset` keeps the OpenStreetMap credit above what
 * floats at the bottom.
 * The page answers `window.setPins(pins)` and `window.recenter()`. It posts
 * `ready`; `shown` once the first tiles are drawn (or could not be loaded);
 * `view` after each move; `snapshot` once every tile of a view is in; and
 * `select` and `clear` for the pins.
 */
export function eventsPage(
  { home, start, snapshot }: { home: MapView; start: MapView; snapshot: MapSnapshot | null },
  bottomInset: number,
  post: string,
) {
  const underlay = snapshot
    ? `L.imageOverlay(${JSON.stringify(snapshot.url)}, ${JSON.stringify(snapshot.bounds)}, { pane: 'snapshot', interactive: false }).addTo(map);`
    : '';
  return leafletPage(
    `
  const post = ${post};
  const map = L.map('map', { zoomControl: false }).setView([${start.lat}, ${start.lng}], ${start.zoom});
  // The last picture of the map lies under the tiles: where a tile cannot load, it shows instead.
  map.createPane('snapshot').style.zIndex = 150;
  ${underlay}
  const tileLayer = tiles(map);
  const layer = L.layerGroup().addTo(map);
  map.on('click', () => post({ type: 'clear' }));
  window.recenter = () => map.flyTo([${home.lat}, ${home.lng}], ${home.zoom}, { duration: 0.6 });
  window.setPins = (pins) => {
    layer.clearLayers();
    // The chosen pin last, so it sits on top.
    for (const p of [...pins].sort((a, b) => a.selected - b.selected)) {
      const select = (e) => { L.DomEvent.stopPropagation(e); post({ type: 'select', id: p.id }); };
      // Invisible 48px hit area: the smallest touch target in DESIGN.md.
      L.circleMarker([p.lat, p.lng], { radius: 24, stroke: false, fillOpacity: 0 }).on('click', select).addTo(layer);
      L.circleMarker([p.lat, p.lng], {
        radius: p.selected ? 14 : 10, color: p.selected ? '${colors.primary}' : '${colors.surface}', weight: p.selected ? 4 : 2,
        fillColor: '${colors.accent}', fillOpacity: p.dim ? 0.45 : 1, opacity: p.dim ? 0.6 : 1,
      }).on('click', select).addTo(layer);
    }
    // The first pins fade in instead of popping up.
    if (pins.length) map.getContainer().classList.add('pins');
  };

  // The first tiles are drawn, or failed (no internet): the app can uncover the map.
  let shown = false;
  const show = () => { if (!shown) { shown = true; post({ type: 'shown' }); } };
  tileLayer.once('load', show);
  setTimeout(show, 2500);

  const viewNow = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng, zoom: map.getZoom() }; };
  let failed = 0;
  tileLayer.on('loading', () => { failed = 0; });
  tileLayer.on('tileerror', () => { failed += 1; });

  // A picture of what is on screen, drawn from the tiles themselves with the
  // same look, once every tile of the view has loaded. Not when one failed, so
  // a picture with holes never replaces a whole one.
  const snap = () => {
    if (tileLayer.isLoading() || failed) return;
    const size = map.getSize();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size.x * scale);
    canvas.height = Math.round(size.y * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx || !('filter' in ctx)) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = '${colors.slate}';
    ctx.fillRect(0, 0, size.x, size.y);
    ctx.filter = '${EVENTS_TILE_FILTER}';
    const box = map.getContainer().getBoundingClientRect();
    let drawn = 0;
    for (const img of document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded')) {
      const r = img.getBoundingClientRect();
      if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom) continue;
      if (getComputedStyle(img).opacity === '0') continue;
      ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height);
      drawn += 1;
    }
    if (!drawn) return;
    let url;
    try { url = canvas.toDataURL('image/jpeg', 0.72); } catch (e) { return; }
    const b = map.getBounds();
    post({ type: 'snapshot', snapshot: { url, bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], view: viewNow() } });
  };
  let timer = 0;
  const snapSoon = () => { clearTimeout(timer); timer = setTimeout(snap, 1200); };
  map.on('movestart', () => clearTimeout(timer));
  map.on('moveend', () => { post({ type: 'view', view: viewNow() }); snapSoon(); });
  tileLayer.on('load', snapSoon);
  post({ type: 'ready' });`,
    `
  .leaflet-tile-pane { filter: ${EVENTS_TILE_FILTER}; }
  html, body, #map { background: ${colors.slate}; }
  .leaflet-bottom { margin-bottom: ${bottomInset}px; }
  .leaflet-overlay-pane { opacity: 0; transition: opacity 0.35s ease-out; }
  .pins .leaflet-overlay-pane { opacity: 1; }`,
  );
}
