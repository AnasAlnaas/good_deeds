import { Platform } from 'react-native';

import type { MapTarget } from '@/components/leaflet';
import type { Lang } from '@/i18n/strings';
import type { City } from '../../../shared/cities';

// Finding on the map the place someone wrote as an event's address, so the
// location picker opens there instead of making them pan across the country.
//
// Two sources. The app's own list of cities (shared/cities.ts) answers at once
// and without the internet, with the middle of the city. OpenStreetMap's search
// (Nominatim) is asked for the address itself, once the person stops typing.
//
// Nominatim's public server is fine for testing, like the public tiles
// (leaflet.ts TILE_URL): before launch, point SEARCH_URL at the search of the
// map provider chosen then. Its usage policy allows one request a second and no
// search-as-you-type, which is why a lookup waits for a pause and remembers
// its answers. What is sent is the address text and the app's language.

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 6000;
/** Nominatim's policy: at most one request a second. */
const SPACING_MS = 1100;
/** How many shorter forms of an address are tried when the whole of it finds nothing. */
const MAX_TRIES = 3;

/** How close the map opens on a city: the whole of it in view. */
export const CITY_ZOOM = 12;

export const cityTarget = (city: City): MapTarget => ({ lat: city.lat, lng: city.lng, zoom: CITY_ZOOM });

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

// An address is written from the place to the city ("حديقة الحي، الأندلس، طرابلس"):
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

async function search(query: string, lang: Lang): Promise<MapTarget | null | 'failed'> {
  const known = answers.get(query);
  if (known !== undefined) return known;
  const wait = lastRequest + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastRequest = Date.now();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const url = `${SEARCH_URL}?format=jsonv2&limit=1&countrycodes=ly&accept-language=${lang}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: stop.signal,
      // A browser names the page itself and refuses a User-Agent set by the page.
      headers: Platform.OS === 'web' ? { Accept: 'application/json' } : { Accept: 'application/json', 'User-Agent': 'GoodDeedsApp/0.2 (github.com/AnasAlnaas/good_deeds)' },
    });
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
 * The place an address names, or the closest the search gets to it; null = not
 * found (or no internet: the caller falls back to the city the address names).
 */
export async function findPlace(text: string, lang: Lang): Promise<MapTarget | null> {
  for (const query of forms(text)) {
    const found = await search(query, lang);
    if (found === 'failed') return null;
    if (found) return found;
  }
  return null;
}
