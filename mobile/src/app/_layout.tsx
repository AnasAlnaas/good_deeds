import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { LocaleProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavIsland, NavIslandProvider } from '@/components/NavIsland';
import { useOnline } from '@/data/network';
import { openOutbox, sendQueued, useOutbox } from '@/data/outbox';
import { persistOptions, queryClient } from '@/data/queries';
import { AppProvider, useApp } from '@/state/app';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

// Attendance recorded with no connection (data/outbox.ts) goes out as soon as
// the phone is online again, and every half minute while some is left.
function useSendQueuedRecords() {
  const { backend, mode, me } = useApp();
  const client = useQueryClient();
  const online = useOnline();
  const owner = mode === 'api' ? (me?.id ?? null) : null;
  const { queued } = useOutbox();
  useEffect(() => {
    openOutbox(owner);
  }, [owner]);
  const waiting = queued.length > 0;
  useEffect(() => {
    if (!waiting || !online || !backend || mode !== 'api') return;
    const send = () => sendQueued(backend, () => client.invalidateQueries());
    send();
    const id = setInterval(send, 30_000);
    return () => clearInterval(id);
  }, [waiting, online, backend, mode, client]);
}

function Root() {
  const { ready, isRTL } = useApp();
  // The saved copy of what the screens showed last time is read before the
  // splash goes, so the first screen opens with it instead of loading.
  const restoring = useIsRestoring();
  useSendQueuedRecords();
  const [fontsLoaded] = useFonts({
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
  });

  useEffect(() => {
    if (ready && fontsLoaded && !restoring) SplashScreen.hideAsync();
  }, [ready, fontsLoaded, restoring]);

  if (!ready || !fontsLoaded || restoring) return null;

  const direction = isRTL ? 'rtl' : 'ltr';
  return (
    // `direction` on the root view flips every row and every start/end below it.
    <View style={{ flex: 1, direction, backgroundColor: colors.surface }}>
      <LocaleProvider direction={direction}>
        <StatusBar style="dark" />
        <NavIslandProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
              // A screen slides in from the side the language reads from, the one under it moving a little with it.
              animation: isRTL ? 'ios_from_left' : 'ios_from_right',
            }}
          />
          {/* Over the stack, so it stays put while the main screens change under it. */}
          <NavIsland />
        </NavIslandProvider>
      </LocaleProvider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AppProvider>
          <Root />
        </AppProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
