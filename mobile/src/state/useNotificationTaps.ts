import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { pushAvailable, screenFor } from '@/data/push';

// The last notification opened, so coming back to this screen does not open it again.
let opened: string | null = null;

/**
 * Tapping a notification opens what it is about (hours to confirm, a changed
 * event). Used by the signed-in tabs, which stay mounted under other screens.
 */
export function useNotificationTaps() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pushAvailable) return;
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (id === opened) return;
      opened = id;
      queryClient.invalidateQueries();
      const screen = screenFor(response.notification.request.content.data);
      if (screen) router.push(screen);
    };
    // The app was closed, and tapping a notification opened it.
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    // A notification while the app is open means what it is about has changed.
    const received = Notifications.addNotificationReceivedListener(() => queryClient.invalidateQueries());
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [queryClient]);
}
