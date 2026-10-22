// What the screens read, cached by TanStack Query. In demo mode the answers
// come instantly from the phone; in server mode they show a loading state
// first. useAction refreshes them after every change.

import { QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useApp } from '@/state/app';
import { errorCode } from './backend';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Only a lost connection is worth retrying; a refusal stays a refusal.
      retry: (failures, error) => errorCode(error) === 'network' && failures < 2,
    },
  },
});

function useBackendQuery<T>(key: unknown[], fetch: (b: NonNullable<ReturnType<typeof useApp>['backend']>) => Promise<T>) {
  const { backend, sessionKey } = useApp();
  return useQuery({
    queryKey: [sessionKey, ...key],
    queryFn: () => fetch(backend!),
    enabled: !!backend,
  });
}

export const useEvents = () => useBackendQuery(['events'], (b) => b.listEvents());
export const useEvent = (id: string) => useBackendQuery(['event', id], (b) => b.event(id));
export const useEventForm = () => useBackendQuery(['eventForm'], (b) => b.eventForm());
export const useRoster = (eventId: string) => useBackendQuery(['roster', eventId], (b) => b.roster(eventId));
export const useMyAttendance = () => useBackendQuery(['myAttendance'], (b) => b.myAttendance());
export const useAttendance = (id: string) => useBackendQuery(['attendance', id], (b) => b.attendance(id));

/** Points, level and hours. Also keeps the stored profile current in server mode. */
export function useMeSummary() {
  const { updateApiUser, mode } = useApp();
  const query = useBackendQuery(['me'], (b) => b.me());
  const user = query.data?.user;
  useEffect(() => {
    if (user && mode === 'api') updateApiUser(user);
  }, [user, mode, updateApiUser]);
  return query;
}
