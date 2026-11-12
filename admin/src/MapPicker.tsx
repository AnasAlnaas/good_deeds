import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import type { MapTarget } from '../../shared/geocode';

// The event form's map, as the app's location picker (mobile/src/components/
// leaflet.ts): the pin stays in the middle and the map moves under it, so
// where the pin stands is the middle of the map. The form points the map at
// each place it finds (`target`); dragging it moves the pin by hand.

// Public OSM tiles are fine for testing, as in the app; before launch, the map provider chosen then.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export type MovedBy = 'form' | 'hand';

export function MapPicker({
  value,
  target,
  onChange,
  label,
}: {
  /** Where the pin is when the map opens. */
  value: { lat: number; lng: number };
  /** The last place the form pointed at: a new one flies the map there. */
  target: MapTarget | null;
  onChange: (p: { lat: number; lng: number }, by: MovedBy) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  // While the map flies to a place the form found, its moves are the form's, not a hand's.
  const byForm = useRef(false);
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([value.lat, value.lng], 16);
    m.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    // A drag is a hand's, even if it starts before a flight's end was reported.
    m.on('dragstart', () => {
      byForm.current = false;
    });
    m.on('moveend', () => {
      const c = m.getCenter();
      report.current({ lat: c.lat, lng: c.lng }, byForm.current ? 'form' : 'hand');
      byForm.current = false;
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is made once; later places come through `target`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !target) return;
    byForm.current = true;
    m.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [target]);

  return (
    <div className="map-picker" role="application" aria-label={label}>
      <div ref={box} className="map-picker-map" />
      <div className="map-picker-pin" aria-hidden />
    </div>
  );
}
