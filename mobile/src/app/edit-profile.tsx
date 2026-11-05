import { useState } from 'react';

import { Button } from '@/components/Button';
import { CityPicker } from '@/components/CityPicker';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Field, InfoRow } from '@/components/ui';
import * as dialog from '@/lib/dialog';
import { goBack } from '@/lib/goBack';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors } from '@/theme/tokens';
import * as rules from '../../../shared/rules';

// Keeps a phone number left-to-right inside Arabic text (DESIGN.md: isolate Latin and digits).
const ltr = (text: string) => `⁦${text}⁩`;

function EmailCard() {
  const { s, lang, updateApiUser } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState(false);
  const email = rules.cleanEmail(input);

  const close = () => {
    setEditing(false);
    setInput('');
    setSentTo(null);
    setCode('');
    setChecked(false);
  };
  const send = async (to: string) => {
    if (await run((b) => b.requestEmailChange(to, lang))) {
      setSentTo(to);
      setCode('');
    }
  };
  const confirm = async () => {
    if (!sentTo || code.length !== 6) return;
    const done = await run((b) => b.changeEmail(sentTo, code));
    if (done) {
      updateApiUser(done.value.user);
      dialog.notify(s.editProfile.email, s.editProfile.emailChanged.replace('{email}', ltr(sentTo)));
      close();
    }
  };

  return (
    <Card>
      <InfoRow icon="mail-outline" label={s.editProfile.email} value={me.email ? ltr(me.email) : s.editProfile.emailNone} />
      <Txt variant="caption" color={colors.inkMuted}>
        {s.editProfile.emailNote}
      </Txt>
      {!editing ? (
        <Button variant="secondary" icon="create-outline" label={me.email ? s.editProfile.emailChange : s.editProfile.emailAdd} onPress={() => setEditing(true)} />
      ) : sentTo ? (
        <>
          <Txt color={colors.inkMuted}>{s.login.codeSentTo.replace('{email}', ltr(sentTo))}</Txt>
          <Field
            label={s.login.emailCode}
            ltr
            value={code}
            onChangeText={(t) => setCode(rules.latinDigits(t).replace(/\D/g, ''))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Button icon="checkmark" label={s.editProfile.emailConfirm} disabled={busy || code.length !== 6} onPress={confirm} />
          <Button variant="quiet" label={s.login.resendCode} disabled={busy} onPress={() => send(sentTo)} />
          <Button variant="quiet" label={s.editProfile.emailCancel} onPress={close} />
        </>
      ) : (
        <>
          <Field
            label={s.editProfile.emailNew}
            ltr
            value={input}
            onChangeText={(t) => {
              setInput(t);
              setChecked(false);
            }}
            placeholder={s.login.emailPlaceholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={rules.EMAIL_MAX}
            error={checked && !email ? s.login.emailInvalid : null}
          />
          <Button
            icon="mail-outline"
            label={s.editProfile.emailSend}
            disabled={busy || !input.trim()}
            onPress={() => {
              setChecked(true);
              if (email) send(email);
            }}
          />
          <Button variant="quiet" label={s.editProfile.emailCancel} onPress={close} />
        </>
      )}
    </Card>
  );
}

// The name and the city, checked as at sign-up (rules.cleanProfileEdit).
// Gender and phone are shown, not edited: gender decides which events a person
// may join and who sees their photo, and the phone is how they sign in.
// The email changes apart from the rest: a code is sent to the new address,
// and it is kept only once that code is typed here.

export default function EditProfileScreen() {
  const { s, mode } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const [fullName, setFullName] = useState(me.full_name);
  const [city, setCity] = useState(me.city);
  const [checked, setChecked] = useState(false);
  const nameWrong = checked && !rules.cleanName(fullName);
  const cityWrong = checked && !rules.cleanCity(city);

  const save = async () => {
    const edit = rules.cleanProfileEdit({ full_name: fullName, city });
    setChecked(true);
    if (!edit) return;
    if (await run((b) => b.updateProfile(edit))) goBack('/profile');
  };

  const footer = <Button icon="checkmark" label={s.editProfile.save} disabled={busy} onPress={save} />;

  return (
    <Screen back title={s.editProfile.title} footer={footer}>
      <Field
        label={s.editProfile.fullName}
        value={fullName}
        maxLength={rules.NAME_MAX}
        onChangeText={setFullName}
        error={nameWrong ? s.login.nameInvalid : null}
      />
      <CityPicker label={s.editProfile.city} value={city} onChange={setCity} error={cityWrong ? s.login.cityInvalid : null} />

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

      {/* The demo sends no email. */}
      {mode === 'api' && <EmailCard />}
    </Screen>
  );
}
