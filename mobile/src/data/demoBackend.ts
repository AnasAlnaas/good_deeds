// The offline demo behind the same interface as the server: it runs the rules
// (src/demo/server.ts → shared/rules.ts) on the data kept on the phone, and
// builds the same responses the server builds (server/src/routes/).

import type { AppEvent, Attendance, Db, EventNotice, OutsideHours, Report, User, Warning } from '@/data/types';
import { REPORT_CATEGORIES } from '@/data/types';
import * as server from '@/demo/server';
import { classOfEvent, eventSubtypes } from '../../../shared/classes';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import { lessonLibrary } from '../../../shared/lesson-library';
import { cleanKind, promotedTags } from '../../../shared/tags';
import type {
  OutsideHoursItem,
  AttendanceItem,
  EventDetail,
  EventLessonItem,
  LessonImageRef,
  LessonLibraryItem,
  EventNoticeItem,
  EventProposal,
  EventSummary,
  EventSupervisor,
  InstitutionMembersResponse,
  InstitutionRef,
  MyInstitution,
  MyReport,
  MyWarning,
  PublicUser,
  ReportFormMeta,
} from './api';
import { type Backend, BackendError } from './backend';

export interface DemoStore {
  get(): Db;
  commit(next: Db): void;
}

/** A person as `viewer` may see them: the photo only where rules.canSeePhoto allows it (as the server does). */
const publicUser = (viewer: User, u: User): PublicUser => ({
  id: u.id,
  full_name: u.full_name,
  avatar_url: rules.canSeePhoto(viewer, u) ? u.avatar_url : null,
  gender: u.gender,
});

function supervisorsFor(db: Db, me: User, eventId: string): EventSupervisor[] {
  return server.supervisorsOf(db, eventId).map((u) => ({ ...publicUser(me, u), added_in_app: u.added_by !== null }));
}

function noticeItem(db: Db, me: User, n: EventNotice): EventNoticeItem {
  const author = server.getUser(db, n.author_id);
  return {
    id: n.id,
    kind: n.kind,
    body: n.body,
    created_at: n.created_at,
    author: author && !author.deleted_at ? publicUser(me, author) : null,
    can_delete: n.author_id === me.id || me.role === 'admin',
    ...rules.reactionSummary(n.kind, db.notice_reactions.filter((r) => r.notice_id === n.id), me.id),
  };
}

/** An institution as events and hours show it. */
function institutionRef(db: Db, id: string | null): InstitutionRef | null {
  const i = server.institutionOf(db, id);
  return i ? { id: i.id, name: i.name, kind: i.kind } : null;
}

/** The person's institutions, as the server lists them (server/src/routes/institutions.ts). */
function myInstitutions(db: Db, meId: string): MyInstitution[] {
  return db.institution_members
    .filter((m) => m.user_id === meId)
    .map((m) => {
      const i = server.institutionOf(db, m.institution_id)!;
      return {
        institution: { id: i.id, name: i.name, kind: i.kind, status: i.status, decision_note: i.decision_note },
        role: m.role,
        status: m.status,
        pending_members: rules.isRepresentative(m) ? db.institution_members.filter((x) => x.institution_id === i.id && x.status === 'pending').length : 0,
        pending_hours: rules.isRepresentative(m) ? (db.outside_hours ?? []).filter((x) => x.institution_id === i.id && x.status === 'pending').length : 0,
      };
    })
    .sort((a, b) => a.institution.name.localeCompare(b.institution.name, 'ar'));
}

/** Claims as their volunteer or the institution's representatives see them (server/src/routes/outside-hours.ts). */
function outsideHoursItems(db: Db, me: User, claims: OutsideHours[]): OutsideHoursItem[] {
  return claims.map((claim) => {
    const i = server.institutionOf(db, claim.institution_id)!;
    const decider = claim.decided_by ? server.getUser(db, claim.decided_by) : undefined;
    return {
      claim,
      institution: { id: i.id, name: i.name, kind: i.kind },
      image: imageRef(db, claim.image_id),
      user: publicUser(me, server.getUser(db, claim.user_id)!),
      decided_by: decider ? publicUser(me, decider) : null,
    };
  });
}

/** Who belongs to the institution, for its representatives. */
function membersOf(db: Db, me: User, id: string): InstitutionMembersResponse {
  const i = server.institutionOf(db, id)!;
  const rows = db.institution_members
    .filter((m) => m.institution_id === id)
    .map((m) => ({ m, u: server.getUser(db, m.user_id)! }))
    .filter((x) => x.u && !x.u.deleted_at);
  const order = (x: (typeof rows)[number]) => (x.m.status === 'pending' ? 0 : 1);
  rows.sort((a, b) => order(a) - order(b) || (order(a) === 0 ? rules.toMs(a.m.created_at) - rules.toMs(b.m.created_at) : a.u.full_name.localeCompare(b.u.full_name, 'ar')));
  return {
    institution: { id: i.id, name: i.name, kind: i.kind, status: i.status },
    members: rows.map(({ m, u }) => ({ user: publicUser(me, u), role: m.role, status: m.status, created_at: m.created_at })),
  };
}

function summary(db: Db, me: User, e: AppEvent, now: number): EventSummary {
  // The meeting link stays off the list, as on the server.
  const { description, status, terms_locked_at, created_by, created_at, meeting_url, ...shown } = e;
  return {
    ...shown,
    status: server.effectiveStatus(e, now),
    joined_count: server.joinedUsers(db, e.id).length,
    event_class: classOfEvent(e),
    can_join_category: server.canUserJoinCategory(me, e),
    my_registration_status: server.registrationOf(db, e.id, me.id)?.status ?? null,
    i_organize: server.isOrganizer(db, e.id, me.id),
    i_created: e.created_by === me.id,
    institution: institutionRef(db, e.institution_id),
    cover: imageRef(db, e.cover_image_id),
  };
}

function item(db: Db, me: User, a: Attendance): AttendanceItem {
  const e = server.getEvent(db, a.event_id);
  const recorder = server.getUser(db, a.recorded_by);
  return {
    attendance: a,
    event: {
      id: e.id,
      title: e.title,
      location_type: e.location_type,
      address_text: e.address_text,
      meeting_platform: e.meeting_platform,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      institution: institutionRef(db, e.institution_id),
    },
    recorded_by: recorder ? publicUser(me, recorder) : null,
    points: server.pointsForAttendance(db, a),
  };
}

/** A report as its author sees it: without who handled it or the admin's note (as the server sends it). */
function myReport(db: Db, me: User, r: Report): MyReport {
  const e = r.event_id ? db.events.find((x) => x.id === r.event_id) : undefined;
  const subject = r.subject_id ? server.getUser(db, r.subject_id) : undefined;
  return {
    report: { id: r.id, category: r.category, note: r.note, status: r.status, created_at: r.created_at, handled_at: r.handled_at },
    event: e ? { id: e.id, title: e.title } : null,
    subject: subject ? publicUser(me, subject) : null,
  };
}

/** A warning as the member it was given to sees it: without which admin decided. */
function myWarning(db: Db, me: User, { decided_by, ...warning }: Warning): MyWarning {
  const e = db.events.find((x) => x.id === warning.event_id)!;
  const issuer = server.getUser(db, warning.issued_by);
  return { warning, event: { id: e.id, title: e.title, starts_at: e.starts_at }, issued_by: issuer ? publicUser(me, issuer) : null };
}

/** The events `me` was at, latest first, with the other people there (server/src/routes/reports.ts, GET /form). */
function reportableEvents(db: Db, me: User): ReportFormMeta['events'] {
  return db.events
    .filter((e) => !rules.isHidden(e) && server.wasAtEvent(db, e.id, me.id))
    .sort((a, b) => rules.toMs(b.starts_at) - rules.toMs(a.starts_at))
    .slice(0, rules.REPORT_FORM_EVENTS)
    .map((e) => {
      const supervisors = db.event_organizers
        .filter((o) => o.event_id === e.id)
        .map((o) => server.getUser(db, o.user_id))
        .filter((u): u is User => !!u && !u.deleted_at);
      const participants = server.joinedUsers(db, e.id).filter((u) => !supervisors.some((x) => x.id === u.id));
      return {
        event: { id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at },
        people: [
          ...supervisors.map((u) => ({ user: u, supervisor: true })),
          ...participants.map((u) => ({ user: u, supervisor: false })),
        ]
          .filter((p) => p.user.id !== me.id)
          .map((p) => ({ user: publicUser(me, p.user), supervisor: p.supervisor })),
      };
    });
}

/** The server's request checks on an event form (server/src/routes/event-input.ts), briefly. */
function checkProposal(db: Db, body: EventProposal) {
  if (!cleanKind(body) || rules.toMs(body.ends_at) <= rules.toMs(body.starts_at)) {
    throw new BackendError('invalid_request');
  }
  if (body.cover_image_id && !db.lesson_images.some((x) => x.id === body.cover_image_id)) throw new BackendError('invalid_request');
  // The same limits as the server's form (server/src/routes/event-input.ts); a picture must have been sent.
  const lessonOk = (l: EventProposal['lessons'][number]) =>
    rules.lessonComplete(l) &&
    l.title.length <= rules.LESSON_TITLE_MAX &&
    l.body.length <= rules.LESSON_BODY_MAX &&
    (!l.image_id || db.lesson_images.some((x) => x.id === l.image_id)) &&
    (!l.video_id || rules.isYoutubeId(l.video_id));
  if (body.lessons.length > rules.MAX_LESSONS || !body.lessons.every(lessonOk)) throw new BackendError('invalid_request');
}

/** A lesson's picture as the app shows it: the demo keeps it as a data: address. */
function imageRef(db: Db, imageId: string | null): LessonImageRef | null {
  const image = imageId ? db.lesson_images.find((x) => x.id === imageId) : undefined;
  return image ? { id: image.id, url: image.data_url, width: image.width, height: image.height } : null;
}

/** The event's lessons as this person sees them, as the server builds them. */
function lessonItems(db: Db, meId: string, eventId: string): EventLessonItem[] {
  const learned = server.learnedAt(db, meId);
  return server
    .eventLessons(db, eventId)
    .map(({ created_at, ...l }) => ({ ...l, image: imageRef(db, l.image_id), learned_at: learned.get(l.id) ?? null }));
}

/** The lessons of earlier events the form offers, as the server builds them. */
function libraryItems(db: Db, meId: string): LessonLibraryItem[] {
  return lessonLibrary(meId, db.events, db.event_lessons).map(({ lesson, event, mine }) => ({
    id: lesson.id,
    title: lesson.title,
    body: lesson.body,
    image: imageRef(db, lesson.image_id),
    video_id: lesson.video_id ?? null,
    event_id: event.id,
    event_title: event.title,
    mine,
  }));
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
          .filter((e) => rules.canSeeEvent(me, e))
          .sort((a, b) => rules.toMs(a.starts_at) - rules.toMs(b.starts_at))
          .map((e) => summary(db, me, e, now));
      }),

    event: (id) =>
      async((): EventDetail => {
        const { db, now, me } = read();
        const e = server.getEventFor(db, id, me.id);
        const reg = server.registrationOf(db, id, me.id);
        return {
          ...summary(db, me, e, now),
          description: e.description,
          terms_locked_at: e.terms_locked_at,
          meeting_url: rules.canSeeMeetingLink({ event: e, canManage: rules.canManageEvent(me, server.isOrganizer(db, id, me.id)), registration: reg, now })
            ? e.meeting_url
            : null,
          meeting_link_opens_at: e.location_type === 'online' ? rules.meetingLinkOpensAt(e) : null,
          terms: server.eventTerms(db, id),
          skill_ids: server.skillsOfEvent(db, id),
          lessons: lessonItems(db, me.id, id),
          participants: server.joinedUsers(db, id).map((u) => publicUser(me, u)),
          my_registration: reg ?? null,
          my_accepted_term_ids: reg ? server.acceptedTermIds(db, reg.id) : [],
          my_attendance: server.attendanceOf(db, id, me.id) ?? null,
          supervisors: supervisorsFor(db, me, id),
          notices: rules.canReadNotices(me, reg, server.isOrganizer(db, id, me.id))
            ? server.noticesOf(db, id).map((n) => noticeItem(db, me, n))
            : null,
          can_manage: rules.canManageEvent(me, server.isOrganizer(db, id, me.id)),
          waitlist: {
            count: server.waitlistOf(db, id).length,
            held_for_others: rules.seatsHeld(server.waitlistOf(db, id), now, me.id),
            mine: rules.waitlistStanding(server.waitlistOf(db, id), me.id, now),
          },
        };
      }),

    eventForm: () =>
      async(() => {
        const { db, me } = read();
        if (!server.mayProposeEvents(db, me)) throw new ApiError('cannot_create_events');
        return {
          subtypes: eventSubtypes(),
          tags: promotedTags(db.events),
          publishes_directly: rules.proposalStatus(me, { own: rules.ownApprovedEvents(db.events, me.id) }) === 'published',
          waiting: server.waitingProposals(db, me.id),
          max_waiting: rules.MAX_WAITING_PROPOSALS,
          lesson_library: libraryItems(db, me.id),
          skills: server.skillList(db),
          own_events: server.canCreateEvents(db, me),
          institutions: server.representedInstitutions(db, me.id).map((i) => ({
            id: i.id,
            name: i.name,
            kind: i.kind,
            publishes_directly: rules.proposalStatus({ role: 'member' }, { institution: rules.institutionApprovedEvents(db.events, i.id) }) === 'published',
          })),
        };
      }),

    proposeEvent: (body) =>
      async(() => {
        checkProposal(store.get(), body);
        let created: AppEvent | undefined;
        change((d, t) => {
          const result = server.proposeEvent(d, meId, body, t);
          created = result.event;
          return result.db;
        });
        return { id: created!.id, status: created!.status as 'draft' | 'published' };
      }),

    editProposal: (id, body) =>
      async(() => {
        checkProposal(store.get(), body);
        change((d, t) => server.editProposal(d, meId, id, body, t));
        return { id, status: 'draft' as const };
      }),

    withdrawProposal: (id) =>
      async(() => {
        change((d) => server.withdrawProposal(d, meId, id));
      }),

    uploadLessonImage: ({ base64, width, height }) =>
      async(() => {
        let id = '';
        const { db } = change((d, t) => {
          const result = server.addLessonImage(d, meId, { data_url: `data:image/jpeg;base64,${base64}`, width, height }, t);
          id = result.id;
          return result.db;
        });
        return { image: imageRef(db, id)! };
      }),

    learnLesson: (eventId, lessonId) =>
      async(() => {
        const { db } = change((d, t) => server.learnLesson(d, meId, eventId, lessonId, t));
        return { lesson: lessonItems(db, meId, eventId).find((l) => l.id === lessonId)! };
      }),

    myLessons: () =>
      async(() => {
        const { db, me } = read();
        const lessons = new Map(db.event_lessons.map((l) => [l.id, l]));
        return db.lesson_completions
          .filter((c) => c.user_id === me.id && lessons.has(c.lesson_id))
          .sort((a, b) => rules.toMs(b.learned_at) - rules.toMs(a.learned_at))
          .map((c) => {
            const { created_at, ...lesson } = lessons.get(c.lesson_id)!;
            const e = db.events.find((x) => x.id === lesson.event_id)!;
            return {
              lesson: { ...lesson, image: imageRef(db, lesson.image_id), learned_at: c.learned_at },
              event: { id: e.id, title: e.title, starts_at: e.starts_at, subtype: e.subtype, event_class: e.event_class },
            };
          });
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

    joinWaitlist: (eventId) =>
      async(() => {
        change((d, t) => server.joinWaitlist(d, meId, eventId, t));
      }),

    leaveWaitlist: (eventId) =>
      async(() => {
        change((d, t) => server.leaveWaitlist(d, meId, eventId, t));
      }),

    cancelJoin: (eventId) =>
      async(() => {
        const { db } = change((d, t) => server.cancelJoin(d, meId, eventId, t));
        return { registration: server.registrationOf(db, eventId, meId)! };
      }),

    roster: (eventId) =>
      async(() => {
        const { db, now, me } = read();
        const e = server.getEvent(db, eventId);
        if (!server.isOrganizer(db, eventId, me.id)) throw new ApiError('not_organizer');
        const warned = server.warnedBy(db, eventId, me.id);
        const people = server.joinedUsers(db, eventId);
        // The other supervisors are on it too: one of them records each one's hours.
        const supervisorIds = db.event_organizers.filter((o) => o.event_id === eventId).map((o) => o.user_id);
        const others = supervisorIds
          .filter((id) => !people.some((p) => p.id === id))
          .map((id) => server.getUser(db, id))
          .filter((u): u is User => !!u && !u.deleted_at);
        return {
          event: summary(db, me, e, now),
          i_pledged: !!server.organizerLink(db, eventId, me.id)?.pledged_at,
          participants: [...people, ...others].map((u) => ({
            user: publicUser(me, u),
            attendance: server.attendanceOf(db, eventId, u.id) ?? null,
            i_warned: warned.has(u.id),
            is_supervisor: supervisorIds.includes(u.id),
          })),
        };
      }),

    pledge: (eventId) =>
      async(() => {
        change((d, t) => server.pledge(d, meId, eventId, t));
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

    warn: (eventId, userId, reason) =>
      async(() => {
        // The server's request check (server/src/routes/events.ts), briefly.
        if (reason.length > rules.REASON_MAX) throw new BackendError('invalid_request');
        let warning: Warning | undefined;
        change((d, t) => {
          const result = server.warn(d, meId, { eventId, userId, reason }, t);
          warning = result.warning;
          return result.db;
        });
        return { warning: warning! };
      }),

    addSupervisor: (eventId, userId) =>
      async(() => {
        const { db, me } = change((d, t) => server.addSupervisor(d, meId, eventId, userId, t));
        return { supervisors: supervisorsFor(db, me, eventId) };
      }),

    removeSupervisor: (eventId, userId) =>
      async(() => {
        const { db, me } = change((d, t) => server.removeSupervisor(d, meId, eventId, userId, t));
        return { supervisors: supervisorsFor(db, me, eventId) };
      }),

    postNotice: (eventId, body, kind) =>
      async(() => {
        // The server's request check (server/src/routes/events.ts), briefly.
        if (body.length > rules.NOTICE_MAX) throw new BackendError('invalid_request');
        let notice: EventNotice | undefined;
        const { db, me } = change((d, t) => {
          const result = server.postNotice(d, meId, eventId, body, kind, t);
          notice = result.notice;
          return result.db;
        });
        return { notice: noticeItem(db, me, notice!) };
      }),

    deleteNotice: (eventId, noticeId) =>
      async(() => {
        change((d) => server.deleteNotice(d, meId, eventId, noticeId));
      }),

    reactToNotice: (eventId, noticeId, reaction) =>
      async(() => {
        const { db, me } = change((d, t) => server.reactToNotice(d, meId, eventId, noticeId, reaction, t));
        return { notice: noticeItem(db, me, db.event_notices.find((n) => n.id === noticeId)!) };
      }),

    reportForm: () =>
      async((): ReportFormMeta => {
        const { db, me } = read();
        if (!server.canReport(db, me)) throw new ApiError('cannot_report');
        return {
          categories: REPORT_CATEGORIES,
          events: reportableEvents(db, me),
          open: server.openReports(db, me.id),
          max_open: rules.MAX_OPEN_REPORTS,
        };
      }),

    report: (body) =>
      async(() => {
        // The server's request checks (server/src/routes/reports.ts), briefly.
        if (!REPORT_CATEGORIES.includes(body.category) || (body.note?.length ?? 0) > rules.REPORT_NOTE_MAX) {
          throw new BackendError('invalid_request');
        }
        let created: Report | undefined;
        const { db, me } = change((d, t) => {
          const result = server.fileReport(d, meId, body, t);
          created = result.report;
          return result.db;
        });
        return myReport(db, me, created!);
      }),

    myReports: () =>
      async(() => {
        const { db, me } = read();
        return db.reports
          .filter((r) => r.reporter_id === me.id)
          .sort((a, b) => rules.toMs(b.created_at) - rules.toMs(a.created_at))
          .map((r) => myReport(db, me, r));
      }),

    myWarnings: () =>
      async(() => {
        const { db, me } = read();
        return db.warnings
          .filter((w) => w.user_id === me.id)
          .sort((a, b) => rules.toMs(b.created_at) - rules.toMs(a.created_at))
          .map((w) => myWarning(db, me, w));
      }),

    warning: (id) =>
      async(() => {
        const { db, me } = read();
        const w = db.warnings.find((x) => x.id === id);
        if (!w) throw new ApiError('not_found');
        if (w.user_id !== me.id) throw new ApiError('not_your_warning');
        return myWarning(db, me, w);
      }),

    appealWarning: (id, reason) =>
      async(() => {
        if (reason.length > rules.REASON_MAX) throw new BackendError('invalid_request');
        const { db, me } = change((d, t) => server.appealWarning(d, meId, id, reason, t));
        return myWarning(db, me, db.warnings.find((x) => x.id === id)!);
      }),

    me: () =>
      async(() => {
        const { db, me } = read();
        const total = server.totalPoints(db, me.id);
        const level = server.levelFor(db, total);
        const badges = (db.user_badges ?? []).filter((b) => b.user_id === me.id).sort((a, b) => rules.toMs(b.earned_at) - rules.toMs(a.earned_at));
        return {
          user: me,
          badges: badges.map((b) => ({ badge_id: b.badge_id, earned_at: b.earned_at })),
          new_badges: badges.filter((b) => !b.seen_at).map((b) => b.badge_id),
          total_points: total,
          level,
          next_level: server.nextLevel(db, total) ?? null,
          levels: db.levels,
          confirmed_hours: server.confirmedHours(db, me.id),
          can_create_events: server.mayProposeEvents(db, me),
          create_events_level: db.levels.find((l) => l.can_create_events)?.level ?? null,
          can_report: rules.canReport(me, level),
          warnings: db.warnings.filter((w) => w.user_id === me.id).length,
          institution_requests: server.requestsForRepresentative(db, me.id),
        };
      }),

    myAttendance: () =>
      async(() => {
        const { db, me } = read();
        return db.attendance
          .filter((a) => a.user_id === me.id)
          .sort((a, b) => rules.toMs(b.started_at) - rules.toMs(a.started_at))
          .map((a) => item(db, me, a));
      }),

    attendance: (id) =>
      async(() => {
        const { db, me } = read();
        const a = db.attendance.find((x) => x.id === id);
        if (!a) throw new ApiError('not_found');
        if (a.user_id !== me.id) throw new ApiError('not_your_attendance');
        return item(db, me, a);
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

    // The demo has no server to send notifications.
    registerPushToken: async () => {},
    unregisterPushToken: async () => {},

    institutions: () =>
      async(() => {
        const { db, me } = read();
        return {
          mine: myInstitutions(db, me.id),
          directory: db.institutions
            .filter((i) => i.status === 'approved')
            .map((i) => ({ id: i.id, name: i.name, kind: i.kind }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
          waiting_requests: db.institutions.filter((i) => i.requested_by === me.id && i.status === 'pending').length,
          max_waiting_requests: rules.MAX_INSTITUTION_REQUESTS,
        };
      }),

    requestInstitution: (body) =>
      async(() => {
        let id = '';
        const { db } = change((d, t) => {
          const result = server.requestInstitution(d, meId, body, t);
          id = result.id;
          return result.db;
        });
        return myInstitutions(db, meId).find((x) => x.institution.id === id)!;
      }),

    joinInstitution: (id) =>
      async(() => {
        const { db } = change((d, t) => server.askToJoinInstitution(d, meId, id, t));
        return myInstitutions(db, meId).find((x) => x.institution.id === id)!;
      }),

    leaveInstitution: (id) =>
      async(() => {
        change((d) => server.leaveInstitution(d, meId, id));
      }),

    institutionMembers: (id) =>
      async(() => {
        const { db, me } = read();
        server.assertMayManageInstitution(db, me, id);
        return membersOf(db, me, id);
      }),

    confirmMember: (id, userId) =>
      async(() => {
        const { db, me } = change((d, t) => server.confirmMember(d, meId, id, userId, t));
        return membersOf(db, me, id);
      }),

    removeMember: (id, userId) =>
      async(() => {
        const { db, me } = change((d) => server.removeMember(d, meId, id, userId));
        return membersOf(db, me, id);
      }),

    myOutsideHours: () =>
      async(() => {
        const { db, me } = read();
        const mine = (db.outside_hours ?? []).filter((c) => c.user_id === me.id).sort((a, b) => rules.toMs(b.created_at) - rules.toMs(a.created_at));
        return outsideHoursItems(db, me, mine);
      }),

    claimOutsideHours: (body) =>
      async(() => {
        let id = '';
        const { db, me } = change((d, t) => {
          const result = server.claimOutsideHours(d, meId, body, t);
          id = result.id;
          return result.db;
        });
        return outsideHoursItems(db, me, [db.outside_hours.find((c) => c.id === id)!])[0];
      }),

    institutionOutsideHours: (id) =>
      async(() => {
        const { db, me } = read();
        server.assertMayManageInstitution(db, me, id);
        const rows = (db.outside_hours ?? []).filter((c) => c.institution_id === id).sort((a, b) => rules.toMs(b.created_at) - rules.toMs(a.created_at));
        const waiting = rows.filter((r) => r.status === 'pending').reverse();
        return outsideHoursItems(db, me, [...waiting, ...rows.filter((r) => r.status !== 'pending')]);
      }),

    decideOutsideHours: (id, claimId, body) =>
      async(() => {
        const { db, me } = change((d, t) => server.decideOutsideHours(d, meId, id, claimId, body.decision, body.note, t));
        return outsideHoursItems(db, me, [db.outside_hours.find((c) => c.id === claimId)!])[0];
      }),

    mySkills: () =>
      async(() => {
        const { db, me } = read();
        return server.mySkills(db, me.id);
      }),

    setMySkills: (body) =>
      async(() => {
        const { db } = change((d) => server.setMySkills(d, meId, body));
        return server.mySkills(db, meId);
      }),

    skillMatches: () =>
      async(() => {
        const { db, me } = read();
        return server.skillMatches(db, me, Date.now());
      }),

    markBadgesSeen: () =>
      async(() => {
        change((d, t) => server.markBadgesSeen(d, meId, t));
      }),

    person: (id) =>
      async(() => {
        const { db, me } = read();
        const u = server.getUser(db, id);
        if (!u || u.deleted_at) throw new ApiError('not_found');
        const badges = (db.user_badges ?? []).filter((b) => b.user_id === id).sort((a, b) => rules.toMs(b.earned_at) - rules.toMs(a.earned_at));
        return { user: publicUser(me, u), level: u.level, badges: badges.map((b) => ({ badge_id: b.badge_id, earned_at: b.earned_at })) };
      }),

    leaderboard: (institutionId) =>
      async(() => {
        const { db, me } = read();
        return server.leaderboard(db, me, institutionId, Date.now());
      }),

    // The demo has no server to check a certificate: it has no QR code.
    makeCertificate: (body) =>
      async(() => {
        const { db, me } = read();
        return server.demoCertificate(db, me, body.institution_id ?? null, Date.now());
      }),

    institutionHoursReport: (id, from, to) =>
      async(() => {
        const { db, me } = read();
        server.assertMayManageInstitution(db, me, id);
        return server.institutionHoursReport(db, me, id, from, to);
      }),

    updateProfile: (edit) =>
      async(() => {
        // The server's check (server/src/routes/me.ts, PATCH /): the same shared rule.
        const cleaned = rules.cleanProfileEdit(edit);
        if (!cleaned) throw new BackendError('invalid_request');
        const { me } = change((d) => server.updateProfile(d, meId, cleaned));
        return { user: me };
      }),

    // The demo sends no email (edit-profile.tsx hides the change there).
    requestEmailChange: () => Promise.reject(new BackendError('delivery_not_configured')),
    changeEmail: () => Promise.reject(new BackendError('delivery_not_configured')),

    setPhoto: (jpegBase64) =>
      async(() => {
        const { me } = change((d) => server.setPhoto(d, meId, `data:image/jpeg;base64,${jpegBase64}`));
        return { avatar_url: me.avatar_url! };
      }),

    removePhoto: () =>
      async(() => {
        change((d) => server.setPhoto(d, meId, null));
      }),

    deleteAccount: () =>
      async(() => {
        change((d, t) => server.deleteAccount(d, meId, t));
      }),
  };
}
