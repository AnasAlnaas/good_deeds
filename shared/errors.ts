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
  | 'already_acted';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}
