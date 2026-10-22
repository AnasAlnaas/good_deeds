// Mirrors the tables in Data_Model.md. Times are ISO strings.
// Shared by the server (server/) and the app (mobile/): the server's database
// schema (server/src/db/schema.ts) has the same tables and column names.
// Anything marked DEMO-ONLY is not in Data_Model.md and needs a decision.

export type Pillar = 'spiritual' | 'mental' | 'physical';
export const PILLARS: Pillar[] = ['spiritual', 'mental', 'physical'];

export type Gender = 'male' | 'female';
export type GenderCategory = 'male' | 'female' | 'mixed';
export type Role = 'member' | 'supervisor' | 'admin';

export interface User {
  id: string;
  full_name: string;
  gender: Gender;
  phone: string;
  email: string | null;
  city: string;
  avatar_url: string | null;
  role: Role;
  level: number;
  total_points: number;
  is_association_member: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface Branch {
  id: string;
  name_ar: string;
  name_en: string; // DEMO-ONLY: Data_Model has name_ar only; needed for the English UI
  source_ref: string;
  is_agreed: boolean;
  is_active: boolean;
}

export interface BranchPillar {
  branch_id: string;
  pillar: Pillar;
}

// Not in Data_Model.md yet: `rejected` = a draft an admin turned down (or dropped)
// instead of publishing it. Like a draft, nobody but its creator sees it in the app.
export type EventStatus = 'draft' | 'published' | 'running' | 'finished' | 'cancelled' | 'rejected';

export interface AppEvent {
  id: string;
  title: string;
  description: string;
  subtype: string;
  image_url: string | null;
  lat: number;
  lng: number;
  address_text: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  gender_category: GenderCategory;
  base_points: number;
  status: EventStatus;
  terms_locked_at: string | null;
  created_by: string;
  created_at: string;
}

// DEMO-ONLY: Data_Model says "recorded_by = a supervisor of THIS event"
// but has no table saying who supervises which event.
export interface EventOrganizer {
  event_id: string;
  user_id: string;
}

export interface EventBranch {
  event_id: string;
  branch_id: string;
}

export interface EventTerm {
  id: string;
  event_id: string;
  order_index: number;
  text: string | null;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
}

export type RegistrationStatus = 'pending_terms' | 'joined' | 'cancelled';

export interface Registration {
  id: string;
  event_id: string;
  user_id: string;
  status: RegistrationStatus;
  joined_at: string | null;
  created_at: string;
}

export interface TermAcceptance {
  id: string;
  registration_id: string;
  term_id: string;
  accepted_at: string;
}

export type StartSource = 'live' | 'backdated';
export type EndSource = 'live' | 'backdated' | 'auto_closed';
export type ParticipantStatus = 'pending' | 'confirmed' | 'disputed';

export interface Attendance {
  id: string;
  event_id: string;
  user_id: string;
  started_at: string;
  start_source: StartSource;
  ended_at: string | null;
  end_source: EndSource | null;
  hours: number | null;
  recorded_by: string;
  recorded_at: string;
  participant_status: ParticipantStatus;
  participant_acted_at: string | null;
}

export interface PointsLedgerEntry {
  id: string;
  user_id: string;
  event_id: string;
  pillar: Pillar;
  points: number;
  reason: string;
  created_at: string;
}

export interface Level {
  level: number;
  min_points: number;
  can_create_events: boolean;
  can_report: boolean;
}

// ---------- reports (بلاغ) and warnings (إنذار) ----------
// Kept apart, as the master file decides: a member reports, a supervisor warns.

// Data_Model.md has `reports: id · reporter_id · target_type · target_id · note · status`.
// Owner's decision (2026-10-22): a report is about anything, by category, with an
// optional note; it may be tied to an event the reporter was at, and name someone
// at that event. So it has an optional event and an optional person in place of
// the one target. Not in Data_Model.md yet: category, event_id and subject_id
// (instead of target_type · target_id), created_at, and who handled it, when and how.
export type ReportCategory = 'behaviour' | 'safety' | 'event' | 'app' | 'other';
export const REPORT_CATEGORIES: ReportCategory[] = ['behaviour', 'safety', 'event', 'app', 'other'];
export type ReportStatus = 'open' | 'handled';

export interface Report {
  id: string;
  reporter_id: string;
  category: ReportCategory;
  event_id: string | null;
  /** The person named, someone at that event. They are never told. */
  subject_id: string | null;
  note: string | null;
  status: ReportStatus;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
  /** What the admin did about it. Kept for the association; the reporter does not see it. */
  handled_note: string | null;
}

// Data_Model.md has `warnings: id · user_id · issued_by · reason · severity · status · appealed_at · created_at`.
// Owner's decisions (2026-10-23): one kind of warning, so no severity; the member
// may appeal once and an admin keeps the warning or withdraws it. Not in
// Data_Model.md yet: event_id (the event it was given at), the appeal's reason,
// and who decided, when and why.
// active → appealed → upheld | withdrawn; an admin may also withdraw an active or upheld one.
export type WarningStatus = 'active' | 'appealed' | 'upheld' | 'withdrawn';

export interface Warning {
  id: string;
  user_id: string;
  issued_by: string;
  event_id: string;
  reason: string;
  status: WarningStatus;
  created_at: string;
  appealed_at: string | null;
  appeal_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  /** The admin's reason for keeping or withdrawing it, shown to the member. */
  decision_note: string | null;
}

export interface Db {
  version: number;
  users: User[];
  branches: Branch[];
  branch_pillars: BranchPillar[];
  events: AppEvent[];
  event_organizers: EventOrganizer[];
  event_branches: EventBranch[];
  event_terms: EventTerm[];
  registrations: Registration[];
  term_acceptances: TermAcceptance[];
  attendance: Attendance[];
  points_ledger: PointsLedgerEntry[];
  levels: Level[];
  reports: Report[];
  warnings: Warning[];
}
