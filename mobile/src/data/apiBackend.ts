// The real server. Every call carries the sign-in token; an error comes back
// as `{ "error": "<code>" }` and becomes a BackendError with that code.

import type { EmailCodeBody, LoginResponse, RequestCodeResponse, ResetPasswordBody, SignInBody, SignUpBody } from './api';
import { type Backend, BackendError, type ErrorCode } from './backend';

const TIMEOUT_MS = 15_000;

async function call<T>(
  baseUrl: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; onUnauthorized?: () => void } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: abort.signal,
    });
  } catch {
    throw new BackendError('network');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && opts.token) opts.onUnauthorized?.();
    throw new BackendError((data?.error as ErrorCode | undefined) ?? 'internal_error');
  }
  return data as T;
}

const enc = encodeURIComponent;

// ---------- sign-in (no token yet) ----------

// By phone number or email, and password: no SMS (server/src/routes/auth.ts).

export function signIn(baseUrl: string, body: SignInBody) {
  return call<LoginResponse>(baseUrl, 'POST', '/auth/sign-in', { body });
}

export function signUp(baseUrl: string, body: SignUpBody) {
  return call<LoginResponse>(baseUrl, 'POST', '/auth/sign-up', { body });
}

/** A 6-digit code to the email: to confirm it before signing up, or to reset the password. */
export function requestEmailCode(baseUrl: string, body: EmailCodeBody) {
  return call<RequestCodeResponse>(baseUrl, 'POST', '/auth/email-code', { body });
}

/** With the code sent to the email, or the one an admin of the association gave the person. */
export function resetPassword(baseUrl: string, body: ResetPasswordBody) {
  return call<LoginResponse>(baseUrl, 'POST', '/auth/reset-password', { body });
}

// ---------- everything else ----------

/** `onUnauthorized` runs when the server no longer accepts the token (expired, account deleted). */
export function createApiBackend(opts: { baseUrl: string; token: string; onUnauthorized: () => void }): Backend {
  const get = <T>(path: string) => call<T>(opts.baseUrl, 'GET', path, opts);
  const send = <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    call<T>(opts.baseUrl, method, path, { ...opts, body });
  const atBody = (at?: number, recordedAt?: number) => ({
    ...(at === undefined ? {} : { at: new Date(at).toISOString() }),
    ...(recordedAt === undefined ? {} : { recorded_at: new Date(recordedAt).toISOString() }),
  });

  return {
    listEvents: () => get('/events'),
    event: (id) => get(`/events/${enc(id)}`),
    eventForm: () => get('/events/form'),
    proposeEvent: (body) => send('POST', '/events', body),
    editProposal: (id, body) => send('PUT', `/events/${enc(id)}`, body),
    withdrawProposal: (id) => send('DELETE', `/events/${enc(id)}`),
    learnLesson: (eventId, lessonId) => send('POST', `/events/${enc(eventId)}/lessons/${enc(lessonId)}/learn`),
    myLessons: () => get('/me/lessons'),
    startJoin: (eventId) => send('POST', `/events/${enc(eventId)}/join`),
    acceptTerm: (eventId, termId) => send('POST', `/events/${enc(eventId)}/terms/${enc(termId)}/accept`),
    completeJoin: (eventId) => send('POST', `/events/${enc(eventId)}/join/complete`),
    cancelJoin: (eventId) => send('DELETE', `/events/${enc(eventId)}/join`),
    roster: (eventId) => get(`/events/${enc(eventId)}/roster`),
    recordStart: (eventId, userId, at, recordedAt) =>
      send('POST', `/events/${enc(eventId)}/attendance/${enc(userId)}/start`, atBody(at, recordedAt)),
    recordEnd: (eventId, userId, at, recordedAt) =>
      send('POST', `/events/${enc(eventId)}/attendance/${enc(userId)}/end`, atBody(at, recordedAt)),
    warn: (eventId, userId, reason) => send('POST', `/events/${enc(eventId)}/warnings/${enc(userId)}`, { reason }),
    addSupervisor: (eventId, userId) => send('POST', `/events/${enc(eventId)}/supervisors/${enc(userId)}`),
    removeSupervisor: (eventId, userId) => send('DELETE', `/events/${enc(eventId)}/supervisors/${enc(userId)}`),
    postNotice: (eventId, body, kind) => send('POST', `/events/${enc(eventId)}/notices`, { body, kind }),
    deleteNotice: (eventId, noticeId) => send('DELETE', `/events/${enc(eventId)}/notices/${enc(noticeId)}`),
    reactToNotice: (eventId, noticeId, reaction) =>
      reaction
        ? send('PUT', `/events/${enc(eventId)}/notices/${enc(noticeId)}/reaction`, { reaction })
        : send('DELETE', `/events/${enc(eventId)}/notices/${enc(noticeId)}/reaction`),
    reportForm: () => get('/reports/form'),
    report: (body) => send('POST', '/reports', body),
    myReports: () => get('/me/reports'),
    myWarnings: () => get('/me/warnings'),
    warning: (id) => get(`/warnings/${enc(id)}`),
    appealWarning: (id, reason) => send('POST', `/warnings/${enc(id)}/appeal`, { reason }),
    me: () => get('/me'),
    myAttendance: () => get('/me/attendance'),
    attendance: (id) => get(`/attendance/${enc(id)}`),
    confirmAttendance: (id) => send('POST', `/attendance/${enc(id)}/confirm`),
    disputeAttendance: (id) => send('POST', `/attendance/${enc(id)}/dispute`),
    updateProfile: (edit) => send('PATCH', '/me', edit),
    requestEmailChange: (email, lang) => send('POST', '/me/email-code', { email, lang }),
    changeEmail: (email, code) => send('PUT', '/me/email', { email, code }),
    setPhoto: (jpegBase64) => send('PUT', '/me/photo', { jpeg_base64: jpegBase64 }),
    removePhoto: () => send('DELETE', '/me/photo'),
    deleteAccount: () => send('DELETE', '/me'),
    registerPushToken: (token, lang) => send('PUT', '/me/push-token', { token, lang }),
    unregisterPushToken: (token) => send('DELETE', '/me/push-token', { token }),
  };
}
