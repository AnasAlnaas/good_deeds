import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Chip, Row, SectionTitle } from '@/components/ui';
import { PRIVACY_URL } from '@/data/config';
import * as dialog from '@/lib/dialog';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';

export default function SettingsScreen() {
  const { s, lang, setLang, signOut, resetDemo, mode } = useApp();
  const { run, busy } = useAction();

  const toLogin = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
    signOut();
  };

  const reset = () =>
    dialog.confirm({
      title: s.settings.resetTitle,
      message: s.settings.resetBody,
      cancel: s.cancel,
      action: s.settings.reset,
      destructive: true,
      onConfirm: resetDemo,
    });

  // App Store requires in-app account deletion (Data_Model.md: users.deleted_at).
  const deleteAccount = () =>
    dialog.confirm({
      title: s.settings.deleteTitle,
      message: s.settings.deleteBody,
      cancel: s.cancel,
      action: s.settings.deleteAccount,
      destructive: true,
      onConfirm: async () => {
        if (await run((b) => b.deleteAccount())) {
          toLogin();
          dialog.notify(s.settings.deleted);
        }
      },
    });

  return (
    <Screen back title={s.settings.title}>
      <SectionTitle>{s.settings.language}</SectionTitle>
      <Row>
        <Chip label={s.settings.arabic} selected={lang === 'ar'} onPress={() => setLang('ar')} />
        <Chip label={s.settings.english} selected={lang === 'en'} onPress={() => setLang('en')} />
      </Row>

      {mode === 'demo' && (
        <>
          <SectionTitle>{s.settings.demo}</SectionTitle>
          <Button variant="secondary" icon="swap-horizontal" label={s.settings.switchAccount} onPress={toLogin} />
          <Button variant="secondary" icon="refresh" label={s.settings.reset} onPress={reset} />
        </>
      )}

      {PRIVACY_URL && (
        <>
          <SectionTitle>{s.settings.privacy}</SectionTitle>
          <Button
            variant="secondary"
            icon="shield-checkmark-outline"
            label={s.settings.privacyPolicy}
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
        </>
      )}

      <SectionTitle>{s.settings.account}</SectionTitle>
      {mode === 'api' && <Button variant="secondary" icon="log-out-outline" label={s.settings.signOut} onPress={toLogin} />}
      <Button variant="danger" icon="trash-outline" label={s.settings.deleteAccount} disabled={busy} onPress={deleteAccount} />
    </Screen>
  );
}
