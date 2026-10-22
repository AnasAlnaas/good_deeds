import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { LocaleProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/data/queries';
import { AppProvider, useApp } from '@/state/app';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

function Root() {
  const { ready, isRTL } = useApp();
  const [fontsLoaded] = useFonts({
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
  });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  const direction = isRTL ? 'rtl' : 'ltr';
  return (
    // `direction` on the root view flips every row and every start/end below it.
    <View style={{ flex: 1, direction, backgroundColor: colors.surface }}>
      <LocaleProvider direction={direction}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
      </LocaleProvider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <Root />
        </AppProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
