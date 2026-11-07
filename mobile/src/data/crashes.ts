import * as Sentry from '@sentry/react-native';

// Crash and error reports, sent to Sentry (sentry.io) from test and store builds.
//
// On only when EXPO_PUBLIC_SENTRY_DSN is set (mobile/.env.local) and never in
// development, so a developer's mistakes don't fill the reports. A report holds
// the error, where in the code it happened, the phone model, the Android
// version, the app version and the over-the-air update it was running, and the
// account's id. Never the name, phone number, email, location or photos
// (sendDefaultPii: false, and nothing else is attached).

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
export const crashReportsOn = !!dsn && !__DEV__;

Sentry.init({
  dsn,
  enabled: crashReportsOn,
  sendDefaultPii: false,
  // Errors only: no performance tracing, no session replays.
  tracesSampleRate: 0,
  // Requests the app makes are breadcrumbs; their addresses stay, their bodies never are sent.
  maxBreadcrumbs: 50,
  environment: process.env.EXPO_PUBLIC_API_URL ? 'beta' : 'demo',
});

/** Ties the next reports to the signed-in account (its id only), or to nobody after signing out. */
export function setCrashUser(id: string | null) {
  Sentry.setUser(id ? { id } : null);
}

export const wrapRoot = Sentry.wrap;
