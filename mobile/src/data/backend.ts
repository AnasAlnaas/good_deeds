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
  EventFormMeta,
  LearnLessonResponse,
  MyLesson,
  EventProposal,
  EventSummary,
  MeResponse,
  MyReport,
  MyWarning,
  NoticeResponse,
  PhotoResponse,
  ProfileEdit,
  ProfileResponse,
  ProposeEventResponse,
  RequestCodeResponse,
  RegistrationResponse,
  ReportBody,
  ReportFormMeta,
  RosterResponse,
  ServerErrorCode,
  SupervisorsResponse,
  WarningResponse,
} from './api';
import type { NoticeKind, NoticeReactionKind } from './types';

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
  /** What the event form offers; refused for someone who may not create events. */
  eventForm(): Promise<EventFormMeta>;
  proposeEvent(body: EventProposal): Promise<ProposeEventResponse>;
  /** The proposer's own event, only while it waits for an admin: edited with the same form, or withdrawn (deleted). */
  editProposal(id: string, body: EventProposal): Promise<ProposeEventResponse>;
  withdrawProposal(id: string): Promise<void>;
  /** One of the event's lessons (ركن التعلم), learned by anyone who can see the event, joined or not. */
  learnLesson(eventId: string, lessonId: string): Promise<LearnLessonResponse>;
  /** Every lesson the person learned, latest first. */
  myLessons(): Promise<MyLesson[]>;
  startJoin(eventId: string): Promise<RegistrationResponse>;
  acceptTerm(eventId: string, termId: string): Promise<AcceptTermResponse>;
  completeJoin(eventId: string): Promise<RegistrationResponse>;
  cancelJoin(eventId: string): Promise<RegistrationResponse>;
  roster(eventId: string): Promise<RosterResponse>;
  /**
   * `at` absent = when it is recorded (the server's now). `recordedAt`: recorded
   * on the phone with no connection, at that time, and sent now (outbox.ts).
   */
  recordStart(eventId: string, userId: string, at?: number, recordedAt?: number): Promise<AttendanceResponse>;
  recordEnd(eventId: string, userId: string, at?: number, recordedAt?: number): Promise<AttendanceResponse>;
  /** A supervisor of the event warns someone who joined it. */
  warn(eventId: string, userId: string, reason: string): Promise<WarningResponse>;
  /** A supervisor of the event, or an admin, makes someone who joined it a supervisor too. */
  addSupervisor(eventId: string, userId: string): Promise<SupervisorsResponse>;
  /** Takes off a supervisor added in the app (or the supervisor steps down). */
  removeSupervisor(eventId: string, userId: string): Promise<SupervisorsResponse>;
  /** A notice to the event's people; they are notified. */
  /** An announcement, or a question whose reactions are its answers. */
  postNotice(eventId: string, body: string, kind: NoticeKind): Promise<NoticeResponse>;
  deleteNotice(eventId: string, noticeId: string): Promise<void>;
  /** One reaction per person per notice: a new one replaces it, null takes it back. */
  reactToNotice(eventId: string, noticeId: string, reaction: NoticeReactionKind | null): Promise<NoticeResponse>;
  /** What the report screen offers; refused for someone whose level does not allow reporting. */
  reportForm(): Promise<ReportFormMeta>;
  report(body: ReportBody): Promise<MyReport>;
  myReports(): Promise<MyReport[]>;
  myWarnings(): Promise<MyWarning[]>;
  warning(id: string): Promise<MyWarning>;
  appealWarning(id: string, reason: string): Promise<MyWarning>;
  me(): Promise<MeResponse>;
  myAttendance(): Promise<AttendanceItem[]>;
  attendance(id: string): Promise<AttendanceItem>;
  confirmAttendance(id: string): Promise<ConfirmResponse>;
  disputeAttendance(id: string): Promise<AttendanceResponse>;
  /** The name, the city, or both. Gender and phone never change. */
  updateProfile(edit: ProfileEdit): Promise<ProfileResponse>;
  /** A code to a new email address; the address is kept only once the code comes back (changeEmail). */
  requestEmailChange(email: string, lang: 'ar' | 'en'): Promise<RequestCodeResponse>;
  changeEmail(email: string, code: string): Promise<ProfileResponse>;
  /** A square JPEG, base64-encoded (src/lib/photo.ts makes it). */
  setPhoto(jpegBase64: string): Promise<PhotoResponse>;
  removePhoto(): Promise<void>;
  deleteAccount(): Promise<void>;
  /** This phone signed in: send this account's notifications to it. */
  registerPushToken(token: string, lang: 'ar' | 'en'): Promise<void>;
  /** This phone signed out: stop sending this account's notifications to it. */
  unregisterPushToken(token: string): Promise<void>;
}
