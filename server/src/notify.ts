// Who is told what:
// - "your hours wait for your confirmation", when a supervisor records a
//   finish and when the scheduled job closes attendance left open;
// - "your dispute was settled", when an admin decides on disputed hours;
// - "an event was cancelled" / "its time or place changed", to the members
//   who joined it and its supervisors.

import { and, eq, inArray, isNull } from 'drizzle-orm';

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

/** The scheduled job, then a notification for each record it closed. */
export async function closeDueAndNotify(deps: AppDeps) {
  const closed = await closeDueAttendance(deps.db, deps.now());
  notifyHoursToConfirm(deps, closed, 'auto_closed');
  return closed.length;
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
  },
  en: {
    cancelledTitle: 'Event cancelled',
    cancelled: '"{event}" has been cancelled. We hope to see you at another event.',
    changedTitle: 'An event changed',
    time: '"{event}" has a new time: {when}.',
    place: '"{event}" has a new place: {place}.',
    both: '"{event}" has a new time and place: {when}, at {place}.',
  },
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
export function notifyEventChanged(deps: AppDeps, eventId: string, actorId: string, changed: { time: boolean; place: boolean }) {
  if (!changed.time && !changed.place) return;
  const which = changed.time && changed.place ? 'both' : changed.time ? 'time' : 'place';
  send(deps, async () => {
    const [event] = await deps.db.select().from(s.events).where(eq(s.events.id, eventId));
    if (!event) return [];
    return (await peopleOfEvent(deps, eventId, actorId)).map((userId) => ({
      userId,
      text: (lang) => ({
        title: EVENT_NEWS[lang].changedTitle,
        body: EVENT_NEWS[lang][which]
          .replace('{event}', event.title)
          .replace('{when}', when(event.starts_at, event.ends_at, lang, deps.timeZone))
          .replace('{place}', event.address_text),
      }),
      data: { type: 'event_changed', event_id: eventId },
    }));
  });
}
