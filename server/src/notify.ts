// Who is told what:
// - "your hours wait for your confirmation", when a supervisor records a
//   finish and when the scheduled job closes attendance left open;
// - "your dispute was settled", when an admin decides on disputed hours;
// - "an event was cancelled" / "its time or place changed" (for an online event:
//   "it is now online" or "its link changed"), to the members who joined it and
//   its supervisors;
// - "the meeting link is open", to the same people, 30 minutes before an online event;
// - "your event was approved" / "was not approved", to whoever proposed it in the app;
// - "your photo was removed", when an admin removes an unsuitable profile photo;
// - "a supervisor gave you a warning", and "your appeal was decided" / "the warning was withdrawn";
// - "your report was reviewed", to whoever reported, when an admin handles it;
// - a supervisor's notice to an event, to the members who joined it and its other supervisors;
// - "you are now a supervisor of this event", to whoever was made one in the app.

import { and, eq, gt, inArray, isNull, lte, ne } from 'drizzle-orm';

import { MEETING_LINK_OPENS_MINUTES } from '../../shared/rules';

import { closeDueAttendance } from './db/queries';
import * as s from './db/schema';
import type { AppDeps } from './http';
import type { PushMessage } from './push';

type Lang = 'ar' | 'en';
type Text = { title: string; body: string };

/** One notification per person, written in the language of each of their phones. */
interface Notice {
  userId: string;
  text: (lang: Lang) => Text;
  data: Record<string, string>;
}

/**
 * Sends to every phone each person signed in on. Runs after the answer has
 * gone out, so a slow or failing push service never delays or breaks a request.
 */
function send(deps: AppDeps, load: () => Promise<Notice[]>) {
  const { sendPush, db } = deps;
  if (!sendPush) return;
  deps.runLater(async () => {
    const notices = await load();
    if (notices.length === 0) return;
    const tokens = await db
      .select()
      .from(s.push_tokens)
      .where(inArray(s.push_tokens.user_id, [...new Set(notices.map((n) => n.userId))]));
    const messages: PushMessage[] = notices.flatMap((n) =>
      tokens.filter((t) => t.user_id === n.userId).map((t) => ({ to: t.token, ...n.text(t.lang), data: n.data })),
    );
    if (messages.length === 0) return;
    const results = await sendPush(messages);
    // A phone that uninstalled the app or turned notifications off: stop sending to it.
    const gone = messages.filter((_, i) => results[i] === 'device_not_registered').map((m) => m.to);
    if (gone.length) await db.delete(s.push_tokens).where(inArray(s.push_tokens.token, gone));
  });
}

async function attendanceWithEvent(deps: AppDeps, ids: string[]) {
  return deps.db
    .select({ id: s.attendance.id, user_id: s.attendance.user_id, event_title: s.events.title })
    .from(s.attendance)
    .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
    .where(inArray(s.attendance.id, ids));
}

// ---------- hours waiting for confirmation ----------

const TO_CONFIRM = {
  ar: {
    title: 'ساعاتك بانتظار تأكيدك',
    recorded: 'سُجّل انتهاء نشاطك في «{event}». راجع ساعاتك وأكّدها لتُضاف نقاطك.',
    auto_closed: 'أُغلق نشاطك في «{event}» آلياً عند انتهاء الفعالية. راجع ساعاتك وأكّدها.',
  },
  en: {
    title: 'Your hours are waiting for you',
    recorded: 'Your finish at "{event}" was recorded. Review and confirm your hours to earn your points.',
    auto_closed: 'Your activity at "{event}" closed automatically when the event ended. Review and confirm your hours.',
  },
};

export function notifyHoursToConfirm(deps: AppDeps, attendanceIds: string[], reason: 'recorded' | 'auto_closed') {
  if (attendanceIds.length === 0) return;
  send(deps, async () =>
    (await attendanceWithEvent(deps, attendanceIds)).map((r) => ({
      userId: r.user_id,
      text: (lang) => ({ title: TO_CONFIRM[lang].title, body: TO_CONFIRM[lang][reason].replace('{event}', r.event_title) }),
      data: { type: 'confirm_hours', attendance_id: r.id },
    })),
  );
}

/** The scheduled job, then a notification for each record it closed; and the meeting links that just opened. */
export async function closeDueAndNotify(deps: AppDeps) {
  const closed = await closeDueAttendance(deps.db, deps.now());
  notifyHoursToConfirm(deps, closed, 'auto_closed');
  await remindMeetingLinks(deps);
  return closed.length;
}

// ---------- an online event's link is open ----------

const LINK_OPEN = {
  ar: {
    title: 'رابط الفعالية متاح الآن',
    body: 'تبدأ «{event}» بعد قليل ({time} بتوقيت طرابلس). افتح الفعالية في التطبيق لتجد رابط الدخول.',
  },
  en: {
    title: 'The meeting link is open',
    body: '"{event}" starts soon ({time} Tripoli time). Open the event in the app for the link.',
  },
};

/**
 * Online events whose link opened (rules.MEETING_LINK_OPENS_MINUTES before the
 * start) and that start later: their people are told once for each start time.
 * Claiming the reminder row first means two runs at once never both send it.
 */
export async function remindMeetingLinks(deps: AppDeps) {
  const now = deps.now();
  const due = await deps.db
    .select({ id: s.events.id, title: s.events.title, starts_at: s.events.starts_at })
    .from(s.events)
    .where(
      and(
        eq(s.events.location_type, 'online'),
        eq(s.events.status, 'published'),
        gt(s.events.starts_at, new Date(now)),
        lte(s.events.starts_at, new Date(now + MEETING_LINK_OPENS_MINUTES * 60_000)),
      ),
    );
  for (const event of due) {
    const [claimed] = await deps.db
      .insert(s.meeting_link_reminders)
      .values({ event_id: event.id, starts_at: event.starts_at, sent_at: new Date(now) })
      .onConflictDoUpdate({
        target: s.meeting_link_reminders.event_id,
        set: { starts_at: event.starts_at, sent_at: new Date(now) },
        setWhere: ne(s.meeting_link_reminders.starts_at, event.starts_at),
      })
      .returning({ event_id: s.meeting_link_reminders.event_id });
    if (!claimed) continue;
    send(deps, async () =>
      (await peopleOfEvent(deps, event.id, '')).map((userId) => ({
        userId,
        text: (lang) => ({
          title: LINK_OPEN[lang].title,
          body: LINK_OPEN[lang].body.replace('{event}', event.title).replace('{time}', clockOf(event.starts_at, lang, deps.timeZone)),
        }),
        data: { type: 'meeting_link_open', event_id: event.id },
      })),
    );
  }
}

function clockOf(at: Date, lang: Lang, timeZone: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at);
}

// ---------- a dispute settled ----------

const SETTLED = {
  ar: {
    title: 'رُوجع اعتراضك',
    accept: 'اعتُمدت ساعاتك في «{event}» كما سجّلها المشرف.',
    correct: 'عُدّلت ساعاتك في «{event}» إلى {hours} ساعة.',
    reject: 'لم تُحتسب ساعات في «{event}».',
  },
  en: {
    title: 'Your dispute was reviewed',
    accept: 'Your hours at "{event}" stand as the supervisor recorded them.',
    correct: 'Your hours at "{event}" were corrected to {hours}.',
    reject: 'No hours were counted at "{event}".',
  },
};

export function notifyDisputeSettled(deps: AppDeps, attendanceId: string, decision: 'accept' | 'correct' | 'reject', hours: number) {
  send(deps, async () =>
    (await attendanceWithEvent(deps, [attendanceId])).map((r) => ({
      userId: r.user_id,
      text: (lang) => ({
        title: SETTLED[lang].title,
        body: SETTLED[lang][decision].replace('{event}', r.event_title).replace('{hours}', String(hours)),
      }),
      data: { type: 'dispute_settled', attendance_id: r.id },
    })),
  );
}

// ---------- an event cancelled or moved ----------

const EVENT_NEWS = {
  ar: {
    cancelledTitle: 'أُلغيت فعالية',
    cancelled: 'أُلغيت فعالية «{event}». نرجو أن نلقاك في فعالية قادمة.',
    changedTitle: 'تغيّرت فعالية',
    time: 'تغيّر موعد «{event}». الموعد الجديد: {when}.',
    place: 'تغيّر مكان «{event}». المكان الجديد: {place}.',
    both: 'تغيّر موعد «{event}» ومكانها. الموعد الجديد: {when}، في {place}.',
    link: 'تغيّر رابط «{event}» ({place}). تجد الرابط الجديد في صفحة الفعالية.',
    timeAndLink: 'تغيّر موعد «{event}» ورابطها. الموعد الجديد: {when}، والرابط في صفحة الفعالية.',
    online: 'أصبحت «{event}» فعالية عن بُعد ({place}). تجد الرابط في صفحة الفعالية قبل بدئها بنصف ساعة.',
  },
  en: {
    cancelledTitle: 'Event cancelled',
    cancelled: '"{event}" has been cancelled. We hope to see you at another event.',
    changedTitle: 'An event changed',
    time: '"{event}" has a new time: {when}.',
    place: '"{event}" has a new place: {place}.',
    both: '"{event}" has a new time and place: {when}, at {place}.',
    link: '"{event}" has a new meeting link ({place}). Find it on the event’s page.',
    timeAndLink: '"{event}" has a new time and meeting link: {when}. The link is on the event’s page.',
    online: '"{event}" is now held online ({place}). The link shows on the event’s page half an hour before it starts.',
  },
};

// Owner's decision (2026-11-07): online events say their times are Tripoli's.
const TRIPOLI_TIME = { ar: ' بتوقيت طرابلس', en: ' Tripoli time' };

const PLATFORM_NAMES = {
  ar: { zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams', telegram: 'تيليجرام', other: 'عن بُعد' },
  en: { zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams', telegram: 'Telegram', other: 'online' },
};

/** "الخميس 29 أكتوبر، 9:00 ص – 12:00 م" in the association's time zone, with Western digits. */
function when(start: Date, end: Date, lang: Lang, timeZone: string) {
  const locale = lang === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB';
  const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(start);
  const clock = new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${day}${lang === 'ar' ? '، ' : ', '}${clock.format(start)} – ${clock.format(end)}`;
}

/** The members who joined (deleted accounts left out) and the supervisors, except whoever made the change. */
async function peopleOfEvent(deps: AppDeps, eventId: string, exceptUserId: string) {
  const joined = await deps.db
    .select({ id: s.registrations.user_id })
    .from(s.registrations)
    .innerJoin(s.users, eq(s.users.id, s.registrations.user_id))
    .where(and(eq(s.registrations.event_id, eventId), eq(s.registrations.status, 'joined'), isNull(s.users.deleted_at)));
  const supervisors = await deps.db
    .select({ id: s.event_organizers.user_id })
    .from(s.event_organizers)
    .where(eq(s.event_organizers.event_id, eventId));
  return [...new Set([...joined, ...supervisors].map((r) => r.id))].filter((id) => id !== exceptUserId);
}

export function notifyEventCancelled(deps: AppDeps, eventId: string, actorId: string) {
  send(deps, async () => {
    const [event] = await deps.db.select().from(s.events).where(eq(s.events.id, eventId));
    if (!event) return [];
    return (await peopleOfEvent(deps, eventId, actorId)).map((userId) => ({
      userId,
      text: (lang) => ({ title: EVENT_NEWS[lang].cancelledTitle, body: EVENT_NEWS[lang].cancelled.replace('{event}', event.title) }),
      data: { type: 'event_cancelled', event_id: eventId },
    }));
  });
}

/** Only a new time or place is worth a notification; a corrected title or description is not. */
/** `wasOnline`: where the event was before the change (a move to online says so). */
export function notifyEventChanged(
  deps: AppDeps,
  eventId: string,
  actorId: string,
  changed: { time: boolean; place: boolean; wasOnline: boolean },
) {
  if (!changed.time && !changed.place) return;
  send(deps, async () => {
    const [event] = await deps.db.select().from(s.events).where(eq(s.events.id, eventId));
    if (!event) return [];
    const online = event.location_type === 'online';
    const which: keyof typeof EVENT_NEWS.en = !changed.place
      ? 'time'
      : online && !changed.wasOnline
        ? 'online'
        : online
          ? changed.time
            ? 'timeAndLink'
            : 'link'
          : changed.time
            ? 'both'
            : 'place';
    return (await peopleOfEvent(deps, eventId, actorId)).map((userId) => ({
      userId,
      text: (lang) => ({
        title: EVENT_NEWS[lang].changedTitle,
        body: EVENT_NEWS[lang][which]
          .replace('{event}', event.title)
          .replace('{when}', when(event.starts_at, event.ends_at, lang, deps.timeZone) + (online ? TRIPOLI_TIME[lang] : ''))
          .replace('{place}', online ? PLATFORM_NAMES[lang][event.meeting_platform ?? 'other'] : (event.address_text ?? '')),
      }),
      data: { type: 'event_changed', event_id: eventId },
    }));
  });
}

// ---------- a notice to an event's people ----------

const NOTICE = {
  ar: { announcement: 'إعلان من مشرفي «{event}»', question: 'سؤال من مشرفي «{event}»' },
  en: { announcement: 'A notice about "{event}"', question: 'A question about "{event}"' },
};
/** A notification shows a few lines; the event's page has the whole notice. */
const NOTICE_PREVIEW = 180;

export function notifyEventNotice(deps: AppDeps, noticeId: string) {
  send(deps, async () => {
    const [row] = await deps.db
      .select({ notice: s.event_notices, title: s.events.title })
      .from(s.event_notices)
      .innerJoin(s.events, eq(s.events.id, s.event_notices.event_id))
      .where(eq(s.event_notices.id, noticeId));
    if (!row) return [];
    const { notice } = row;
    const body = notice.body.length > NOTICE_PREVIEW ? `${notice.body.slice(0, NOTICE_PREVIEW - 1)}…` : notice.body;
    return (await peopleOfEvent(deps, notice.event_id, notice.author_id)).map((userId) => ({
      userId,
      text: (lang) => ({ title: NOTICE[lang][notice.kind].replace('{event}', row.title), body }),
      data: { type: 'event_notice', event_id: notice.event_id },
    }));
  });
}

// ---------- made a supervisor of an event ----------

const SUPERVISOR_ADDED = {
  ar: {
    title: 'أصبحت مشرفاً',
    body: 'أصبحت من مشرفي «{event}». تستطيع الآن تسجيل حضور المشاركين ونشر الإعلانات لهم.',
  },
  en: {
    title: 'You are now a supervisor',
    body: 'You are now a supervisor of "{event}". You can record attendance and post notices to its participants.',
  },
};

export function notifySupervisorAdded(deps: AppDeps, eventId: string, userId: string) {
  send(deps, async () => {
    const [event] = await deps.db.select({ title: s.events.title }).from(s.events).where(eq(s.events.id, eventId));
    if (!event) return [];
    return [
      {
        userId,
        text: (lang: Lang) => ({ title: SUPERVISOR_ADDED[lang].title, body: SUPERVISOR_ADDED[lang].body.replace('{event}', event.title) }),
        data: { type: 'supervisor_added', event_id: eventId },
      },
    ];
  });
}

// ---------- an event proposed in the app, approved or turned down ----------

const DECIDED = {
  ar: {
    approvedTitle: 'اعتُمدت فعاليتك',
    approved: 'اعتمدت إدارة الجمعية «{event}»، وهي الآن على الخريطة.',
    rejectedTitle: 'لم تُعتمد فعاليتك',
    rejected: 'لم تعتمد إدارة الجمعية «{event}».',
    reason: ' السبب: {note}',
  },
  en: {
    approvedTitle: 'Your event was approved',
    approved: 'The association approved "{event}". It is now on the map.',
    rejectedTitle: 'Your event was not approved',
    rejected: 'The association did not approve "{event}".',
    reason: ' Reason: {note}',
  },
};

export function notifyProposalDecided(deps: AppDeps, eventId: string, decision: 'approved' | 'rejected', note?: string) {
  send(deps, async () => {
    const [event] = await deps.db.select().from(s.events).where(eq(s.events.id, eventId));
    if (!event) return [];
    return [
      {
        userId: event.created_by,
        text: (lang: Lang) => {
          const d = DECIDED[lang];
          const body = d[decision].replace('{event}', event.title) + (note ? d.reason.replace('{note}', note) : '');
          return { title: decision === 'approved' ? d.approvedTitle : d.rejectedTitle, body };
        },
        data: { type: decision === 'approved' ? 'event_approved' : 'event_rejected', event_id: eventId },
      },
    ];
  });
}

// ---------- a profile photo removed by an admin ----------

const PHOTO_REMOVED = {
  ar: { title: 'أُزيلت صورتك', body: 'أزالت إدارة الجمعية صورة حسابك لأنها لا تناسب التطبيق. تستطيع إضافة صورة أخرى.' },
  en: { title: 'Your photo was removed', body: "The association removed your profile photo because it doesn't suit the app. You can add another one." },
};

export function notifyPhotoRemoved(deps: AppDeps, userId: string) {
  send(deps, async () => [{ userId, text: (lang: Lang) => PHOTO_REMOVED[lang], data: { type: 'photo_removed' } }]);
}

// ---------- warnings ----------

// The reason stays out of the notification: it shows on a locked screen, and a
// warning is between the association and the member. The app shows it.
const WARNING = {
  ar: {
    givenTitle: 'إنذار من مشرف',
    given: 'سجّل لك مشرف «{event}» إنذاراً. افتح التطبيق لتقرأ سببه، ولك أن تتظلّم منه.',
    upheldTitle: 'رُوجع تظلّمك',
    upheld: 'راجعت إدارة الجمعية تظلّمك من إنذار «{event}» وأبقته. افتح التطبيق لتقرأ السبب.',
    withdrawnTitle: 'سُحب إنذار',
    withdrawn: 'سحبت إدارة الجمعية الإنذار الذي سُجّل لك في «{event}».',
  },
  en: {
    givenTitle: 'A warning from a supervisor',
    given: 'A supervisor of "{event}" gave you a warning. Open the app to read why; you may appeal it.',
    upheldTitle: 'Your appeal was reviewed',
    upheld: 'The association reviewed your appeal against the warning at "{event}" and kept it. Open the app to read why.',
    withdrawnTitle: 'A warning was withdrawn',
    withdrawn: 'The association withdrew the warning you were given at "{event}".',
  },
};

async function warningWithEvent(deps: AppDeps, warningId: string) {
  return deps.db
    .select({ id: s.warnings.id, user_id: s.warnings.user_id, event_title: s.events.title })
    .from(s.warnings)
    .innerJoin(s.events, eq(s.events.id, s.warnings.event_id))
    .where(eq(s.warnings.id, warningId));
}

export function notifyWarningGiven(deps: AppDeps, warningId: string) {
  send(deps, async () =>
    (await warningWithEvent(deps, warningId)).map((r) => ({
      userId: r.user_id,
      text: (lang) => ({ title: WARNING[lang].givenTitle, body: WARNING[lang].given.replace('{event}', r.event_title) }),
      data: { type: 'warning_given', warning_id: r.id },
    })),
  );
}

export function notifyWarningDecided(deps: AppDeps, warningId: string, decision: 'upheld' | 'withdrawn') {
  send(deps, async () =>
    (await warningWithEvent(deps, warningId)).map((r) => ({
      userId: r.user_id,
      text: (lang) => {
        const w = WARNING[lang];
        return { title: decision === 'upheld' ? w.upheldTitle : w.withdrawnTitle, body: w[decision].replace('{event}', r.event_title) };
      },
      data: { type: 'warning_decided', warning_id: r.id },
    })),
  );
}

// ---------- a report reviewed ----------

// Owner's decision (2026-10-23): whoever reported is told it was looked at, but not what was done,
// which may be about someone else.
const REPORT_HANDLED = {
  ar: { title: 'رُوجع بلاغك', body: 'راجعت إدارة الجمعية بلاغك. جزاك الله خيراً على حرصك.' },
  en: { title: 'Your report was reviewed', body: 'The association reviewed your report. Thank you for looking out for others.' },
};

export function notifyReportHandled(deps: AppDeps, reportId: string) {
  send(deps, async () => {
    const [report] = await deps.db.select({ reporter_id: s.reports.reporter_id }).from(s.reports).where(eq(s.reports.id, reportId));
    if (!report) return [];
    return [{ userId: report.reporter_id, text: (lang: Lang) => REPORT_HANDLED[lang], data: { type: 'report_handled', report_id: reportId } }];
  });
}
