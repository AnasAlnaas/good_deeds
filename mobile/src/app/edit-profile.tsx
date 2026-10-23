import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Field, InfoRow } from '@/components/ui';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors } from '@/theme/tokens';
import * as rules from '../../../shared/rules';

// Keeps a phone number left-to-right inside Arabic text (DESIGN.md: isolate Latin and digits).
const ltr = (text: string) => `⁦${text}⁩`;

// The name and the city, checked as at sign-up (rules.cleanProfileEdit).
// Gender and phone are shown, not edited: gender decides which events a person
// may join and who sees their photo, and the phone is how they sign in.

export default function EditProfileScreen() {
  const { s } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const [fullName, setFullName] = useState(me.full_name);
  const [city, setCity] = useState(me.city);
  const [invalid, setInvalid] = useState(false);

  const save = async () => {
    const edit = rules.cleanProfileEdit({ full_name: fullName, city });
    if (!edit) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (await run((b) => b.updateProfile(edit))) router.back();
  };

  const footer = (
    <>
      {invalid && (
        <Txt variant="caption" color={colors.danger}>
          {s.editProfile.invalid}
        </Txt>
      )}
      <Button icon="checkmark" label={s.editProfile.save} disabled={busy} onPress={save} />
    </>
  );

  return (
    <Screen back title={s.editProfile.title} footer={footer}>
      <Field label={s.editProfile.fullName} value={fullName} maxLength={rules.NAME_MAX} onChangeText={setFullName} />
      <Field label={s.editProfile.city} value={city} maxLength={rules.CITY_MAX} onChangeText={setCity} />

      <Card>
        <InfoRow icon="person-outline" label={s.editProfile.gender} value={me.gender === 'male' ? s.login.male : s.login.female} />
        <Txt variant="caption" color={colors.inkMuted}>
          {s.editProfile.genderFixed}
        </Txt>
        <InfoRow icon="call-outline" label={s.editProfile.phone} value={ltr(me.phone)} />
        <Txt variant="caption" color={colors.inkMuted}>
          {s.editProfile.phoneFixed}
        </Txt>
      </Card>
    </Screen>
  );
}
