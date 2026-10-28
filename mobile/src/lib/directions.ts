import { Linking, Platform } from 'react-native';

// The app's map only shows where events are. Getting there is the phone's own
// maps app: Apple Maps on an iPhone, Google Maps everywhere else (on Android the
// link opens the Google Maps app when it is installed, the website otherwise).
export function openDirections(place: { lat: number; lng: number; address_text: string }) {
  const to = `${place.lat},${place.lng}`;
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${to}&q=${encodeURIComponent(place.address_text)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
  return Linking.openURL(url);
}
