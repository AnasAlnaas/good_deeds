// Finding on the map the place someone wrote for an event, so the location
// picker opens there instead of making them pan across the country. Used by
// the app's form (mobile/src/lib/geocode.ts) and the admin panel's.
//
// The event form asks for the city from the list first (shared/cities.ts),
// then the place in it. The place is looked up with OpenStreetMap's search
// (Nominatim) once the person stops typing; when it is not found in that
// city, the map opens on the city: the closest it gets.
//
// Nominatim's public server is fine for testing, like the public map tiles:
// before launch, point SEARCH_URL at the search of the map provider chosen
// then. Its usage policy allows one request a second and no search-as-you-type,
// which is why a lookup waits for a pause and remembers its answers. What is
// sent is the place, its city and the page's language.

import type { City } from './cities';

/** Where a map is pointed: a place, and how close. */
export interface MapTarget {
  lat: number;
  lng: number;
  zoom: number;
}

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 6000;
/** Nominatim's policy: at most one request a second. */
const SPACING_MS = 1100;
/** How many shorter forms of a place are tried when the whole of it finds nothing. */
const MAX_TRIES = 3;

/** How close the map opens on a city: the whole of it in view. */
export const CITY_ZOOM = 12;

export const cityTarget = (city: City): MapTarget => ({ lat: city.lat, lng: city.lng, zoom: CITY_ZOOM });

/** Farther than this from its city's centre, a place found is not the one meant (another city's street of that name). */
export const CITY_RADIUS_KM = 40;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** What a place's lookup asks: the place and its city, written in the same script. */
export function placeQuery(place: string, city: City) {
  return `${place}، ${/[؀-ۿ]/.test(place) ? city.ar : city.en}`;
}

interface Hit {
  lat: string;
  lon: string;
  /** [south, north, west, east] */
  boundingbox?: string[];
}

/** The closer the map, the smaller the thing found: a building at 17, a district at 14, a city at 12. */
function zoomFor(hit: Hit) {
  const [south, north, west, east] = (hit.boundingbox ?? []).map(Number);
  const span = Math.max(north - south, east - west);
  if (!Number.isFinite(span)) return 15;
  if (span > 0.6) return 10;
  if (span > 0.12) return CITY_ZOOM;
  if (span > 0.03) return 14;
  if (span > 0.006) return 16;
  return 17;
}

// A place is written from the place to its area ("حديقة الحي، الأندلس، طرابلس"):
// when the whole finds nothing, what is left after dropping its first part is
// the area around it, which is the closest the search can get.
function forms(text: string) {
  const parts = text
    .split(/[،,؛;\n]+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length && out.length < MAX_TRIES; i++) out.push(parts.slice(i).join(', '));
  return out;
}

const answers = new Map<string, MapTarget | null>();
let lastRequest = 0;

async function search(query: string, lang: 'ar' | 'en', headers: Record<string, string>): Promise<MapTarget | null | 'failed'> {
  const known = answers.get(query);
  if (known !== undefined) return known;
  const wait = lastRequest + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastRequest = Date.now();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const url = `${SEARCH_URL}?format=jsonv2&limit=1&countrycodes=ly&accept-language=${lang}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: stop.signal, headers: { Accept: 'application/json', ...headers } });
    if (!response.ok) return 'failed';
    const [hit] = (await response.json()) as Hit[];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    const found = hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, zoom: zoomFor(hit) } : null;
    answers.set(query, found);
    return found;
  } catch {
    // No internet, or no answer in time: not remembered, so it is asked again later.
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The place a text names, or the closest the search gets to it; null = not
 * found (or no internet). `headers`: a phone names the app (a browser names
 * the page itself and refuses a User-Agent set by the page).
 */
export async function findPlace(text: string, lang: 'ar' | 'en', headers: Record<string, string> = {}): Promise<MapTarget | null> {
  for (const query of forms(text)) {
    const found = await search(query, lang, headers);
    if (found === 'failed') return null;
    if (found) return found;
  }
  return null;
}

/**
 * Where the map shows a place in a city: at the place when it is found there
 * ('place'), else at the city ('city'), the closest it gets.
 */
export async function locateInCity(
  place: string,
  city: City,
  lang: 'ar' | 'en',
  headers: Record<string, string> = {},
): Promise<{ target: MapTarget; kind: 'place' | 'city' }> {
  const found = await findPlace(placeQuery(place, city), lang, headers);
  if (found && distanceKm(found, city) <= CITY_RADIUS_KM) return { target: found, kind: 'place' };
  return { target: cityTarget(city), kind: 'city' };
}
