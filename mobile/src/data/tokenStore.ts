import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The sign-in token works like a password, so on a phone it lives in the
// system keychain (iOS) or keystore (Android). The web build has no keychain
// and is for development only, so it uses browser storage there.
const KEY = 'gd.token';
const web = Platform.OS === 'web';

export async function getToken(): Promise<string | null> {
  try {
    return web ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string) {
  try {
    await (web ? AsyncStorage.setItem(KEY, token) : SecureStore.setItemAsync(KEY, token));
  } catch {
    // The session still works until the app is closed.
  }
}

export async function clearToken() {
  try {
    await (web ? AsyncStorage.removeItem(KEY) : SecureStore.deleteItemAsync(KEY));
  } catch {
    // Nothing stored.
  }
}
