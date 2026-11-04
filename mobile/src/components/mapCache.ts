// What the events map keeps on the phone between openings: where it was left,
// and its last picture (leaflet.ts, MapSnapshot). Read at once when the map
// opens, so it can show the last picture straight away. Nothing in them is
// about the person: no pins, only streets.

import { File, Paths } from 'expo-file-system';

import type { MapSnapshot, MapView } from './leaflet';

const viewFile = () => new File(Paths.document, 'map-view.json');
const snapshotFile = () => new File(Paths.document, 'map-snapshot.json');

function read<T>(file: File): T | null {
  try {
    return file.exists ? (JSON.parse(file.textSync()) as T) : null;
  } catch {
    return null;
  }
}

function write(file: File, value: unknown) {
  try {
    if (!file.exists) file.create();
    file.write(JSON.stringify(value));
  } catch {
    // A full disk only means the map opens as if for the first time.
  }
}

export function readMapCache(): { view: MapView | null; snapshot: MapSnapshot | null } {
  return { view: read<MapView>(viewFile()), snapshot: read<MapSnapshot>(snapshotFile()) };
}

export const saveMapView = (view: MapView) => write(viewFile(), view);
export const saveMapSnapshot = (snapshot: MapSnapshot) => write(snapshotFile(), snapshot);
