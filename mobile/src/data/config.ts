import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Where the server is.
// - EXPO_PUBLIC_API_URL wins: set it (in mobile/.env) for test and store builds.
// - In development without it, the app assumes the server runs on the same
//   computer as `npx expo start` (`npm run dev` in server/, port 3000), so a
//   phone on the same Wi-Fi finds it with no setup.
// - null: this build has no server, only the offline demo.
function resolveApiUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (!__DEV__) return null;
  const host =
    Constants.expoConfig?.hostUri?.split(':')[0] ??
    (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : null);
  return host ? `http://${host}:3000` : null;
}

export const API_URL = resolveApiUrl();

// The published privacy policy (docs/privacy-*.md). Settings links to it; unset = no link.
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || null;

// The offline demo (sample accounts, data only on the phone) is for
// development and for builds with no server. A build for real people, with a
// server, offers only the real sign-in, so nobody tests on sample data by
// mistake. EXPO_PUBLIC_DEMO=on brings the demo back in such a build.
export const DEMO_AVAILABLE = __DEV__ || !API_URL || process.env.EXPO_PUBLIC_DEMO === 'on';
