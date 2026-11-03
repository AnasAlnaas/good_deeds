import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedLogo } from '@/components/brand';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, Chip, Field, Row } from '@/components/ui';
import type { VerifyCodeBody } from '@/data/api';
import { requestCode, verifyCode } from '@/data/apiBackend';
import { errorCode } from '@/data/backend';
import type { Gender } from '@/data/types';
import { DEMO_ACCOUNTS } from '@/demo/seed';
import { fmt } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import * as rules from '../../../shared/rules';

export default function Login() {
  const { s, lang, setLang, mode, setMode, apiUrl } = useApp();

  return (
    <Screen>
      <View style={styles.top}>
        {mode === 'demo' ? <Badge label={s.demoBadge} color={colors.warning} icon="flask" /> : <View />}
        <View style={styles.lang}>
          <Button variant="quiet" icon="language" label={s.login.language} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
        </View>
      </View>
      <View style={styles.brand}>
        <AnimatedLogo size={96} />
        <Txt variant="screenTitle" align="center">
          {s.appName}
        </Txt>
        <Txt variant="caption" align="center" color={colors.inkMuted}>
          {s.association}
        </Txt>
      </View>
      {apiUrl && (
        <Row>
          <Chip label={s.login.modeServer} selected={mode === 'api'} onPress={() => setMode('api')} />
          <Chip label={s.login.modeDemo} selected={mode === 'demo'} onPress={() => setMode('demo')} />
        </Row>
      )}
      {mode === 'api' && apiUrl ? <PhoneSignIn baseUrl={apiUrl} /> : <DemoAccounts />}
    </Screen>
  );
}

function DemoAccounts() {
  const { s, demoDb, signInDemo } = useApp();

  const accounts = [
    { id: DEMO_ACCOUNTS.participant, role: s.login.participant, hint: s.login.participantHint, icon: 'person' as const },
    { id: DEMO_ACCOUNTS.participantFemale, role: s.login.participantFemale, hint: s.login.participantHintFemale, icon: 'person' as const },
    { id: DEMO_ACCOUNTS.supervisor, role: s.login.supervisor, hint: s.login.supervisorHint, icon: 'clipboard' as const },
    { id: DEMO_ACCOUNTS.supervisorFemale, role: s.login.supervisorFemale, hint: s.login.supervisorHintFemale, icon: 'clipboard' as const },
  ];

  const choose = (id: string) => {
    signInDemo(id);
    router.replace('/map');
  };

  return (
    <>
      <Txt variant="sectionTitle" style={styles.gap}>
        {s.login.title}
      </Txt>
      <Txt color={colors.inkMuted}>{s.login.body}</Txt>
      {accounts.map((a) => {
        const u = demoDb.users.find((x) => x.id === a.id);
        if (!u) return null;
        return (
          <Card key={a.id} onPress={() => choose(a.id)}>
            <View style={styles.row}>
              <View style={styles.icon}>
                <Ionicons name={a.icon} size={24} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{u.full_name}</Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  {a.role} · {a.hint}
                </Txt>
              </View>
            </View>
          </Card>
        );
      })}
    </>
  );
}

const { latinDigits, libyanMobile, cleanName, cleanCity } = rules;

// Typed numbers only: a full local number (091 234 5678) has 10.
const digitCount = (text: string) => latinDigits(text).replace(/\D/g, '').length;

// Keeps a phone number left-to-right inside Arabic text.
const ltr = (text: string) => `⁦${text}⁩`;

/** Sign-in by phone: number → code → (first time only) profile. */
function PhoneSignIn({ baseUrl }: { baseUrl: string }) {
  const { s, signInApi } = useApp();
  const [step, setStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [city, setCity] = useState(s.login.defaultCity);
  const [busy, setBusy] = useState(false);
  // What was typed is marked wrong only once the person tried to go on (or typed a whole number).
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  const attempt = async (call: () => Promise<void>) => {
    setBusy(true);
    try {
      await call();
    } catch (e) {
      const c = errorCode(e);
      // A new phone: the code was right, the server needs the profile to create the account.
      if (c === 'profile_required') setStep('profile');
      else dialog.notify(s.errorTitle, s.errors[c]);
    } finally {
      setBusy(false);
    }
  };

  const typedPhone = libyanMobile(phoneInput);
  const getCode = () => {
    setPhoneChecked(true);
    const p = typedPhone;
    if (!p) return;
    return attempt(async () => {
      await requestCode(baseUrl, p);
      setPhone(p);
      setCode('');
      setStep('code');
    });
  };

  const enter = (profile?: VerifyCodeBody['profile']) =>
    attempt(async () => {
      const r = await verifyCode(baseUrl, { phone, code: latinDigits(code), profile });
      signInApi(r.token, r.user);
      router.replace('/map');
    });

  if (step === 'phone') {
    const phoneWrong = !typedPhone && (phoneChecked || digitCount(phoneInput) >= 10);
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.phoneTitle}
        </Txt>
        <Txt color={colors.inkMuted}>{s.login.phoneBody}</Txt>
        <Field
          label={s.login.phone}
          ltr
          value={phoneInput}
          onChangeText={(t) => {
            setPhoneInput(t);
            setPhoneChecked(false);
          }}
          onBlur={() => phoneInput.trim() && setPhoneChecked(true)}
          placeholder={s.login.phonePlaceholder}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={20}
          onSubmitEditing={getCode}
          error={phoneWrong ? s.login.phoneInvalid : null}
        />
        <Button icon="chatbox-ellipses-outline" label={s.login.getCode} disabled={busy || digitCount(phoneInput) < 9} onPress={getCode} />
      </>
    );
  }

  if (step === 'code') {
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.codeTitle}
        </Txt>
        <Txt color={colors.inkMuted}>{fmt(s.login.codeBody, { phone: ltr(phone) })}</Txt>
        <Field
          label={s.login.code}
          ltr
          value={code}
          onChangeText={setCode}
          placeholder="••••••"
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onSubmitEditing={() => enter()}
        />
        <Button icon="log-in-outline" label={s.login.enter} disabled={busy || latinDigits(code).length !== 6} onPress={() => enter()} />
        <Button variant="quiet" label={s.login.changePhone} onPress={() => setStep('phone')} />
        {__DEV__ && (
          <Txt variant="caption" color={colors.inkMuted} align="center">
            {s.login.devHint}
          </Txt>
        )}
      </>
    );
  }

  const name = cleanName(fullName);
  const cleanedCity = cleanCity(city);
  const createAccount = () => {
    setProfileChecked(true);
    if (name && cleanedCity && gender) enter({ full_name: name, gender, city: cleanedCity });
  };
  return (
    <>
      <Txt variant="sectionTitle" style={styles.gap}>
        {s.login.profileTitle}
      </Txt>
      <Txt color={colors.inkMuted}>{s.login.profileBody}</Txt>
      <Field
        label={s.login.fullName}
        value={fullName}
        onChangeText={setFullName}
        placeholder={s.login.fullNamePlaceholder}
        maxLength={rules.NAME_MAX}
        autoComplete="name"
        textContentType="name"
        error={profileChecked && !name ? s.login.nameInvalid : null}
      />
      <Txt variant="caption" color={colors.inkMuted}>
        {s.login.gender}
      </Txt>
      <Row>
        <Chip label={s.login.male} selected={gender === 'male'} onPress={() => setGender('male')} />
        <Chip label={s.login.female} selected={gender === 'female'} onPress={() => setGender('female')} />
      </Row>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.login.genderNote}
      </Txt>
      <Field
        label={s.login.city}
        value={city}
        onChangeText={setCity}
        maxLength={rules.CITY_MAX}
        error={profileChecked && !cleanedCity ? s.login.cityInvalid : null}
      />
      <Button
        icon="person-add-outline"
        label={s.login.createAccount}
        disabled={busy || !fullName.trim() || !gender || !city.trim()}
        onPress={createAccount}
      />
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lang: { minWidth: 120 },
  brand: { alignItems: 'center', gap: space.xs, paddingTop: space.sm },
  gap: { marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
