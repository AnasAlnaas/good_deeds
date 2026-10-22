// The real server. Every call carries the sign-in token; an error comes back
// as `{ "error": "<code>" }` and becomes a BackendError with that code.

import type { LoginResponse, RequestCodeResponse, VerifyCodeBody } from './api';
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

export function requestCode(baseUrl: string, phone: string) {
  return call<RequestCodeResponse>(baseUrl, 'POST', '/auth/request-code', { body: { phone } });
}

export function verifyCode(baseUrl: string, body: VerifyCodeBody) {
  return call<LoginResponse>(baseUrl, 'POST', '/auth/verify-code', { body });
}

// ---------- everything else ----------

/** `onUnauthorized` runs when the server no longer accepts the token (expired, account deleted). */
export function createApiBackend(opts: { baseUrl: string; token: string; onUnauthorized: () => void }): Backend {
  const get = <T>(path: string) => call<T>(opts.baseUrl, 'GET', path, opts);
  const send = <T>(method: 'POST' | 'DELETE', path: string, body?: unknown) =>
    call<T>(opts.baseUrl, method, path, { ...opts, body });
  const atBody = (at?: number) => (at === undefined ? {} : { at: new Date(at).toISOString() });

  return {
    listEvents: () => get('/events'),
    event: (id) => get(`/events/${enc(id)}`),
    startJoin: (eventId) => send('POST', `/events/${enc(eventId)}/join`),
    acceptTerm: (eventId, termId) => send('POST', `/events/${enc(eventId)}/terms/${enc(termId)}/accept`),
    completeJoin: (eventId) => send('POST', `/events/${enc(eventId)}/join/complete`),
    cancelJoin: (eventId) => send('DELETE', `/events/${enc(eventId)}/join`),
    roster: (eventId) => get(`/events/${enc(eventId)}/roster`),
    recordStart: (eventId, userId, at) => send('POST', `/events/${enc(eventId)}/attendance/${enc(userId)}/start`, atBody(at)),
    recordEnd: (eventId, userId, at) => send('POST', `/events/${enc(eventId)}/attendance/${enc(userId)}/end`, atBody(at)),
    me: () => get('/me'),
    myAttendance: () => get('/me/attendance'),
    attendance: (id) => get(`/attendance/${enc(id)}`),
    confirmAttendance: (id) => send('POST', `/attendance/${enc(id)}/confirm`),
    disputeAttendance: (id) => send('POST', `/attendance/${enc(id)}/dispute`),
    deleteAccount: () => send('DELETE', '/me'),
    registerPushToken: (token, lang) => call(opts.baseUrl, 'PUT', '/me/push-token', { ...opts, body: { token, lang } }),
    unregisterPushToken: (token) => send('DELETE', '/me/push-token', { token }),
  };
}
