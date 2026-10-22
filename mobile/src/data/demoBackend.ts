// The offline demo behind the same interface as the server: it runs the rules
// (src/demo/server.ts → shared/rules.ts) on the data kept on the phone, and
// builds the same responses the server builds (server/src/routes/).

import type { AppEvent, Attendance, Db, User } from '@/data/types';
import { PILLARS } from '@/data/types';
import * as server from '@/demo/server';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import type { AttendanceItem, EventDetail, EventSummary, PublicUser } from './api';
import type { Backend } from './backend';

export interface DemoStore {
  get(): Db;
  commit(next: Db): void;
}

const publicUser = (u: User): PublicUser => ({ id: u.id, full_name: u.full_name, avatar_url: u.avatar_url, gender: u.gender });

function summary(db: Db, me: User, e: AppEvent, now: number): EventSummary {
  const { description, status, terms_locked_at, created_by, created_at, ...shown } = e;
  const w = server.eventPillarWeights(db, e.id);
  return {
    ...shown,
    status: server.effectiveStatus(e, now),
    joined_count: server.joinedUsers(db, e.id).length,
    pillar_weights: w,
    dominant_pillar: rules.dominantPillar(w),
    can_join_category: server.canUserJoinCategory(me, e),
    my_registration_status: server.registrationOf(db, e.id, me.id)?.status ?? null,
    i_organize: server.isOrganizer(db, e.id, me.id),
  };
}

function item(db: Db, a: Attendance): AttendanceItem {
  const e = server.getEvent(db, a.event_id);
  const recorder = server.getUser(db, a.recorded_by);
  return {
    attendance: a,
    event: { id: e.id, title: e.title, address_text: e.address_text, starts_at: e.starts_at, ends_at: e.ends_at, base_points: e.base_points },
    recorded_by: recorder ? publicUser(recorder) : null,
    points: server.pointsForAttendance(db, a),
  };
}

export function createDemoBackend(store: DemoStore, meId: string): Backend {
  // Like the server, the scheduled auto-close runs before every call.
  const read = () => {
    const now = Date.now();
    const db = server.tick(store.get(), now);
    if (db !== store.get()) store.commit(db);
    const me = server.getUser(db, meId)!;
    return { db, now, me };
  };
  const change = (mutation: (db: Db, now: number) => Db) => {
    const { db, now } = read();
    const next = mutation(db, now);
    store.commit(next);
    return { db: next, now, me: server.getUser(next, meId)! };
  };
  // Async like the real server, so the screens behave the same in both modes.
  const async = <T>(fn: () => T) =>
    new Promise<T>((resolve, reject) => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    });

  return {
    listEvents: () =>
      async(() => {
        const { db, now, me } = read();
        return db.events
          .filter((e) => e.status !== 'draft')
          .sort((a, b) => rules.toMs(a.starts_at) - rules.toMs(b.starts_at))
          .map((e) => summary(db, me, e, now));
      }),

    event: (id) =>
      async((): EventDetail => {
        const { db, now, me } = read();
        const e = server.getEvent(db, id);
        const reg = server.registrationOf(db, id, me.id);
        return {
          ...summary(db, me, e, now),
          description: e.description,
          terms_locked_at: e.terms_locked_at,
          branches: server.eventBranches(db, id).map((b) => ({
            ...b,
            pillars: PILLARS.filter((p) => db.branch_pillars.some((bp) => bp.branch_id === b.id && bp.pillar === p)),
          })),
          terms: server.eventTerms(db, id),
          participants: server.joinedUsers(db, id).map(publicUser),
          my_registration: reg ?? null,
          my_accepted_term_ids: reg ? server.acceptedTermIds(db, reg.id) : [],
          my_attendance: server.attendanceOf(db, id, me.id) ?? null,
        };
      }),

    startJoin: (eventId) =>
      async(() => {
        const { db } = change((d, t) => server.startJoin(d, meId, eventId, t));
        return { registration: server.registrationOf(db, eventId, meId)! };
      }),

    acceptTerm: (eventId, termId) =>
      async(() => {
        const { db } = change((d, t) => server.acceptTerm(d, meId, eventId, termId, t));
        const registration = server.registrationOf(db, eventId, meId)!;
        return { registration, accepted_term_ids: server.acceptedTermIds(db, registration.id) };
      }),

    completeJoin: (eventId) =>
      async(() => {
        const { db } = change((d, t) => server.completeJoin(d, meId, eventId, t));
        return { registration: server.registrationOf(db, eventId, meId)! };
      }),

    cancelJoin: (eventId) =>
      async(() => {
        const { db } = change((d) => server.cancelJoin(d, meId, eventId));
        return { registration: server.registrationOf(db, eventId, meId)! };
      }),

    roster: (eventId) =>
      async(() => {
        const { db, now, me } = read();
        const e = server.getEvent(db, eventId);
        if (!server.isOrganizer(db, eventId, me.id)) throw new ApiError('not_organizer');
        return {
          event: summary(db, me, e, now),
          participants: server.joinedUsers(db, eventId).map((u) => ({
            user: publicUser(u),
            attendance: server.attendanceOf(db, eventId, u.id) ?? null,
          })),
        };
      }),

    recordStart: (eventId, userId, at) =>
      async(() => {
        const { db } = change((d, t) => server.recordStart(d, meId, { eventId, userId, startedAt: at }, t));
        return { attendance: server.attendanceOf(db, eventId, userId)! };
      }),

    recordEnd: (eventId, userId, at) =>
      async(() => {
        const { db } = change((d, t) => server.recordEnd(d, meId, { eventId, userId, endedAt: at }, t));
        return { attendance: server.attendanceOf(db, eventId, userId)! };
      }),

    me: () =>
      async(() => {
        const { db, me } = read();
        const byPillar = server.pointsByPillar(db, me.id);
        const total = rules.totalOf(byPillar);
        return {
          user: me,
          points_by_pillar: byPillar,
          total_points: total,
          level: server.levelFor(db, total),
          next_level: server.nextLevel(db, total) ?? null,
          confirmed_hours: server.confirmedHours(db, me.id),
        };
      }),

    myAttendance: () =>
      async(() => {
        const { db, me } = read();
        return db.attendance
          .filter((a) => a.user_id === me.id)
          .sort((a, b) => rules.toMs(b.started_at) - rules.toMs(a.started_at))
          .map((a) => item(db, a));
      }),

    attendance: (id) =>
      async(() => {
        const { db, me } = read();
        const a = db.attendance.find((x) => x.id === id);
        if (!a) throw new ApiError('not_found');
        if (a.user_id !== me.id) throw new ApiError('not_your_attendance');
        return item(db, a);
      }),

    confirmAttendance: (id) =>
      async(() => {
        const { db, me } = change((d, t) => server.confirmAttendance(d, meId, id, t));
        const attendance = db.attendance.find((x) => x.id === id)!;
        const total = server.totalPoints(db, me.id);
        return {
          attendance,
          points_earned: server.pointsForAttendance(db, attendance),
          total_points: total,
          level: server.levelFor(db, total),
        };
      }),

    disputeAttendance: (id) =>
      async(() => {
        const { db } = change((d, t) => server.disputeAttendance(d, meId, id, t));
        return { attendance: db.attendance.find((x) => x.id === id)! };
      }),

    deleteAccount: () =>
      async(() => {
        change((d, t) => server.deleteAccount(d, meId, t));
      }),
  };
}
