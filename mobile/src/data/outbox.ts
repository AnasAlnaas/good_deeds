// Attendance a supervisor records with no connection (events happen on beaches
// and in halls where the signal drops). The record is kept on the phone with
// the moment it was tapped, shown on the roster as if made, and sent once the
// connection is back; the server judges it as at that moment
// (rules.OFFLINE_RECORD_MAX_HOURS). Server mode only: the demo needs no internet.
// One list per account, kept across sign-outs, so nothing recorded is lost.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { type Backend, type ErrorCode, errorCode } from './backend';
import type { QueuedRecord } from './queuedRoster';

export { rosterWithQueued, type QueuedRecord, type RosterEntry } from './queuedRoster';

/** A record the server would not take (the event was cancelled, someone else recorded it…), until the supervisor has seen it. */
export interface RefusedRecord extends QueuedRecord {
  code: ErrorCode;
}

interface Outbox {
  owner: string | null;
  queued: QueuedRecord[];
  refused: RefusedRecord[];
}

const EMPTY: Outbox = { owner: null, queued: [], refused: [] };
let box: Outbox = EMPTY;
const listeners = new Set<() => void>();
const storageKey = (owner: string) => `gd.outbox.${owner}`;

function set(next: Outbox) {
  box = next;
  listeners.forEach((l) => l());
  if (next.owner) {
    AsyncStorage.setItem(storageKey(next.owner), JSON.stringify({ queued: next.queued, refused: next.refused })).catch(() => {});
  }
}

/** Loads the signed-in account's list (null: nobody, or the demo). */
export async function openOutbox(owner: string | null) {
  if (box.owner === owner) return;
  if (!owner) return set(EMPTY);
  let saved: Partial<Outbox> = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(storageKey(owner))) ?? '{}');
  } catch {
    // Unreadable: start empty.
  }
  box = { owner, queued: saved.queued ?? [], refused: saved.refused ?? [] };
  listeners.forEach((l) => l());
}

export function queueRecord(record: Omit<QueuedRecord, 'id'>) {
  if (!box.owner) return;
  const id = `${record.kind}:${record.eventId}:${record.userId}:${record.recordedAt}`;
  set({ ...box, queued: [...box.queued, { ...record, id }] });
}

export function dismissRefused(id: string) {
  set({ ...box, refused: box.refused.filter((r) => r.id !== id) });
}

export function useOutbox(): Outbox {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => box,
  );
}

/** The phone's records not sent yet, for warnings (e.g. on signing out). */
export const queuedCount = () => box.queued.length;

// Refusals that mean the server already has it: a send whose answer was lost
// on the way (the connection dropped after the server took it) is sent again.
const ALREADY_THERE: Record<QueuedRecord['kind'], ErrorCode> = { start: 'already_started', end: 'already_ended' };
// Worth trying again later: the connection or the server failed, not a rule.
const TRY_AGAIN: ErrorCode[] = ['network', 'internal_error', 'unauthorized', 'try_later'];

let sending = false;

/** Sends the records in the order they were made. `onChange` runs after each, so the screens fetch again. */
export async function sendQueued(backend: Backend, onChange: () => void) {
  if (sending) return;
  sending = true;
  const owner = box.owner;
  try {
    while (box.owner === owner && box.queued.length) {
      const r = box.queued[0];
      try {
        await (r.kind === 'start'
          ? backend.recordStart(r.eventId, r.userId, r.at, r.recordedAt)
          : backend.recordEnd(r.eventId, r.userId, r.at, r.recordedAt));
        set({ ...box, queued: box.queued.slice(1) });
      } catch (e) {
        const code = errorCode(e);
        if (TRY_AGAIN.includes(code)) break;
        set({
          ...box,
          queued: box.queued.slice(1),
          refused: code === ALREADY_THERE[r.kind] ? box.refused : [...box.refused, { ...r, code }],
        });
      }
      onChange();
    }
  } finally {
    sending = false;
  }
}
