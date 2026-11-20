// One way for the screens to read and change data, with two implementations:
// - demoBackend.ts: the offline demo. Data on the phone, rules from shared/.
// - apiBackend.ts: the real server, over HTTP with the sign-in token.
// Both return the shapes in shared/api.ts, so a screen never knows which one it uses.

import { ApiError, type ApiErrorCode } from '../../../shared/errors';
import type {
  AcceptTermResponse,
  AttendanceItem,
  EventMatch,
  MySkillsBody,
  MySkillsResponse,
  LeaderboardResponse,
  PersonResponse,
  CertificateResponse,
  MakeCertificateBody,
  ClaimOutsideHoursBody,
  DecideOutsideHoursBody,
  InstitutionHoursReport,
  OutsideHoursItem,
  AttendanceResponse,
  ConfirmResponse,
  EventDetail,
  EventFormMeta,
  LearnLessonResponse,
  LessonImageResponse,
  MyLesson,
  EventProposal,
  EventSummary,
  InstitutionMembersResponse,
  InstitutionsResponse,
  MeResponse,
  MyInstitution,
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
  RequestInstitutionBody,
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
  /** A lesson's picture, sent before the event form that names it (src/lib/photo.ts makes it). */
  uploadLessonImage(picture: { base64: string; width: number; height: number }): Promise<LessonImageResponse>;
  startJoin(eventId: string): Promise<RegistrationResponse>;
  acceptTerm(eventId: string, termId: string): Promise<AcceptTermResponse>;
  completeJoin(eventId: string): Promise<RegistrationResponse>;
  cancelJoin(eventId: string): Promise<RegistrationResponse>;
  /** A full event's waiting list (shared/rules.ts planOffers). */
  joinWaitlist(eventId: string): Promise<void>;
  leaveWaitlist(eventId: string): Promise<void>;
  roster(eventId: string): Promise<RosterResponse>;
  /** A supervisor of the event takes the pledge to record attendance faithfully, before recording anyone (rules.decidePledge). */
  pledge(eventId: string): Promise<void>;
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
  /** The person's institutions, and the approved ones they may ask to belong to. */
  institutions(): Promise<InstitutionsResponse>;
  /** Asks for a new institution; it waits for an admin, and the person is its first representative. */
  requestInstitution(body: RequestInstitutionBody): Promise<MyInstitution>;
  /** Asks to belong to an approved institution; one of its representatives confirms it. */
  joinInstitution(id: string): Promise<MyInstitution>;
  /** Leaves an institution, or takes back a request to belong (or puts away one an admin turned down). */
  leaveInstitution(id: string): Promise<void>;
  /** Its representatives: who belongs to it and who asks to. */
  institutionMembers(id: string): Promise<InstitutionMembersResponse>;
  confirmMember(id: string, userId: string): Promise<InstitutionMembersResponse>;
  /** Turns a request down, or takes a member off. */
  removeMember(id: string, userId: string): Promise<InstitutionMembersResponse>;
  /** The person's own claims of hours outside the app's events, newest first. */
  myOutsideHours(): Promise<OutsideHoursItem[]>;
  /** Claims hours done outside the app's events for one of their institutions; its representatives decide. */
  claimOutsideHours(body: ClaimOutsideHoursBody): Promise<OutsideHoursItem>;
  /** Its representatives: claims waiting first, then the decided ones. */
  institutionOutsideHours(id: string): Promise<OutsideHoursItem[]>;
  decideOutsideHours(id: string, claimId: string, body: DecideOutsideHoursBody): Promise<OutsideHoursItem>;
  /** Its representatives: its members' confirmed hours between two days (YYYY-MM-DD). */
  institutionHoursReport(id: string, from: string, to: string): Promise<InstitutionHoursReport>;
  /** A certificate of the person's confirmed hours, made from the server's records so its QR code can be checked. */
  makeCertificate(body: MakeCertificateBody): Promise<CertificateResponse>;
  /** The app celebrated the new badges: they are not shown again. */
  markBadgesSeen(): Promise<void>;
  /** Someone as everyone sees them: name, photo, level and badges. */
  person(id: string): Promise<PersonResponse>;
  /** This month's confirmed hours: the whole association's, or one of the person's institutions'. */
  leaderboard(institutionId: string | null): Promise<LeaderboardResponse>;
  /** The person's skills and liked classes (only they and admins see them), with the skills offered. */
  mySkills(): Promise<MySkillsResponse>;
  setMySkills(body: MySkillsBody): Promise<MySkillsResponse>;
  /** Upcoming events that fit the person, best first (for the main screen, later). */
  skillMatches(): Promise<EventMatch[]>;
}
