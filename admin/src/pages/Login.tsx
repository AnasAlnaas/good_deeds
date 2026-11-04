import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import type { LoginResponse } from '../../../shared/api';
import { api, failureCode } from '../api';
import { useAuth } from '../auth';
import { t, type ErrorCode } from '../strings';
import { Button, ErrorNote, Field, Notice } from '../ui';
import { latinDigits, libyanMobile, PASSWORD_MAX, passwordProblem } from '../../../shared/rules';

// The same account as in the app: phone number and password (no SMS). An admin
// who forgot the password gets a reset code from another admin.
export function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'signIn' | 'reset'>('signIn');
  const [notSet, setNotSet] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  const go = (next: 'signIn' | 'reset', withoutPassword = false) => {
    setStep(next);
    setNotSet(withoutPassword);
    setPassword('');
    setCode('');
    setError(null);
    setRefusal(null);
  };

  const attempt = async (call: () => Promise<LoginResponse>) => {
    setBusy(true);
    setError(null);
    setRefusal(null);
    try {
      signIn(await call()); // refuses anyone who is not an admin
      navigate('/', { replace: true });
    } catch (e) {
      const c = failureCode(e);
      if (c === 'forbidden') setRefusal(t.login.notAdmin);
      else if (c === 'password_not_set') go('reset', true);
      else setError(c);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const phone = libyanMobile(phoneInput);
    if (!phone) {
      setError(null);
      setRefusal(t.login.phoneInvalid);
      return;
    }
    if (step === 'signIn') return attempt(() => api.signIn({ phone, password }));
    const problem = passwordProblem(password, phone);
    if (problem) {
      setRefusal(null);
      setError(problem);
      return;
    }
    return attempt(() => api.resetPassword({ phone, code, password }));
  };

  return (
    <div className="login">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}>
        <div className="brand">
          <img src="/logo-mark.svg" alt="" />
          <div>
            <strong>{t.appName}</strong>
            <span className="muted">{t.association}</span>
          </div>
        </div>
        <h1>{step === 'signIn' ? t.login.title : t.login.resetTitle}</h1>
        <p className="muted">{step === 'signIn' ? t.login.body : notSet ? t.login.notSetBody : t.login.resetBody}</p>
        <Field label={t.login.phone}>
          <input
            className="ltr"
            dir="ltr"
            type="tel"
            autoComplete="tel"
            placeholder="091 234 5678"
            value={phoneInput}
            maxLength={20}
            onChange={(e) => setPhoneInput(e.target.value)}
            autoFocus
          />
        </Field>
        {step === 'reset' && (
          <Field label={t.login.resetCode}>
            <input
              className="ltr"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(latinDigits(e.target.value).replace(/\D/g, ''))}
            />
          </Field>
        )}
        <Field label={step === 'signIn' ? t.login.password : t.login.newPassword}>
          <div className="row">
            <input
              type={shown ? 'text' : 'password'}
              autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              maxLength={PASSWORD_MAX}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="quiet" className="btn-small" onClick={() => setShown(!shown)}>
              {shown ? t.login.hidePassword : t.login.showPassword}
            </Button>
          </div>
        </Field>
        {step === 'reset' && <p className="small muted">{t.login.passwordHint}</p>}
        <Button
          type="submit"
          disabled={busy || latinDigits(phoneInput).replace(/\D/g, '').length < 9 || !password || (step === 'reset' && code.length !== 6)}>
          {step === 'signIn' ? t.login.enter : t.login.resetSubmit}
        </Button>
        <Button variant="quiet" onClick={() => go(step === 'signIn' ? 'reset' : 'signIn')}>
          {step === 'signIn' ? t.login.forgot : t.login.backToSignIn}
        </Button>
        <ErrorNote code={error} />
        {refusal && <Notice tone="warning">{refusal}</Notice>}
        {import.meta.env.DEV && <p className="small muted">{t.login.devHint}</p>}
      </form>
    </div>
  );
}
