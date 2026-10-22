// One way for the screens to read and change data, with two implementations:
// - demoBackend.ts: the offline demo. Data on the phone, rules from shared/.
// - apiBackend.ts: the real server, over HTTP with the sign-in token.
// Both return the shapes in shared/api.ts, so a screen never knows which one it uses.

import { ApiError, type ApiErrorCode } from '../../../shared/errors';
import type {
  AcceptTermResponse,
  AttendanceItem,
  AttendanceResponse,
  ConfirmResponse,
  EventDetail,
  EventSummary,
  MeResponse,
  RegistrationResponse,
  RosterResponse,
  ServerErrorCode,
} from './api';

export type Mode = 'demo' | 'api';

/** Every error a screen may have to explain. `network` = the server could not be reached. */
export type ErrorCode = ApiErrorCode | ServerErrorCode | 'network';

export class BackendError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = 'BackendError';
    this.code = code;
  }
}

export function errorCode(e: unknown): ErrorCode {
  if (e instanceof ApiError || e instanceof BackendError) return e.code;
  return 'internal_error';
}

export interface Backend {
  listEvents(): Promise<EventSummary[]>;
  event(id: string): Promise<EventDetail>;
  startJoin(eventId: string): Promise<RegistrationResponse>;
  acceptTerm(eventId: string, termId: string): Promise<AcceptTermResponse>;
  completeJoin(eventId: string): Promise<RegistrationResponse>;
  cancelJoin(eventId: string): Promise<RegistrationResponse>;
  roster(eventId: string): Promise<RosterResponse>;
  /** `at` absent = now (the server's now). */
  recordStart(eventId: string, userId: string, at?: number): Promise<AttendanceResponse>;
  recordEnd(eventId: string, userId: string, at?: number): Promise<AttendanceResponse>;
  me(): Promise<MeResponse>;
  myAttendance(): Promise<AttendanceItem[]>;
  attendance(id: string): Promise<AttendanceItem>;
  confirmAttendance(id: string): Promise<ConfirmResponse>;
  disputeAttendance(id: string): Promise<AttendanceResponse>;
  deleteAccount(): Promise<void>;
}
