import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { LIBYAN_CITIES } from '../../../shared/cities';

export type Where = { lat: number; lng: number; from: 'phone' | 'city' };

/**
 * Where the person is, for "events near you" (owner's decisions, 2026-11-21):
 * the phone's location if they allow it (asked once), otherwise the centre of
 * the city on their profile. null while it is being found.
 */
export function useMyLocation(city: string): Where | null {
  const fallback = LIBYAN_CITIES.find((c) => c.ar === city) ?? LIBYAN_CITIES[0];
  const [where, setWhere] = useState<Where | null>(null);
  useEffect(() => {
    let live = true;
    const toCity = () => live && setWhere({ lat: fallback.lat, lng: fallback.lng, from: 'city' });
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return toCity();
        const known = await Location.getLastKnownPositionAsync();
        const pos = known ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (live) setWhere({ lat: pos.coords.latitude, lng: pos.coords.longitude, from: 'phone' });
      } catch {
        toCity();
      }
    })();
    return () => {
      live = false;
    };
  }, [fallback.lat, fallback.lng]);
  return where;
}
