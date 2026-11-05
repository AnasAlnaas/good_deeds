// Sending email: the one-time codes that confirm an address and reset a
// password. In production through Brevo's API (free for 300 emails a day,
// from one verified sender address); in development printed in the server log.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email; throws if it could not be handed to the provider. */
export type SendEmail = (message: EmailMessage) => Promise<void>;

export type EmailCodePurpose = 'sign_up' | 'reset_password' | 'change_email';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export function brevoEmail(opts: { apiKey: string; from: string; fromName: string }): SendEmail {
  return async (m) => {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': opts.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: opts.from, name: opts.fromName },
        to: [{ email: m.to }],
        subject: m.subject,
        textContent: m.text,
        htmlContent: m.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Brevo refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
  };
}

export const consoleEmail: SendEmail = async (m) => {
  console.log(`[email] to ${m.to}: ${m.subject}\n${m.text}`);
};

const WORDING = {
  ar: {
    sign_up: { subject: 'رمز تأكيد بريدك', why: 'لتأكيد بريدك وإنشاء حسابك في تطبيق الأعمال الصالحة' },
    change_email: { subject: 'رمز تأكيد بريدك', why: 'لتأكيد بريدك الجديد في حسابك في تطبيق الأعمال الصالحة' },
    reset_password: { subject: 'رمز استعادة كلمة المرور', why: 'لاختيار كلمة مرور جديدة لحسابك في تطبيق الأعمال الصالحة' },
    code: 'رمزك',
    minutes: (n: number) => `صالح ${n} دقيقة.`,
    ignore: 'إن لم تطلب هذا الرمز فتجاهل هذه الرسالة، ولا تعطِ الرمز لأحد.',
    sign: 'جمعية الإصلاح التربوي',
  },
  en: {
    sign_up: { subject: 'Your email confirmation code', why: 'to confirm your email and create your Good Deeds account' },
    change_email: { subject: 'Your email confirmation code', why: 'to confirm your new email for your Good Deeds account' },
    reset_password: { subject: 'Your password reset code', why: 'to choose a new password for your Good Deeds account' },
    code: 'Your code',
    minutes: (n: number) => `It works for ${n} minutes.`,
    ignore: "If you didn't ask for this code, ignore this email, and don't give the code to anyone.",
    sign: 'Educational Reform Association',
  },
};

/** The email that carries a one-time code, in the app's language. */
export function codeEmail(to: string, purpose: EmailCodePurpose, code: string, minutes: number, lang: 'ar' | 'en'): EmailMessage {
  const w = WORDING[lang];
  const p = w[purpose];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const text = [`${w.code} ${p.why}: ${code}`, w.minutes(minutes), '', w.ignore, '', w.sign].join('\n');
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><body style="font-family:Tahoma,Arial,sans-serif;color:#1d2a3a;line-height:1.6">
<p>${w.code} ${p.why}:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;direction:ltr;unicode-bidi:isolate">${code}</p>
<p>${w.minutes(minutes)}</p>
<p style="color:#5b6573;font-size:13px">${w.ignore}</p>
<p>${w.sign}</p>
</body></html>`;
  return { to, subject: p.subject, text, html };
}
