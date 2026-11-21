// Following (owner's decisions, 2026-11-21): institutions, supervisors and the
// classes of good works. A followed supervisor's events are those they
// proposed; followers are told once when such an event is published, if they
// may join it. Who follows whom is private.

import type { User } from './types';

export type FollowKind = 'institution' | 'person' | 'class';

/** Supervisors can be followed (owner's decision: supervisors and institutions). */
export function canFollowPerson(person: Pick<User, 'role'>) {
  return person.role === 'supervisor';
}
