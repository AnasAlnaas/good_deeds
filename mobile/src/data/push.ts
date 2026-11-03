// Push notifications on the phone. The server sends them through Expo's push
// service (server/src/notify.ts); this file gets the phone's address for them
// (its Expo push token) and says which screen a tapped notification opens.
// They reach only a real phone running a build of this app: not the web, not
// a simulator, and not Expo Go on Android.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Must match `defaultChannel` of the expo-notifications plugin in app.json. */
const CHANNEL_ID = 'default';

export const pushAvailable = Platform.OS !== 'web';

// A notification that arrives while the app is open still shows as a banner.
if (pushAvailable) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let currentToken: string | null = null;

/** The token this phone last registered, so signing out can remove it from the server. */
export const lastPushToken = () => currentToken;

/**
 * Asks permission (the system shows its prompt only while it is still allowed
 * to) and returns this phone's push token, or null when notifications are
 * refused or unavailable. Never throws: without a token the app works as before.
 */
export async function getPushToken(channelName: string): Promise<string | null> {
  if (!pushAvailable || !Device.isDevice) return null;
  try {
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!allowed) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = data;
    return data;
  } catch {
    // No network, or Expo Go on Android: the next launch tries again.
    return null;
  }
}

export function forgetPushToken() {
  currentToken = null;
}

/** The screen a tapped notification opens (the `data` the server puts in each one). */
export function screenFor(data: Record<string, unknown> | undefined): string | null {
  const str = (key: string) => (typeof data?.[key] === 'string' ? (data[key] as string) : null);
  switch (str('type')) {
    case 'confirm_hours':
    case 'dispute_settled':
      return str('attendance_id') ? `/attendance/${str('attendance_id')}` : null;
    case 'event_cancelled':
    case 'event_changed':
    case 'event_approved':
    case 'event_rejected':
      return str('event_id') ? `/event/${str('event_id')}` : null;
    case 'photo_removed':
      return '/profile';
    case 'warning_given':
    case 'warning_decided':
      return str('warning_id') ? `/warnings/${str('warning_id')}` : null;
    case 'report_handled':
      return '/reports';
    default:
      return null;
  }
}
