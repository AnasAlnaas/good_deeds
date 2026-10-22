import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { api, failureCode } from '../api';
import { useAuth } from '../auth';
import { fill, ltr } from '../format';
import { t, type ErrorCode } from '../strings';
import { Button, ErrorNote, Field, Notice } from '../ui';

// Arabic keyboards type ٠١٢…; the server expects 0–9.
const latinDigits = (text: string) =>
  text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

// The association is in Libya: a local number (091…) gets +218.
function toInternational(input: string) {
  let n = latinDigits(input).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  else if (n.startsWith('0')) n = `+218${n.slice(1)}`;
  else if (n.startsWith('218')) n = `+${n}`;
  else if (!n.startsWith('+')) n = `+218${n}`;
  return n;
}

export function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  const attempt = async (call: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setRefusal(null);
    try {
      await call();
    } catch (e) {
      const c = failureCode(e);
      // The panel never creates accounts: new people sign up in the app.
      if (c === 'profile_required') setRefusal(t.login.noAccount);
      else if (c === 'forbidden') setRefusal(t.login.notAdmin);
      else setError(c);
    } finally {
      setBusy(false);
    }
  };

  const getCode = () =>
    attempt(async () => {
      const p = toInternational(phoneInput);
      await api.requestCode(p);
      setPhone(p);
      setCode('');
      setStep('code');
    });

  const enter = () =>
    attempt(async () => {
      const r = await api.verifyCode({ phone, code: latinDigits(code) });
      signIn(r); // refuses anyone who is not an admin
      navigate('/', { replace: true });
    });

  return (
    <div className="login">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'phone') getCode();
          else enter();
        }}>
        <div className="brand">
          <img src="/logo-mark.svg" alt="" />
          <div>
            <strong>{t.appName}</strong>
            <span className="muted">{t.association}</span>
          </div>
        </div>
        <h1>{t.login.title}</h1>
        {step === 'phone' ? (
          <>
            <p className="muted">{t.login.body}</p>
            <Field label={t.login.phone}>
              <input
                className="ltr"
                dir="ltr"
                type="tel"
                autoComplete="tel"
                placeholder="091 234 5678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                autoFocus
              />
            </Field>
            <Button type="submit" disabled={busy || latinDigits(phoneInput).replace(/\D/g, '').length < 9}>
              {t.login.getCode}
            </Button>
          </>
        ) : (
          <>
            <p className="muted">{fill(t.login.codeSent, { phone: ltr(phone) })}</p>
            <Field label={t.login.code}>
              <input
                className="ltr"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </Field>
            <Button type="submit" disabled={busy || latinDigits(code).length !== 6}>
              {t.login.enter}
            </Button>
            <Button variant="quiet" onClick={() => setStep('phone')}>
              {t.login.changePhone}
            </Button>
          </>
        )}
        <ErrorNote code={error} />
        {refusal && <Notice tone="warning">{refusal}</Notice>}
        {import.meta.env.DEV && <p className="small muted">{t.login.devHint}</p>}
      </form>
    </div>
  );
}
