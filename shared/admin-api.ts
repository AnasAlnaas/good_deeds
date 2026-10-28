// What the admin endpoints (/api/admin/…) take and send back. The server
// builds these and the admin panel (admin/) reads them. Only users whose role
// is `admin` may call them; anyone else gets 403 `forbidden`.

import type { EventProposal, PublicUser } from './api';
import type { EventClassId } from './classes';
import type {
  AppEvent,
  Attendance,
  Branch,
  EventStatus,
  EventTerm,
  Registration,
  Report,
  Role,
  User,
  Warning,
} from './types';

/** GET /api/admin/overview */
export interface AdminOverview {
  users: number;
  upcoming_events: number;
  running_events: number;
  draft_events: number;
  /** Hours recorded and waiting for the participant to confirm them. */
  awaiting_confirmation: number;
  open_disputes: number;
  /** Drafts made in the app by members and supervisors, waiting for an admin to publish or turn them down. */
  proposals_waiting: number;
  /** Members' reports nobody has handled yet. */
  open_reports: number;
  /** Warnings the member appealed, waiting for an admin to keep or withdraw them. */
  appealed_warnings: number;
}

/** GET /api/admin/meta: what the event form offers. */
export interface AdminMeta {
  branches: Branch[];
  /** Event types, their fixed points (shared/placeholders.ts until Points_And_Levels.md is in) and their class. */
  subtypes: { id: string; base_points: number; event_class: EventClassId }[];
  /** Everyone who can be named a supervisor of an event. */
  people: (PublicUser & Pick<User, 'role' | 'phone'>)[];
}

// ---------- users ----------

/** GET /api/admin/users?q= (name or phone) */
export interface AdminUserRow
  extends Pick<
    User,
    'id' | 'full_name' | 'phone' | 'gender' | 'city' | 'avatar_url' | 'role' | 'level' | 'total_points' | 'is_association_member' | 'created_at'
  > {
  confirmed_hours: number;
  /** Warnings that stand (not withdrawn). */
  warnings: number;
}

/** PATCH /api/admin/users/:id */
export interface ChangeRoleBody {
  role: Role;
}

// DELETE /api/admin/users/:id/photo: removes an unsuitable profile photo. The
// member is told, and may add another. Admins see every photo (GET /api/users/:id/photo).


// ---------- events ----------

/** POST /api/admin/events and PUT /api/admin/events/:id. Times are ISO. Points come from the subtype. */
export interface EventInput extends EventProposal {
  organizer_ids: string[];
}

export interface CreateEventBody extends EventInput {
  /** true = visible in the app at once; false = saved as a draft. */
  publish: boolean;
}

/** GET /api/admin/events (one per event, drafts and cancelled included) */
export interface AdminEventRow {
  event: AppEvent;
  /** published → running → finished by the clock; draft and cancelled stay as they are. */
  effective_status: EventStatus;
  joined_count: number;
  organizers: PublicUser[];
  /** Who made it. Not an admin = proposed in the app. */
  creator: (PublicUser & Pick<User, 'role' | 'level'>) | null;
}

/**
 * POST /api/admin/events/:id/publish | cancel | reject
 * publish: a draft goes live · reject: a draft is turned down (never shown in the app) ·
 * cancel: a published event is called off. `note` (reject only) is sent to whoever proposed it.
 */
export interface StatusChangeBody {
  note?: string;
}

/** GET /api/admin/events/:id */
export interface AdminEventDetail extends AdminEventRow {
  branches: Branch[];
  terms: EventTerm[];
  participants: { user: PublicUser & Pick<User, 'phone'>; registration: Registration; attendance: Attendance | null }[];
}

// ---------- disputed hours ----------

/** GET /api/admin/disputes */
export interface DisputeRow {
  attendance: Attendance;
  user: PublicUser & Pick<User, 'phone'>;
  event: Pick<AppEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'base_points'>;
  recorded_by: PublicUser | null;
}

/**
 * POST /api/admin/disputes/:attendanceId/resolve
 * accept: the recorded hours stand · correct: `hours` replace them · reject: they count as 0.
 * The note is required: it is what the audit log keeps of the reason.
 */
export interface ResolveDisputeBody {
  decision: 'accept' | 'correct' | 'reject';
  hours?: number;
  note: string;
}

// ---------- hours report ----------

/** GET /api/admin/reports/hours?from=YYYY-MM-DD&to=YYYY-MM-DD: confirmed hours, by person, for activity in [from, to]. */
export interface HoursReportRow extends Pick<User, 'full_name' | 'phone' | 'city' | 'gender'> {
  user_id: string;
  events: number;
  hours: number;
  total_points: number;
}

// ---------- members' reports (بلاغ) ----------
// (Not to be confused with the hours report above: /reports/hours.)

/** GET /api/admin/reports?status=open|handled (latest first; every report without `status`) */
export interface AdminReportRow {
  report: Report;
  reporter: (PublicUser & Pick<User, 'phone'>) | null;
  event: Pick<AppEvent, 'id' | 'title' | 'starts_at'> | null;
  /** The person named. They are never told. */
  subject: (PublicUser & Pick<User, 'phone'>) | null;
  handled_by: PublicUser | null;
}

/**
 * POST /api/admin/reports/:id/handle. The note (required) says what was done; it
 * goes to the audit log. The reporter is told their report was looked at, not the note.
 */
export interface HandleReportBody {
  note: string;
}

// ---------- warnings (إنذار) ----------

/** GET /api/admin/warnings?status=&user_id= (latest first) */
export interface AdminWarningRow {
  warning: Warning;
  user: PublicUser & Pick<User, 'phone'>;
  event: Pick<AppEvent, 'id' | 'title' | 'starts_at'>;
  issued_by: PublicUser | null;
  decided_by: PublicUser | null;
}

/**
 * POST /api/admin/warnings/:id/decide
 * uphold: answers an appeal; the warning stands · withdraw: it is taken back, with or without an appeal.
 * The note is required: the member reads it in the app, and the audit log keeps it.
 */
export interface DecideWarningBody {
  decision: 'uphold' | 'withdraw';
  note: string;
}

// ---------- audit log ----------

export type AdminAction =
  | 'change_role'
  | 'create_event'
  | 'update_event'
  | 'publish_event'
  | 'cancel_event'
  | 'reject_event'
  | 'resolve_dispute'
  | 'remove_photo'
  | 'handle_report'
  | 'uphold_warning'
  | 'withdraw_warning';

/** GET /api/admin/audit (newest first) */
export interface AuditEntry {
  id: string;
  actor: PublicUser | null;
  action: AdminAction;
  target_id: string;
  /** What changed, e.g. { from: 'member', to: 'supervisor' }. */
  details: Record<string, unknown>;
  created_at: string;
}
