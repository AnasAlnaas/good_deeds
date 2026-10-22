// The database tables. Names and columns match shared/types.ts, which mirrors
// Data_Model.md; src/db/rows.ts checks at compile time that they still agree.
// After changing this file: npm run db:generate (writes a migration in drizzle/).

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const pillar = pgEnum('pillar', ['spiritual', 'mental', 'physical']);
export const gender = pgEnum('gender', ['male', 'female']);
export const genderCategory = pgEnum('gender_category', ['male', 'female', 'mixed']);
export const role = pgEnum('role', ['member', 'supervisor', 'admin']);
export const eventStatus = pgEnum('event_status', ['draft', 'published', 'running', 'finished', 'cancelled']);
export const registrationStatus = pgEnum('registration_status', ['pending_terms', 'joined', 'cancelled']);
export const startSource = pgEnum('start_source', ['live', 'backdated']);
export const endSource = pgEnum('end_source', ['live', 'backdated', 'auto_closed']);
export const participantStatus = pgEnum('participant_status', ['pending', 'confirmed', 'disputed']);
export const lang = pgEnum('lang', ['ar', 'en']);

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const points = (name: string) => numeric(name, { precision: 10, scale: 2, mode: 'number' });

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
  // A deleted account frees its phone number for a new sign-up.
  (t) => [uniqueIndex('users_phone_active').on(t.phone).where(sql`${t.deleted_at} is null`)],
);

export const branches = pgTable('branches', {
  id: text('id').primaryKey(),
  name_ar: text('name_ar').notNull(),
  name_en: text('name_en').notNull(),
  source_ref: text('source_ref').notNull(),
  is_agreed: boolean('is_agreed').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
});

export const branch_pillars = pgTable(
  'branch_pillars',
  {
    branch_id: text('branch_id').notNull().references(() => branches.id),
    pillar: pillar('pillar').notNull(),
  },
  (t) => [primaryKey({ columns: [t.branch_id, t.pillar] })],
);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    subtype: text('subtype').notNull(),
    image_url: text('image_url'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    address_text: text('address_text').notNull(),
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
  ],
);

// DEMO-ONLY in Data_Model.md: who supervises which event.
export const event_organizers = pgTable(
  'event_organizers',
  {
    event_id: text('event_id').notNull().references(() => events.id),
    user_id: text('user_id').notNull().references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.event_id, t.user_id] }), index('event_organizers_user').on(t.user_id)],
);

export const event_branches = pgTable(
  'event_branches',
  {
    event_id: text('event_id').notNull().references(() => events.id),
    branch_id: text('branch_id').notNull().references(() => branches.id),
  },
  (t) => [primaryKey({ columns: [t.event_id, t.branch_id] })],
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
    pillar: pillar('pillar').notNull(),
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
  },
  (t) => [index('login_codes_phone').on(t.phone, t.created_at)],
);

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
