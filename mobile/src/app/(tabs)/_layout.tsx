import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useApp } from '@/state/app';
import { useNotificationTaps } from '@/state/useNotificationTaps';
import { colors, fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { s, me } = useApp();
  useNotificationTaps();
  if (!me) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: fonts.plex500, fontSize: 14 },
        tabBarStyle: { borderTopColor: colors.border, minHeight: 64 },
      }}>
      <Tabs.Screen name="map" options={{ title: s.tabs.map, tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} /> }} />
      <Tabs.Screen name="events" options={{ title: s.tabs.events, tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }} />
      <Tabs.Screen name="activity" options={{ title: s.tabs.activity, tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: s.tabs.profile, tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
