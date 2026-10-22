// What the admin endpoints (/api/admin/…) take and send back. The server
// builds these and the admin panel (admin/) reads them. Only users whose role
// is `admin` may call them; anyone else gets 403 `forbidden`.

import type { PublicUser } from './api';
import type {
  AppEvent,
  Attendance,
  Branch,
  EventStatus,
  EventTerm,
  GenderCategory,
  Pillar,
  Registration,
  Role,
  User,
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
}

/** GET /api/admin/meta: what the event form offers. */
export interface AdminMeta {
  branches: (Branch & { pillars: Pillar[] })[];
  /** Event types and their fixed points (shared/placeholders.ts until Points_And_Levels.md is in). */
  subtypes: { id: string; base_points: number }[];
  /** Everyone who can be named a supervisor of an event. */
  people: (PublicUser & Pick<User, 'role' | 'phone'>)[];
}

// ---------- users ----------

/** GET /api/admin/users?q= (name or phone) */
export interface AdminUserRow
  extends Pick<User, 'id' | 'full_name' | 'phone' | 'gender' | 'city' | 'role' | 'level' | 'total_points' | 'is_association_member' | 'created_at'> {
  confirmed_hours: number;
}

/** PATCH /api/admin/users/:id */
export interface ChangeRoleBody {
  role: Role;
}

// ---------- events ----------

/** POST /api/admin/events and PUT /api/admin/events/:id. Times are ISO. Points come from the subtype. */
export interface EventInput {
  title: string;
  description: string;
  subtype: string;
  address_text: string;
  lat: number;
  lng: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  gender_category: GenderCategory;
  branch_ids: string[];
  organizer_ids: string[];
  /** In order; each one is accepted on its own screen. */
  terms: string[];
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
}

/** GET /api/admin/events/:id */
export interface AdminEventDetail extends AdminEventRow {
  branches: (Branch & { pillars: Pillar[] })[];
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
  points: Record<Pillar, number>;
  total_points: number;
}

// ---------- audit log ----------

export type AdminAction = 'change_role' | 'create_event' | 'update_event' | 'publish_event' | 'cancel_event' | 'resolve_dispute';

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
