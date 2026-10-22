// Talking to the server. Every call carries the admin's sign-in token; an
// error comes back as `{ "error": "<code>" }` and becomes an ApiFailure.

import type {
  AdminEventDetail,
  AdminEventRow,
  AdminMeta,
  AdminOverview,
  AdminUserRow,
  AuditEntry,
  ChangeRoleBody,
  CreateEventBody,
  DisputeRow,
  EventInput,
  HoursReportRow,
  ResolveDisputeBody,
} from '../../shared/admin-api';
import type { LoginResponse, RequestCodeResponse, VerifyCodeBody } from '../../shared/api';
import type { ErrorCode } from './strings';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

export class ApiFailure extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

export const failureCode = (e: unknown): ErrorCode => (e instanceof ApiFailure ? e.code : 'internal_error');

let token: string | null = null;
let onUnauthorized: () => void = () => {};

/** Set by the session (auth.tsx). */
export function configure(next: { token: string | null; onUnauthorized: () => void }) {
  token = next.token;
  onUnauthorized = next.onUnauthorized;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiFailure('network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiFailure((data?.error as ErrorCode | undefined) ?? 'internal_error');
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  requestCode: (phone: string) => call<RequestCodeResponse>('POST', '/auth/request-code', { phone }),
  verifyCode: (body: VerifyCodeBody) => call<LoginResponse>('POST', '/auth/verify-code', body),

  overview: () => call<AdminOverview>('GET', '/admin/overview'),
  meta: () => call<AdminMeta>('GET', '/admin/meta'),

  users: (q: string) => call<AdminUserRow[]>('GET', `/admin/users${q ? `?q=${enc(q)}` : ''}`),
  changeRole: (id: string, body: ChangeRoleBody) => call<void>('PATCH', `/admin/users/${enc(id)}`, body),

  events: () => call<AdminEventRow[]>('GET', '/admin/events'),
  event: (id: string) => call<AdminEventDetail>('GET', `/admin/events/${enc(id)}`),
  createEvent: (body: CreateEventBody) => call<{ id: string }>('POST', '/admin/events', body),
  updateEvent: (id: string, body: EventInput) => call<void>('PUT', `/admin/events/${enc(id)}`, body),
  setEventStatus: (id: string, action: 'publish' | 'cancel') => call<void>('POST', `/admin/events/${enc(id)}/${action}`),

  disputes: () => call<DisputeRow[]>('GET', '/admin/disputes'),
  resolveDispute: (attendanceId: string, body: ResolveDisputeBody) =>
    call<void>('POST', `/admin/disputes/${enc(attendanceId)}/resolve`, body),

  hoursReport: (from: string, to: string) => call<HoursReportRow[]>('GET', `/admin/reports/hours?from=${enc(from)}&to=${enc(to)}`),
  audit: () => call<AuditEntry[]>('GET', '/admin/audit'),
};
