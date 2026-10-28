// Rows come out of the database with Date objects; the app and the shared
// rules use ISO strings. `iso()` converts a row read from the database and
// `dated()` converts a shared-type row for writing. The type checks at the end
// stop compiling if schema.ts and shared/types.ts no longer agree.

import type * as T from '../../../shared/types';
import type * as s from './schema';

type Iso<R> = { [K in keyof R]: R[K] extends Date ? string : R[K] extends Date | null ? string | null : R[K] };
type Dated<R> = {
  [K in keyof R]: K extends `${string}_at` ? (R[K] extends string ? Date : R[K] extends string | null ? Date | null : R[K]) : R[K];
};

export function iso<R extends object>(row: R): Iso<R> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as Iso<R>;
}

/** Every column whose name ends in `_at` is a timestamp. */
export function dated<R extends object>(row: R): Dated<R> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = k.endsWith('_at') && typeof v === 'string' ? new Date(v) : v;
  return out as Dated<R>;
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<X extends true> = X;
type Row<Table extends { $inferSelect: object }> = Iso<Table['$inferSelect']>;

export type SchemaMatchesSharedTypes = [
  Assert<Same<Row<typeof s.users>, T.User>>,
  Assert<Same<Row<typeof s.branches>, T.Branch>>,
  Assert<Same<Row<typeof s.events>, T.AppEvent>>,
  Assert<Same<Row<typeof s.event_organizers>, T.EventOrganizer>>,
  Assert<Same<Row<typeof s.event_branches>, T.EventBranch>>,
  Assert<Same<Row<typeof s.event_terms>, T.EventTerm>>,
  Assert<Same<Row<typeof s.registrations>, T.Registration>>,
  Assert<Same<Row<typeof s.term_acceptances>, T.TermAcceptance>>,
  Assert<Same<Row<typeof s.attendance>, T.Attendance>>,
  Assert<Same<Row<typeof s.points_ledger>, T.PointsLedgerEntry>>,
  Assert<Same<Row<typeof s.levels>, T.Level>>,
  Assert<Same<Row<typeof s.reports>, T.Report>>,
  Assert<Same<Row<typeof s.warnings>, T.Warning>>,
];
