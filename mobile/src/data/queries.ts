// What the screens read, cached by TanStack Query. In demo mode the answers
// come instantly from the phone. In server mode the last answers are also saved
// on the phone, so a screen opens at once with what it showed last time (even
// with no internet) and is brought up to date in the background.
// useAction refreshes them after every change.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { useCallback, useEffect } from 'react';

import { useApp } from '@/state/app';
import type { EventDetail, EventSummary } from './api';
import type { Backend } from './backend';
import { errorCode } from './backend';
import './network';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Kept as long as they are saved on the phone, so going back to a screen never starts empty.
      gcTime: WEEK,
      // Try once even when the phone says it is offline (it can be wrong); retries wait for the connection.
      networkMode: 'offlineFirst',
      // Only a lost connection is worth retrying; a refusal stays a refusal.
      retry: (failures, error) => errorCode(error) === 'network' && failures < 2,
    },
  },
});

/**
 * How the cache is saved on the phone. Only server answers (the demo's data is
 * on the phone already), and only answers, not errors. Signing out clears the
 * cache, and with it what is saved. `buster`: change it when the shapes in
 * shared/api.ts change, so an older saved copy is dropped instead of misread.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage, key: 'gd.queries', throttleTime: 1000 }),
  maxAge: WEEK,
  buster: '1',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) => q.state.status === 'success' && String(q.queryKey[0]).startsWith('api:'),
  },
};

type Fetch<T> = (b: Backend) => Promise<T>;

function useBackendQuery<T>(key: unknown[], fetch: Fetch<T>) {
  const { backend, sessionKey } = useApp();
  return useQuery({
    queryKey: [sessionKey, ...key],
    queryFn: () => fetch(backend!),
    enabled: !!backend,
  });
}

const KEYS = {
  events: () => ['events'],
  event: (id: string) => ['event', id],
  roster: (id: string) => ['roster', id],
  me: () => ['me'],
  myAttendance: () => ['myAttendance'],
  myReports: () => ['myReports'],
  myWarnings: () => ['myWarnings'],
};

export const useEvents = () => useBackendQuery(KEYS.events(), (b) => b.listEvents());
export const useEvent = (id: string) => useBackendQuery(KEYS.event(id), (b) => b.event(id));
export const useEventForm = () => useBackendQuery(['eventForm'], (b) => b.eventForm());
export const useRoster = (eventId: string) => useBackendQuery(KEYS.roster(eventId), (b) => b.roster(eventId));
export const useMyAttendance = () => useBackendQuery(KEYS.myAttendance(), (b) => b.myAttendance());
export const useAttendance = (id: string) => useBackendQuery(['attendance', id], (b) => b.attendance(id));
export const useReportForm = () => useBackendQuery(['reportForm'], (b) => b.reportForm());
export const useMyReports = () => useBackendQuery(KEYS.myReports(), (b) => b.myReports());
export const useMyWarnings = () => useBackendQuery(KEYS.myWarnings(), (b) => b.myWarnings());
export const useWarning = (id: string) => useBackendQuery(['warning', id], (b) => b.warning(id));

/** Points, level and hours. Also keeps the stored profile current in server mode. */
export function useMeSummary() {
  const { updateApiUser, mode } = useApp();
  const query = useBackendQuery(KEYS.me(), (b) => b.me());
  const user = query.data?.user;
  useEffect(() => {
    if (user && mode === 'api') updateApiUser(user);
  }, [user, mode, updateApiUser]);
  return query;
}

/**
 * Changes the event's page on screen before the server answers (a reaction
 * shows the moment it is tapped). The fetch that follows the change puts the
 * server's version back, so a refused change undoes itself.
 */
export function useUpdateEvent(id: string) {
  const { sessionKey } = useApp();
  const client = useQueryClient();
  return useCallback(
    (update: (event: EventDetail) => EventDetail) => {
      const queryKey = [sessionKey, ...KEYS.event(id)];
      // A fetch already on its way would bring back the page from before the change.
      client.cancelQueries({ queryKey });
      client.setQueryData<EventDetail>(queryKey, (old) => old && update(old));
    },
    [sessionKey, id, client],
  );
}

/**
 * Fetches an event's page ahead (when its pin is chosen, or a finger touches
 * its card), so opening it shows it at once. Does nothing if it is fresh.
 */
export function usePrefetchEvent() {
  const { backend, sessionKey } = useApp();
  const client = useQueryClient();
  return useCallback(
    (id: string) => {
      if (backend) client.prefetchQuery({ queryKey: [sessionKey, ...KEYS.event(id)], queryFn: () => backend.event(id) });
    },
    [backend, sessionKey, client],
  );
}

// How many of the person's own events are fetched ahead: the next ones first.
const OWN_EVENTS_AHEAD = 12;
// A supervisor's roster is fetched ahead from a day before the event until it
// ends, so attendance can be recorded there with no connection.
const ROSTER_AHEAD_MS = 24 * 3_600_000;

/**
 * While online, fetches what the person may want to look at later without the
 * internet: their profile, activity, reports, warnings, and the pages of the
 * events they joined or supervise, and the rosters of those they supervise
 * today. Saved with the rest of the cache.
 */
export function useKeepOwnDataReady(events: EventSummary[] | undefined) {
  const { backend, sessionKey, mode } = useApp();
  const client = useQueryClient();
  useEffect(() => {
    if (mode !== 'api' || !backend) return;
    const ahead = <T>(key: unknown[], fetch: Fetch<T>) =>
      client.prefetchQuery({ queryKey: [sessionKey, ...key], queryFn: () => fetch(backend), staleTime: 5 * 60_000 });
    ahead(KEYS.me(), (b) => b.me());
    ahead(KEYS.myAttendance(), (b) => b.myAttendance());
    ahead(KEYS.myReports(), (b) => b.myReports());
    ahead(KEYS.myWarnings(), (b) => b.myWarnings());
    const own = (events ?? [])
      .filter((e) => (e.my_registration_status === 'joined' || e.i_organize) && e.status !== 'finished' && e.status !== 'cancelled')
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, OWN_EVENTS_AHEAD);
    for (const e of own) ahead(KEYS.event(e.id), (b) => b.event(e.id));
    const t = Date.now();
    for (const e of own) {
      if (e.i_organize && Date.parse(e.starts_at) - ROSTER_AHEAD_MS <= t && t <= Date.parse(e.ends_at)) {
        ahead(KEYS.roster(e.id), (b) => b.roster(e.id));
      }
    }
  }, [mode, backend, sessionKey, client, events]);
}
