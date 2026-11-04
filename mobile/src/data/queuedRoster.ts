// The roster as it will be once the supervisor's records kept on the phone
// (outbox.ts) reach the server. Apart from outbox.ts, which needs the phone's
// storage, so scripts/check-rules.ts can test it.

import { round2, toIso, toMs } from '../../../shared/rules';
import type { RosterResponse } from '../../../shared/api';
import type { Attendance } from '../../../shared/types';

export interface QueuedRecord {
  id: string;
  kind: 'start' | 'end';
  eventId: string;
  userId: string;
  /** For the supervisor's messages: whose record it is. */
  name: string;
  /** The time chosen on the record screen; absent = when it was tapped. */
  at?: number;
  /** When it was tapped. */
  recordedAt: number;
}

export type RosterEntry = RosterResponse['participants'][number] & { queued: boolean };

export function rosterWithQueued(roster: RosterResponse, queued: QueuedRecord[]): RosterEntry[] {
  const mine = queued.filter((q) => q.eventId === roster.event.id);
  return roster.participants.map((p) => {
    let a: Attendance | null = p.attendance;
    let isQueued = false;
    for (const q of mine) {
      if (q.userId !== p.user.id) continue;
      const time = q.at ?? q.recordedAt;
      if (q.kind === 'start' && !a) {
        a = {
          id: q.id,
          event_id: q.eventId,
          user_id: q.userId,
          started_at: toIso(time),
          start_source: q.recordedAt - time > 60_000 ? 'backdated' : 'live',
          ended_at: null,
          end_source: null,
          hours: null,
          recorded_by: '',
          recorded_at: toIso(q.recordedAt),
          participant_status: 'pending',
          participant_acted_at: null,
        };
        isQueued = true;
      } else if (q.kind === 'end' && a && (!a.ended_at || a.end_source === 'auto_closed')) {
        // The supervisor's own time wins over the automatic close (rules.decideRecordEnd).
        a = { ...a, ended_at: toIso(time), end_source: 'live', hours: round2((time - toMs(a.started_at)) / 3_600_000) };
        isQueued = true;
      }
    }
    return { ...p, attendance: a, queued: isQueued };
  });
}
