// Rule violations. The server sends the code as `{ "error": "<code>" }` and
// the app shows its own message for it (mobile/src/i18n/strings.ts → errors).

export type ApiErrorCode =
  | 'not_found'
  | 'event_closed'
  | 'event_not_started'
  | 'event_full'
  | 'gender_not_allowed'
  | 'terms_incomplete'
  | 'term_out_of_order'
  | 'already_joined'
  | 'not_joined'
  | 'cannot_cancel_after_attendance'
  | 'not_organizer'
  | 'cannot_record_self'
  | 'start_before_event'
  | 'time_in_future'
  | 'already_started'
  | 'not_started'
  | 'already_ended'
  | 'end_before_start'
  | 'end_after_event'
  | 'not_your_attendance'
  | 'already_acted'
  | 'cannot_create_events'
  | 'category_not_allowed'
  | 'starts_in_past'
  | 'too_many_proposals';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

// Refusals that only the admin panel can meet (admin/src/strings.ts → errors).
export type AdminErrorCode =
  | 'forbidden'
  | 'cannot_change_own_role'
  | 'event_not_editable'
  | 'terms_locked'
  | 'capacity_below_joined'
  | 'category_locked'
  | 'locked_after_attendance'
  | 'needs_organizer'
  | 'invalid_status_change'
  | 'not_disputed'
  | 'still_open'
  | 'hours_out_of_range';

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  constructor(code: AdminErrorCode) {
    super(code);
    this.name = 'AdminError';
    this.code = code;
  }
}
