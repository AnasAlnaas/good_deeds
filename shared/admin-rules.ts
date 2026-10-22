// The admin panel's rules, written once like shared/rules.ts: pure functions
// that refuse (AdminError) or say what to write. The server calls them.
//
// ⚠️ ASSUMPTIONS: the planning notes do not cover editing events or settling
// disputes. These are first choices, each kept to one place here so it is
// easy to change once decided.

import { AdminError } from './errors';
import { MS_HOUR, effectiveStatus, round2, toMs } from './rules';
import type { AppEvent, Attendance, EventStatus, Role } from './types';

// ---------- roles ----------

/** An admin cannot change their own role, so there is always at least one admin left. */
export function assertCanChangeRole(actorId: string, targetId: string, _to: Role) {
  if (actorId === targetId) throw new AdminError('cannot_change_own_role');
}

// ---------- editing an event ----------

type Editable = Pick<AppEvent, 'starts_at' | 'ends_at' | 'subtype' | 'capacity' | 'gender_category'>;

/**
 * What may change in an existing event:
 * - nothing once it has finished or was cancelled;
 * - the terms never, once someone accepted one (terms_locked_at);
 * - the men / women / mixed category never, once someone joined;
 * - the seats never below the number already joined;
 * - the times and the type (which sets the points) never, once attendance was recorded;
 * - a published event keeps at least one supervisor, or nobody could record attendance.
 */
export function assertEventEdit(args: {
  event: AppEvent;
  next: Editable & { terms: string[]; organizerCount: number };
  currentTerms: string[];
  joinedCount: number;
  hasAttendance: boolean;
  now: number;
}) {
  const { event, next, now } = args;
  const status = effectiveStatus(event, now);
  if (status === 'finished' || status === 'cancelled' || status === 'rejected') throw new AdminError('event_not_editable');
  const termsChanged = next.terms.length !== args.currentTerms.length || next.terms.some((t, i) => t !== args.currentTerms[i]);
  if (event.terms_locked_at && termsChanged) throw new AdminError('terms_locked');
  if (args.joinedCount > 0 && next.gender_category !== event.gender_category) throw new AdminError('category_locked');
  if (next.capacity < args.joinedCount) throw new AdminError('capacity_below_joined');
  const timesOrTypeChanged =
    toMs(next.starts_at) !== toMs(event.starts_at) || toMs(next.ends_at) !== toMs(event.ends_at) || next.subtype !== event.subtype;
  if (args.hasAttendance && timesOrTypeChanged) throw new AdminError('locked_after_attendance');
  if (event.status !== 'draft' && next.organizerCount === 0) throw new AdminError('needs_organizer');
}

// ---------- publishing and cancelling ----------

/**
 * draft → published: only with at least one supervisor, or nobody could record attendance.
 * draft → rejected: turned down (a member's proposal) or dropped; it never shows in the app.
 * published → cancelled: only before any attendance was recorded (recorded hours are
 * someone's work; they are settled, not erased). A finished event stays as it is.
 */
export function decideStatusChange(args: {
  event: AppEvent;
  action: 'publish' | 'cancel' | 'reject';
  organizerCount: number;
  hasAttendance: boolean;
  now: number;
}): EventStatus {
  const { event, action } = args;
  const status = effectiveStatus(event, args.now);
  if (action === 'publish') {
    if (event.status !== 'draft') throw new AdminError('invalid_status_change');
    if (args.organizerCount === 0) throw new AdminError('needs_organizer');
    return 'published';
  }
  if (action === 'reject') {
    if (event.status !== 'draft') throw new AdminError('invalid_status_change');
    return 'rejected';
  }
  if (status !== 'published' && status !== 'running') throw new AdminError('invalid_status_change');
  if (args.hasAttendance) throw new AdminError('invalid_status_change');
  return 'cancelled';
}

// ---------- settling disputed hours ----------

/**
 * The hours that count after an admin looks at a disputed record. The record
 * then counts as confirmed and its points are credited like a confirmation.
 * Corrected hours must lie between 0 and the event's length.
 */
export function decideResolution(args: {
  attendance: Attendance;
  event: Pick<AppEvent, 'starts_at' | 'ends_at'>;
  decision: 'accept' | 'correct' | 'reject';
  hours?: number;
}): { hours: number } {
  const { attendance: a, event, decision } = args;
  if (a.participant_status !== 'disputed') throw new AdminError('not_disputed');
  // Settled only once the finish is known; the auto-close job would overwrite it otherwise.
  if (!a.ended_at) throw new AdminError('still_open');
  if (decision === 'accept') return { hours: a.hours ?? 0 };
  if (decision === 'reject') return { hours: 0 };
  const max = (toMs(event.ends_at) - toMs(event.starts_at)) / MS_HOUR;
  const hours = args.hours ?? -1;
  if (!(hours >= 0 && hours <= max)) throw new AdminError('hours_out_of_range');
  return { hours: round2(hours) };
}
