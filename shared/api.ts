// What the server's endpoints send back. The server builds these; the app
// will read them when it switches from the offline demo to the API.
// Every error response is `ErrorBody` with an HTTP status: 400 invalid
// request, 401 not signed in, 403 not allowed, 404 not found, 409 a rule
// refused it, 429 too soon, 503 not configured.

import type { AdminErrorCode, ApiErrorCode } from './errors';
import type {
  AppEvent,
  Attendance,
  Branch,
  EventStatus,
  EventTerm,
  Gender,
  GenderCategory,
  Level,
  Pillar,
  Registration,
  RegistrationStatus,
  User,
} from './types';

/** Errors that come from sign-in and request handling rather than from the app's rules. */
export type ServerErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'code_invalid'
  | 'code_expired'
  | 'too_many_attempts'
  | 'code_recently_sent'
  | 'profile_required'
  | 'delivery_not_configured'
  | 'photo_invalid'
  | 'internal_error';

export interface ErrorBody {
  error: ApiErrorCode | ServerErrorCode | AdminErrorCode;
}

/**
 * What other people may see about a user: no phone, no email. Gender sets the
 * Arabic wording (حاضر / حاضرة). `avatar_url` is null for a viewer who may not
 * see the photo (rules.canSeePhoto).
 */
export type PublicUser = Pick<User, 'id' | 'full_name' | 'avatar_url' | 'gender'>;

// ---------- sign-in ----------

/** POST /api/auth/request-code */
export interface RequestCodeBody {
  phone: string; // international format, e.g. +218912345678
}
export interface RequestCodeResponse {
  expires_in_seconds: number;
}

/** POST /api/auth/verify-code. `profile` is needed only the first time a phone signs in. */
export interface VerifyCodeBody {
  phone: string;
  code: string;
  profile?: { full_name: string; gender: Gender; city: string };
}
export interface LoginResponse {
  token: string;
  user: User;
}

// ---------- events ----------

/** GET /api/events (one per event) */
export interface EventSummary
  extends Omit<AppEvent, 'description' | 'status' | 'terms_locked_at' | 'created_by' | 'created_at'> {
  /** Computed with the server's clock: published → running → finished. */
  status: EventStatus;
  joined_count: number;
  pillar_weights: Record<Pillar, number>;
  dominant_pillar: Pillar;
  /** The event's men / women / mixed rule allows the signed-in user. */
  can_join_category: boolean;
  my_registration_status: RegistrationStatus | null;
  /** The signed-in user supervises this event. */
  i_organize: boolean;
  /** The signed-in user created it. Their own drafts and turned-down drafts are listed for them only. */
  i_created: boolean;
}

/**
 * POST /api/events: an event made in the app. Its creator becomes its supervisor.
 * Points come from the type. A member's event waits for an admin (status `draft`).
 */
export interface EventProposal {
  title: string;
  description: string;
  subtype: string;
  address_text: string;
  lat: number;
  lng: number;
  starts_at: string; // ISO
  ends_at: string; // ISO
  capacity: number;
  gender_category: GenderCategory;
  branch_ids: string[];
  /** In order; each one is accepted on its own screen. */
  terms: string[];
}
export interface ProposeEventResponse {
  id: string;
  status: 'draft' | 'published';
}

/** GET /api/events/form: what the event form offers. */
export interface EventFormMeta {
  branches: (Branch & { pillars: Pillar[] })[];
  /** Event types and their fixed points (shared/placeholders.ts until Points_And_Levels.md is in). */
  subtypes: { id: string; base_points: number }[];
  /** false = the event waits for an admin's approval. */
  publishes_directly: boolean;
  /** The signed-in user's events waiting for approval, and how many may wait at once. */
  waiting: number;
  max_waiting: number;
}

/** GET /api/events/:id */
export interface EventDetail extends EventSummary {
  description: string;
  terms_locked_at: string | null;
  branches: (Branch & { pillars: Pillar[] })[];
  terms: EventTerm[];
  participants: PublicUser[];
  my_registration: Registration | null;
  my_accepted_term_ids: string[];
  my_attendance: Attendance | null;
}

/** POST /api/events/:id/join, /join/complete, DELETE /join */
export interface RegistrationResponse {
  registration: Registration;
}

/** POST /api/events/:id/terms/:termId/accept */
export interface AcceptTermResponse {
  registration: Registration;
  accepted_term_ids: string[];
}

/** GET /api/events/:id/roster (supervisors of the event only) */
export interface RosterResponse {
  event: EventSummary;
  participants: { user: PublicUser; attendance: Attendance | null }[];
}

/** POST /api/events/:id/attendance/:userId/start and /end. `at` absent = now. */
export interface RecordTimeBody {
  at?: string; // ISO time
}

// ---------- attendance and points ----------

export interface AttendanceResponse {
  attendance: Attendance;
}

/** GET /api/me/attendance (a list), GET /api/attendance/:id */
export interface AttendanceItem {
  attendance: Attendance;
  event: Pick<AppEvent, 'id' | 'title' | 'address_text' | 'starts_at' | 'ends_at' | 'base_points'>;
  recorded_by: PublicUser | null;
  /** What these hours are worth by the points formula: earned once confirmed. */
  points: Record<Pillar, number>;
}

/** PUT /api/me/push-token (the phone signed in) and DELETE /api/me/push-token (it signed out). */
export interface PushTokenBody {
  token: string; // ExponentPushToken[…] from expo-notifications
  lang: 'ar' | 'en';
}

/** POST /api/attendance/:id/confirm */
export interface ConfirmResponse {
  attendance: Attendance;
  points_earned: Record<Pillar, number>;
  total_points: number;
  level: Level;
}

/** GET /api/me */
export interface MeResponse {
  user: User;
  points_by_pillar: Record<Pillar, number>;
  total_points: number;
  level: Level;
  next_level: Level | null;
  confirmed_hours: number;
  /** By level or by role (rules.canCreateEvents). */
  can_create_events: boolean;
  /** The first level that opens event creation, for "reach level N" (null if none does). */
  create_events_level: number | null;
}

/**
 * PUT /api/me/photo: a square JPEG (PHOTO_SIZE_PX a side, at most PHOTO_MAX_BYTES),
 * base64-encoded. The server removes its metadata (EXIF: place, phone model).
 * DELETE /api/me/photo removes it. GET /api/users/:id/photo serves it to whoever may see it.
 */
export interface PhotoBody {
  jpeg_base64: string;
}
export interface PhotoResponse {
  avatar_url: string;
}
