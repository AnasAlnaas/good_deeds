// Talking to the server. Every call carries the admin's sign-in token; an
// error comes back as `{ "error": "<code>" }` and becomes an ApiFailure.

import type {
  AdminEventDetail,
  AdminEventRow,
  AdminMeta,
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  AdminWarningRow,
  AuditEntry,
  ChangeRoleBody,
  CreateEventBody,
  DecideWarningBody,
  DisputeRow,
  EventInput,
  HandleReportBody,
  HoursReportRow,
  ResolveDisputeBody,
  StatusChangeBody,
} from '../../shared/admin-api';
import type { LoginResponse, RequestCodeResponse, VerifyCodeBody } from '../../shared/api';
import type { ReportStatus, WarningStatus } from '../../shared/types';
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
  removePhoto: (id: string) => call<void>('DELETE', `/admin/users/${enc(id)}/photo`),
  /** A profile photo (users.avatar_url). It is served only with the sign-in token, so an <img src> cannot load it directly. */
  photo: async (avatarUrl: string, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch(`${API_URL}${avatarUrl}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal });
    if (!res.ok) throw new ApiFailure(res.status === 404 ? 'not_found' : 'internal_error');
    return res.blob();
  },

  events: () => call<AdminEventRow[]>('GET', '/admin/events'),
  event: (id: string) => call<AdminEventDetail>('GET', `/admin/events/${enc(id)}`),
  createEvent: (body: CreateEventBody) => call<{ id: string }>('POST', '/admin/events', body),
  updateEvent: (id: string, body: EventInput) => call<void>('PUT', `/admin/events/${enc(id)}`, body),
  setEventStatus: (id: string, action: 'publish' | 'cancel' | 'reject', body?: StatusChangeBody) =>
    call<void>('POST', `/admin/events/${enc(id)}/${action}`, body),

  disputes: () => call<DisputeRow[]>('GET', '/admin/disputes'),
  resolveDispute: (attendanceId: string, body: ResolveDisputeBody) =>
    call<void>('POST', `/admin/disputes/${enc(attendanceId)}/resolve`, body),

  /** Members' reports (بلاغ); every one without `status`. */
  reports: (status?: ReportStatus) => call<AdminReportRow[]>('GET', `/admin/reports${status ? `?status=${status}` : ''}`),
  handleReport: (id: string, body: HandleReportBody) => call<void>('POST', `/admin/reports/${enc(id)}/handle`, body),
  warnings: (filter: { status?: WarningStatus; user_id?: string }) => {
    const query = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => !!e[1])).toString();
    return call<AdminWarningRow[]>('GET', `/admin/warnings${query ? `?${query}` : ''}`);
  },
  decideWarning: (id: string, body: DecideWarningBody) => call<void>('POST', `/admin/warnings/${enc(id)}/decide`, body),

  hoursReport: (from: string, to: string) => call<HoursReportRow[]>('GET', `/admin/reports/hours?from=${enc(from)}&to=${enc(to)}`),
  audit: () => call<AuditEntry[]>('GET', '/admin/audit'),
};
