import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnimatedLogo } from '@/components/brand';
import { Button } from '@/components/Button';
import { CityPicker } from '@/components/CityPicker';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, Chip, Field, PasswordField, Row } from '@/components/ui';
import type { LoginResponse } from '@/data/api';
import { DEMO_AVAILABLE } from '@/data/config';
import { requestEmailCode, resetPassword, signIn, signUp } from '@/data/apiBackend';
import { errorCode } from '@/data/backend';
import type { Gender } from '@/data/types';
import { DEMO_ACCOUNTS } from '@/demo/seed';
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
        <AnimatedLogo size={120} />
        <Txt variant="screenTitle" align="center">
          {s.appName}
        </Txt>
        {/* The association behind the app: its official logo, and whose app this is. */}
        <View style={styles.association}>
          <Image
            source={require('../../assets/brand/islah-tarbawi.png')}
            style={styles.associationLogo}
            contentFit="contain"
            accessibilityLabel={s.association}
          />
          <Txt variant="caption" align="center" color={colors.inkMuted}>
            {s.fromAssociation}
          </Txt>
        </View>
      </View>
      {apiUrl && DEMO_AVAILABLE && (
        <Row>
          <Chip label={s.login.modeServer} selected={mode === 'api'} onPress={() => setMode('api')} />
          <Chip label={s.login.modeDemo} selected={mode === 'demo'} onPress={() => setMode('demo')} />
        </Row>
      )}
      {mode === 'api' && apiUrl ? <PasswordSignIn baseUrl={apiUrl} /> : <DemoAccounts />}
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

const { latinDigits, libyanMobile, cleanEmail, cleanName, cleanCity, passwordProblem } = rules;

// Typed numbers only: a full local number (091 234 5678) has 10.
const digitCount = (text: string) => latinDigits(text).replace(/\D/g, '').length;
const onlyDigits = (text: string) => latinDigits(text).replace(/\D/g, '');

type Step = 'signIn' | 'signUp' | 'forgot' | 'reset';

/**
 * The server account: phone number, email address and password, with no SMS
 * (they cost too much for now). A new person fills in the form, then types the
 * code we email them, which makes the account. One who forgot the password gets
 * a code by email; one who can't reach their email, or whose account is older
 * than passwords, gets a one-time code from the association's admins.
 */
function PasswordSignIn({ baseUrl }: { baseUrl: string }) {
  const { s, lang, signInApi } = useApp();
  const [step, setStep] = useState<Step>('signIn');
  // Shown on the reset step when the account has no password yet.
  const [notSet, setNotSet] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // The address the latest code went to (sign-up or forgot): the code step is shown while it is set.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  // Chosen from the list, never typed: empty until the person picks one.
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  // What was typed is marked wrong only once the person tried to go on (or typed a whole number).
  const [checked, setChecked] = useState(false);

  const phone = libyanMobile(phoneInput);
  const email = cleanEmail(emailInput);
  const phoneWrong = !phone && (checked || digitCount(phoneInput) >= 10);
  const emailWrong = !email && checked && emailInput.trim().length > 0;
  const choosing = step !== 'signIn';
  // By email the number is not known here; the server checks the password against it.
  const problem = choosing ? passwordProblem(password, step === 'forgot' ? '' : (phone ?? '')) : null;
  const passwordWrong = checked && choosing && password.length > 0 && problem ? s.errors[problem] : null;

  const go = (next: Step) => {
    setStep(next);
    setNotSet(false);
    setPassword('');
    setCode('');
    setSentTo(null);
    setChecked(false);
  };

  const attempt = async (call: () => Promise<LoginResponse>) => {
    setBusy(true);
    try {
      const r = await call();
      signInApi(r.token, r.user);
      router.replace('/map');
    } catch (e) {
      const c = errorCode(e);
      if (c === 'password_not_set') {
        // The account is older than passwords: the way in is a reset code.
        go('reset');
        setNotSet(true);
      } else dialog.notify(s.errorTitle, s.errors[c]);
    } finally {
      setBusy(false);
    }
  };

  /** Emails a code to `to`; on the way, the code step is shown. */
  const sendCode = async (to: string, purpose: 'sign_up' | 'reset_password') => {
    setBusy(true);
    try {
      await requestEmailCode(baseUrl, { email: to, purpose, lang, ...(purpose === 'sign_up' && phone ? { phone } : {}) });
      setSentTo(to);
      setCode('');
    } catch (e) {
      dialog.notify(s.errorTitle, s.errors[errorCode(e)]);
    } finally {
      setBusy(false);
    }
  };

  const phoneField = (
    <Field
      label={s.login.phone}
      ltr
      value={phoneInput}
      onChangeText={(t) => {
        setPhoneInput(t);
        setChecked(false);
      }}
      onBlur={() => phoneInput.trim() && setChecked(true)}
      placeholder={s.login.phonePlaceholder}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      maxLength={20}
      error={phoneWrong ? s.login.phoneInvalid : null}
    />
  );
  const emailField = (
    <Field
      label={s.login.email}
      ltr
      value={emailInput}
      onChangeText={(t) => {
        setEmailInput(t);
        setChecked(false);
      }}
      onBlur={() => emailInput.trim() && setChecked(true)}
      placeholder={s.login.emailPlaceholder}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      maxLength={rules.EMAIL_MAX}
      error={emailWrong ? s.login.emailInvalid : null}
    />
  );
  const passwordField = (
    <PasswordField
      label={choosing ? s.login.newPassword : s.login.password}
      isNew={choosing}
      value={password}
      onChangeText={setPassword}
      maxLength={rules.PASSWORD_MAX}
      error={passwordWrong}
    />
  );
  const codeField = (label: string) => (
    <Field
      label={label}
      ltr
      value={code}
      onChangeText={(t) => setCode(onlyDigits(t))}
      placeholder="000000"
      keyboardType="number-pad"
      maxLength={6}
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
    />
  );
  const sentNote = (text: string) => <Txt color={colors.inkMuted}>{text.replace('{email}', `⁦${sentTo}⁩`)}</Txt>;

  if (step === 'signIn') {
    const byEmail = loginInput.includes('@');
    const valid = byEmail ? !!cleanEmail(loginInput) : !!libyanMobile(loginInput);
    const loginWrong = checked && loginInput.trim().length > 0 && !valid;
    const submit = () => {
      setChecked(true);
      if (valid && password) attempt(() => signIn(baseUrl, { login: loginInput.trim(), password }));
    };
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.signInTitle}
        </Txt>
        <Txt color={colors.inkMuted}>{s.login.signInBody}</Txt>
        <Field
          label={s.login.login}
          ltr
          value={loginInput}
          onChangeText={(t) => {
            setLoginInput(t);
            setChecked(false);
          }}
          onBlur={() => loginInput.trim() && setChecked(true)}
          placeholder={s.login.loginPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          maxLength={rules.EMAIL_MAX}
          error={loginWrong ? s.login.loginInvalid : null}
        />
        {passwordField}
        <Button icon="log-in-outline" label={s.login.signIn} disabled={busy || !loginInput.trim() || !password} onPress={submit} />
        <Button variant="quiet" label={s.login.forgot} onPress={() => go('forgot')} />
        <Button variant="secondary" icon="person-add-outline" label={s.login.toSignUp} onPress={() => go('signUp')} />
      </>
    );
  }

  if (step === 'forgot') {
    const submit = () => {
      setChecked(true);
      if (sentTo && !problem && code.length === 6) attempt(() => resetPassword(baseUrl, { email: sentTo, code, password }));
    };
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.forgotTitle}
        </Txt>
        {sentTo ? (
          <>
            {sentNote(s.login.forgotSentTo)}
            {codeField(s.login.emailCode)}
            {passwordField}
            <Txt variant="caption" color={colors.inkMuted}>
              {s.login.passwordHint}
            </Txt>
            <Button icon="key-outline" label={s.login.resetSubmit} disabled={busy || code.length !== 6 || !password} onPress={submit} />
            <Button variant="quiet" label={s.login.resendCode} disabled={busy} onPress={() => sendCode(sentTo, 'reset_password')} />
            <Button variant="quiet" label={s.login.changeEmail} onPress={() => setSentTo(null)} />
          </>
        ) : (
          <>
            <Txt color={colors.inkMuted}>{s.login.forgotBody}</Txt>
            {emailField}
            <Button
              icon="mail-outline"
              label={s.login.forgotSend}
              disabled={busy || !emailInput.trim()}
              onPress={() => {
                setChecked(true);
                if (email) sendCode(email, 'reset_password');
              }}
            />
          </>
        )}
        <Button variant="quiet" label={s.login.noEmail} onPress={() => go('reset')} />
        <Button variant="quiet" label={s.login.backToSignIn} onPress={() => go('signIn')} />
      </>
    );
  }

  if (step === 'reset') {
    const submit = () => {
      setChecked(true);
      if (phone && !problem && code.length === 6) attempt(() => resetPassword(baseUrl, { phone, code, password }));
    };
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.resetTitle}
        </Txt>
        <Txt color={colors.inkMuted}>{notSet ? s.login.notSetBody : s.login.resetBody}</Txt>
        {phoneField}
        {codeField(s.login.resetCode)}
        {passwordField}
        <Txt variant="caption" color={colors.inkMuted}>
          {s.login.passwordHint}
        </Txt>
        <Button icon="key-outline" label={s.login.resetSubmit} disabled={busy || !phoneInput || code.length !== 6 || !password} onPress={submit} />
        <Button variant="quiet" label={s.login.backToSignIn} onPress={() => go('signIn')} />
      </>
    );
  }

  const name = cleanName(fullName);
  const cleanedCity = cleanCity(city);
  const formReady = phone && email && !problem && name && cleanedCity && gender;

  if (sentTo && formReady) {
    const profile = { full_name: name, gender, city: cleanedCity };
    const createAccount = () => {
      if (code.length === 6) attempt(() => signUp(baseUrl, { phone, email: sentTo, email_code: code, password, profile }));
    };
    return (
      <>
        <Txt variant="sectionTitle" style={styles.gap}>
          {s.login.signUpTitle}
        </Txt>
        {sentNote(s.login.codeSentTo)}
        {codeField(s.login.emailCode)}
        <Button icon="person-add-outline" label={s.login.createAccount} disabled={busy || code.length !== 6} onPress={createAccount} />
        <Button variant="quiet" label={s.login.resendCode} disabled={busy} onPress={() => sendCode(sentTo, 'sign_up')} />
        <Button variant="quiet" label={s.login.changeEmail} onPress={() => setSentTo(null)} />
      </>
    );
  }

  const confirmEmail = () => {
    setChecked(true);
    if (formReady) sendCode(email, 'sign_up');
  };
  return (
    <>
      <Txt variant="sectionTitle" style={styles.gap}>
        {s.login.signUpTitle}
      </Txt>
      <Txt color={colors.inkMuted}>{s.login.signUpBody}</Txt>
      {phoneField}
      {emailField}
      {passwordField}
      <Txt variant="caption" color={colors.inkMuted}>
        {s.login.passwordHint}
      </Txt>
      <Field
        label={s.login.fullName}
        value={fullName}
        onChangeText={setFullName}
        placeholder={s.login.fullNamePlaceholder}
        maxLength={rules.NAME_MAX}
        autoComplete="name"
        textContentType="name"
        error={checked && !name ? s.login.nameInvalid : null}
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
      <CityPicker label={s.login.city} value={city} onChange={setCity} error={checked && !cleanedCity ? s.login.cityInvalid : null} />
      <Button
        icon="mail-outline"
        label={s.login.sendCode}
        disabled={busy || !phoneInput || !emailInput.trim() || !password || !fullName.trim() || !gender || !city}
        onPress={confirmEmail}
      />
      <Button variant="quiet" label={s.login.toSignIn} onPress={() => go('signIn')} />
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lang: { minWidth: 120 },
  brand: { alignItems: 'center', gap: space.xs, paddingTop: space.sm },
  association: { alignItems: 'center', gap: space.xs, marginTop: space.sm },
  associationLogo: { width: 64, height: 64 },
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
