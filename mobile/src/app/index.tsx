import { Redirect } from 'expo-router';

import { useApp } from '@/state/app';

export default function Index() {
  const { onboarded, me } = useApp();
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!me) return <Redirect href="/login" />;
  return <Redirect href="/map" />;
}
