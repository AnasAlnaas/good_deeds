import { Platform } from 'react-native';

import type { Lang } from '@/i18n/strings';
import type { City } from '../../../shared/cities';
import { locateInCity as locate } from '../../../shared/geocode';

// Finding on the map the place someone wrote for an event: shared/geocode.ts,
// which the admin panel's form uses too. A phone names the app to the map's
// search, as its usage policy asks; a browser names the page itself and
// refuses a User-Agent set by the page.

export { CITY_ZOOM, cityTarget } from '../../../shared/geocode';

const HEADERS: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': 'GoodDeedsApp/0.2 (github.com/AnasAlnaas/good_deeds)' };

/** The place in its city on the map, or the city when it is not found there. */
export const locateInCity = (place: string, city: City, lang: Lang) => locate(place, city, lang, HEADERS);
