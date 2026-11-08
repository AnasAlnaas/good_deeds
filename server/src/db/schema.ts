// The database tables. Names and columns match shared/types.ts, which mirrors
// Data_Model.md; src/db/rows.ts checks at compile time that they still agree.
// After changing this file: npm run db:generate (writes a migration in drizzle/).

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const gender = pgEnum('gender', ['male', 'female']);
export const genderCategory = pgEnum('gender_category', ['male', 'female', 'mixed']);
export const role = pgEnum('role', ['member', 'supervisor', 'admin']);
export const eventStatus = pgEnum('event_status', ['draft', 'published', 'running', 'finished', 'cancelled', 'rejected']);
export const registrationStatus = pgEnum('registration_status', ['pending_terms', 'joined', 'cancelled']);
export const startSource = pgEnum('start_source', ['live', 'backdated']);
export const endSource = pgEnum('end_source', ['live', 'backdated', 'auto_closed']);
export const participantStatus = pgEnum('participant_status', ['pending', 'confirmed', 'disputed']);
export const lang = pgEnum('lang', ['ar', 'en']);
export const locationType = pgEnum('location_type', ['in_person', 'online']);
export const meetingPlatform = pgEnum('meeting_platform', ['zoom', 'meet', 'teams', 'telegram', 'other']);
export const adminAction = pgEnum('admin_action', [
  'change_role',
  'create_event',
  'update_event',
  'publish_event',
  'cancel_event',
  'resolve_dispute',
  'reject_event',
  'remove_photo',
  'handle_report',
  'uphold_warning',
  'withdraw_warning',
  'issue_reset_code',
]);
export const reportCategory = pgEnum('report_category', ['behaviour', 'safety', 'event', 'app', 'other']);
export const reportStatus = pgEnum('report_status', ['open', 'handled']);
export const warningStatus = pgEnum('warning_status', ['active', 'appealed', 'upheld', 'withdrawn']);

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const points = (name: string) => numeric(name, { precision: 10, scale: 2, mode: 'number' });
// node-postgres sends a Buffer as bytea (PGlite takes either); both read back a Uint8Array subclass.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    full_name: text('full_name').notNull(),
    gender: gender('gender').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    city: text('city').notNull(),
    avatar_url: text('avatar_url'),
    role: role('role').notNull().default('member'),
    level: integer('level').notNull().default(1),
    total_points: points('total_points').notNull().default(0),
    is_association_member: boolean('is_association_member').notNull().default(false),
    created_at: at('created_at').notNull().defaultNow(),
    deleted_at: at('deleted_at'),
  },
  // A deleted account frees its phone number and email address for a new sign-up.
  // Emails are stored in lowercase (rules.cleanEmail). Accounts from before
  // email addresses (and the demo people) have none.
  (t) => [
    uniqueIndex('users_phone_active').on(t.phone).where(sql`${t.deleted_at} is null`),
    uniqueIndex('users_email_active').on(t.email).where(sql`${t.deleted_at} is null`),
  ],
);

export const branches = pgTable('branches', {
  id: text('id').primaryKey(),
  name_ar: text('name_ar').notNull(),
  name_en: text('name_en').notNull(),
  source_ref: text('source_ref').notNull(),
  is_agreed: boolean('is_agreed').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
});

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    subtype: text('subtype').notNull(),
    image_url: text('image_url'),
    // In a place: the address and the pin. Online: the platform and the link (shared/rules.ts cleanPlace).
    location_type: locationType('location_type').notNull().default('in_person'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    address_text: text('address_text'),
    meeting_platform: meetingPlatform('meeting_platform'),
    meeting_url: text('meeting_url'),
    starts_at: at('starts_at').notNull(),
    ends_at: at('ends_at').notNull(),
    capacity: integer('capacity').notNull(),
    gender_category: genderCategory('gender_category').notNull(),
    base_points: integer('base_points').notNull(),
    status: eventStatus('status').notNull().default('draft'),
    terms_locked_at: at('terms_locked_at'),
    created_by: text('created_by').notNull().references(() => users.id),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('events_ends_after_start', sql`${t.ends_at} > ${t.starts_at}`),
    check('events_capacity_positive', sql`${t.capacity} > 0`),
    check(
      'events_place_matches_type',
      sql`(${t.location_type} = 'in_person' and ${t.lat} is not null and ${t.lng} is not null and ${t.address_text} is not null and ${t.meeting_url} is null)
        or (${t.location_type} = 'online' and ${t.meeting_platform} is not null and ${t.meeting_url} is not null and ${t.lat} is null and ${t.lng} is null)`,
    ),
  ],
);

/**
 * The "the link is open" notification of an online event, sent once for each
 * start time it had: moving the start sends it again for the new one.
 */
export const meeting_link_reminders = pgTable('meeting_link_reminders', {
  event_id: text('event_id').primaryKey().references(() => events.id),
  starts_at: at('starts_at').notNull(),
  sent_at: at('sent_at').notNull(),
});

// DEMO-ONLY in Data_Model.md: who supervises which event.
export const event_organizers = pgTable(
  'event_organizers',
  {
    event_id: text('event_id').notNull().references(() => events.id),
    user_id: text('user_id').notNull().references(() => users.id),
    /** Who made them a supervisor in the app; null = named when the event was made (shared/types.ts EventOrganizer). */
    added_by: text('added_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.event_id, t.user_id] }), index('event_organizers_user').on(t.user_id)],
);

// A supervisor's notice to the people of an event (shared/types.ts EventNotice): an announcement or a question.
export const noticeKind = pgEnum('notice_kind', ['announcement', 'question']);

export const event_notices = pgTable(
  'event_notices',
  {
    id: text('id').primaryKey(),
    event_id: text('event_id').notNull().references(() => events.id),
    author_id: text('author_id').notNull().references(() => users.id),
    kind: noticeKind('kind').notNull().default('announcement'),
    body: text('body').notNull(),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [index('event_notices_event').on(t.event_id, t.created_at)],
);

// One reaction per person per notice (shared/types.ts NoticeReaction).
export const noticeReaction = pgEnum('notice_reaction', ['noted', 'agree', 'disagree', 'undecided', 'sad']);

export const notice_reactions = pgTable(
  'notice_reactions',
  {
    notice_id: text('notice_id').notNull().references(() => event_notices.id),
    user_id: text('user_id').notNull().references(() => users.id),
    reaction: noticeReaction('reaction').notNull(),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notice_id, t.user_id] })],
);

export const event_terms = pgTable(
  'event_terms',
  {
    id: text('id').primaryKey(),
    event_id: text('event_id').notNull().references(() => events.id),
    order_index: integer('order_index').notNull(),
    text: text('text'),
    image_url: text('image_url'),
    audio_url: text('audio_url'),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_terms_order').on(t.event_id, t.order_index)],
);

// A lesson's picture (shared/types.ts LessonImage; the demo's data_url is the
// jpeg here): an infographic or a diagram, kept in the database like profile
// photos. Removed with the last lesson that shows it, or after a while if no
// lesson ever did (src/lesson-images.ts).
export const lesson_images = pgTable('lesson_images', {
  id: text('id').primaryKey(),
  /** A JPEG with its metadata removed (src/photo.ts). */
  jpeg: bytea('jpeg').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  uploaded_by: text('uploaded_by').notNull().references(() => users.id),
  created_at: at('created_at').notNull(),
});

// An event's learning corner (shared/types.ts EventLesson): read before joining, approved with the event.
export const event_lessons = pgTable(
  'event_lessons',
  {
    id: text('id').primaryKey(),
    event_id: text('event_id').notNull().references(() => events.id),
    order_index: integer('order_index').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    image_id: text('image_id').references(() => lesson_images.id),
    /** A YouTube video's id, never a link (shared/rules.ts youtubeId). */
    video_id: text('video_id'),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_lessons_order').on(t.event_id, t.order_index)],
);

// Who learned which lesson (shared/types.ts LessonCompletion). Kept after a registration is cancelled.
export const lesson_completions = pgTable(
  'lesson_completions',
  {
    lesson_id: text('lesson_id').notNull().references(() => event_lessons.id),
    user_id: text('user_id').notNull().references(() => users.id),
    learned_at: at('learned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.lesson_id, t.user_id] }), index('lesson_completions_user').on(t.user_id, t.learned_at)],
);

export const registrations = pgTable(
  'registrations',
  {
    id: text('id').primaryKey(),
    event_id: text('event_id').notNull().references(() => events.id),
    user_id: text('user_id').notNull().references(() => users.id),
    status: registrationStatus('status').notNull(),
    joined_at: at('joined_at'),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('registrations_event_user').on(t.event_id, t.user_id), index('registrations_user').on(t.user_id)],
);

export const term_acceptances = pgTable(
  'term_acceptances',
  {
    id: text('id').primaryKey(),
    registration_id: text('registration_id').notNull().references(() => registrations.id),
    term_id: text('term_id').notNull().references(() => event_terms.id),
    accepted_at: at('accepted_at').notNull(),
  },
  (t) => [uniqueIndex('term_acceptances_once').on(t.registration_id, t.term_id)],
);

export const attendance = pgTable(
  'attendance',
  {
    id: text('id').primaryKey(),
    event_id: text('event_id').notNull().references(() => events.id),
    user_id: text('user_id').notNull().references(() => users.id),
    started_at: at('started_at').notNull(),
    start_source: startSource('start_source').notNull(),
    ended_at: at('ended_at'),
    end_source: endSource('end_source'),
    hours: numeric('hours', { precision: 6, scale: 2, mode: 'number' }),
    recorded_by: text('recorded_by').notNull().references(() => users.id),
    recorded_at: at('recorded_at').notNull(),
    participant_status: participantStatus('participant_status').notNull().default('pending'),
    participant_acted_at: at('participant_acted_at'),
  },
  (t) => [
    uniqueIndex('attendance_event_user').on(t.event_id, t.user_id),
    index('attendance_user').on(t.user_id),
    // The auto-close job looks only at attendance still open.
    index('attendance_open').on(t.event_id).where(sql`${t.ended_at} is null`),
    check('attendance_ends_after_start', sql`${t.ended_at} is null or ${t.ended_at} > ${t.started_at}`),
  ],
);

// Points are only ever added: a correction is a new row, never an edit.
export const points_ledger = pgTable(
  'points_ledger',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    event_id: text('event_id').notNull().references(() => events.id),
    points: points('points').notNull(),
    reason: text('reason').notNull(),
    created_at: at('created_at').notNull().defaultNow(),
  },
  (t) => [index('points_ledger_user').on(t.user_id)],
);

export const levels = pgTable('levels', {
  level: integer('level').primaryKey(),
  min_points: integer('min_points').notNull(),
  can_create_events: boolean('can_create_events').notNull(),
  can_report: boolean('can_report').notNull(),
});

// A member tells the association about something (shared/types.ts Report: how
// it differs from Data_Model.md). Only admins read reports.
export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporter_id: text('reporter_id').notNull().references(() => users.id),
    category: reportCategory('category').notNull(),
    event_id: text('event_id').references(() => events.id),
    subject_id: text('subject_id').references(() => users.id),
    note: text('note'),
    status: reportStatus('status').notNull().default('open'),
    created_at: at('created_at').notNull(),
    handled_by: text('handled_by').references(() => users.id),
    handled_at: at('handled_at'),
    handled_note: text('handled_note'),
  },
  (t) => [index('reports_status').on(t.status, t.created_at), index('reports_reporter').on(t.reporter_id)],
);

// A supervisor's warning to someone at their event (shared/types.ts Warning:
// how it differs from Data_Model.md). Seen by that member and admins only.
export const warnings = pgTable(
  'warnings',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    issued_by: text('issued_by').notNull().references(() => users.id),
    event_id: text('event_id').notNull().references(() => events.id),
    reason: text('reason').notNull(),
    status: warningStatus('status').notNull().default('active'),
    created_at: at('created_at').notNull(),
    appealed_at: at('appealed_at'),
    appeal_reason: text('appeal_reason'),
    decided_by: text('decided_by').references(() => users.id),
    decided_at: at('decided_at'),
    decision_note: text('decision_note'),
  },
  (t) => [
    index('warnings_user').on(t.user_id),
    // One warning per supervisor, person and event (rules.assertCanWarn); a withdrawn one may be given again.
    uniqueIndex('warnings_once').on(t.event_id, t.user_id, t.issued_by).where(sql`${t.status} <> 'withdrawn'`),
  ],
);

// Not in Data_Model.md yet: profile photos, kept in the database so the server
// needs no file storage. users.avatar_url points at GET /api/users/:id/photo.
export const user_photos = pgTable('user_photos', {
  user_id: text('user_id').primaryKey().references(() => users.id),
  /** A small JPEG with its metadata removed (src/photo.ts). */
  jpeg: bytea('jpeg').notNull(),
  updated_at: at('updated_at').notNull(),
});

// One-time sign-in codes. Only a hash of the code is stored.
export const login_codes = pgTable(
  'login_codes',
  {
    id: text('id').primaryKey(),
    phone: text('phone').notNull(),
    code_hash: text('code_hash').notNull(),
    expires_at: at('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    created_at: at('created_at').notNull(),
    consumed_at: at('consumed_at'),
    /** The admin who made it, for a password reset; empty for a code sent by SMS. */
    issued_by: text('issued_by').references(() => users.id),
  },
  (t) => [index('login_codes_phone').on(t.phone, t.created_at)],
);

// A one-time code sent to an email address (routes/auth.ts, routes/me.ts):
// to confirm the address before an account is made with it (sign_up) or before
// it replaces the account's address (change_email), or to choose a new
// password (reset_password). Only a hash of the code is kept.
export const emailCodePurpose = pgEnum('email_code_purpose', ['sign_up', 'reset_password', 'change_email']);

export const email_codes = pgTable(
  'email_codes',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    purpose: emailCodePurpose('purpose').notNull(),
    /** The account it is for: the one whose password is reset, or whose address changes. Empty for a sign-up. */
    user_id: text('user_id').references(() => users.id),
    code_hash: text('code_hash').notNull(),
    expires_at: at('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    created_at: at('created_at').notNull(),
    consumed_at: at('consumed_at'),
  },
  (t) => [index('email_codes_email').on(t.email, t.created_at)],
);

// A person's password, apart from `users` so it never travels with a user row.
// Only a slow hash is kept (server/src/password.ts). No row = no password yet
// (an account made before passwords): it is set with a reset code.
// Wrong passwords are counted here, per account, over a day (routes/auth.ts).
export const user_passwords = pgTable('user_passwords', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => users.id),
  hash: text('hash').notNull(),
  failed_count: integer('failed_count').notNull().default(0),
  failed_since: at('failed_since'),
  updated_at: at('updated_at').notNull(),
});

// Not in Data_Model.md yet: where to send a person's notifications. One row
// per phone; signing in on a phone moves its token to the new account.
export const push_tokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    user_id: text('user_id').notNull().references(() => users.id),
    /** The app's language on that phone, so the notification reads the same. */
    lang: lang('lang').notNull(),
    created_at: at('created_at').notNull(),
    updated_at: at('updated_at').notNull(),
  },
  (t) => [index('push_tokens_user').on(t.user_id)],
);

// Not in Data_Model.md yet: every admin decision, who made it and when.
// Rows are only ever added, like the points ledger.
export const admin_actions = pgTable(
  'admin_actions',
  {
    id: text('id').primaryKey(),
    /** Empty when done from the server's command line (npm run make-admin). */
    actor_id: text('actor_id').references(() => users.id),
    action: adminAction('action').notNull(),
    target_id: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    created_at: at('created_at').notNull(),
  },
  (t) => [index('admin_actions_created').on(t.created_at)],
);
