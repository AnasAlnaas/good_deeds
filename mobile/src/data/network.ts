// Whether the phone is online, for the whole app. TanStack Query pauses its
// fetches while offline and runs them again when the connection comes back;
// the screens show what was saved on the phone meanwhile (queries.ts).

import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

// "Not reachable" is only believed once NetInfo has checked (null = not known yet).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
);

/** false while the phone has no connection. */
export function useOnline() {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}
