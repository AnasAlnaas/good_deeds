import { router } from 'expo-router';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Chip, Row, SectionTitle } from '@/components/ui';
import * as server from '@/demo/server';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';

export default function SettingsScreen() {
  const { s, lang, setLang, signOut, resetDemo } = useApp();
  const me = useMe();
  const act = useAction();

  const toLogin = () => {
    router.dismissAll();
    router.replace('/login');
    signOut();
  };

  const reset = () =>
    Alert.alert(s.settings.resetTitle, s.settings.resetBody, [
      { text: s.cancel, style: 'cancel' },
      { text: s.settings.reset, style: 'destructive', onPress: resetDemo },
    ]);

  // App Store requires in-app account deletion (Data_Model.md: users.deleted_at).
  const deleteAccount = () =>
    Alert.alert(s.settings.deleteTitle, s.settings.deleteBody, [
      { text: s.cancel, style: 'cancel' },
      {
        text: s.settings.deleteAccount,
        style: 'destructive',
        onPress: () => {
          if (act((d, t) => server.deleteAccount(d, me.id, t))) {
            toLogin();
            Alert.alert(s.settings.deleted);
          }
        },
      },
    ]);

  return (
    <Screen back title={s.settings.title}>
      <SectionTitle>{s.settings.language}</SectionTitle>
      <Row>
        <Chip label={s.settings.arabic} selected={lang === 'ar'} onPress={() => setLang('ar')} />
        <Chip label={s.settings.english} selected={lang === 'en'} onPress={() => setLang('en')} />
      </Row>

      <SectionTitle>{s.settings.demo}</SectionTitle>
      <Button variant="secondary" icon="swap-horizontal" label={s.settings.switchAccount} onPress={toLogin} />
      <Button variant="secondary" icon="refresh" label={s.settings.reset} onPress={reset} />

      <SectionTitle>{s.settings.account}</SectionTitle>
      <Button variant="danger" icon="trash-outline" label={s.settings.deleteAccount} onPress={deleteAccount} />
    </Screen>
  );
}
