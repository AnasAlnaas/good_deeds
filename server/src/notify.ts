// Who is told what. Today there is one notification: "your hours wait for
// your confirmation", sent when a supervisor records a finish and when the
// scheduled job closes attendance left open at the event's end.

import { eq, inArray } from 'drizzle-orm';

import { closeDueAttendance } from './db/queries';
import * as s from './db/schema';
import type { AppDeps } from './http';
import type { PushMessage } from './push';

type Reason = 'recorded' | 'auto_closed';

const TEXT = {
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

/**
 * Tells each participant that their hours wait for confirmation, on every
 * phone they signed in on. Runs after the answer has gone out, so a slow or
 * failing push service never delays or breaks the request.
 */
export function notifyHoursToConfirm(deps: AppDeps, attendanceIds: string[], reason: Reason) {
  const { sendPush, db } = deps;
  if (!sendPush || attendanceIds.length === 0) return;
  deps.runLater(async () => {
    const rows = await db
      .select({ attendance_id: s.attendance.id, event_title: s.events.title, token: s.push_tokens.token, lang: s.push_tokens.lang })
      .from(s.attendance)
      .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
      .innerJoin(s.push_tokens, eq(s.push_tokens.user_id, s.attendance.user_id))
      .where(inArray(s.attendance.id, attendanceIds));
    if (rows.length === 0) return;
    const messages: PushMessage[] = rows.map((r) => ({
      to: r.token,
      title: TEXT[r.lang].title,
      body: TEXT[r.lang][reason].replace('{event}', r.event_title),
      data: { type: 'confirm_hours', attendance_id: r.attendance_id },
    }));
    const results = await sendPush(messages);
    // A phone that uninstalled the app or turned notifications off: stop sending to it.
    const gone = messages.filter((_, i) => results[i] === 'device_not_registered').map((m) => m.to);
    if (gone.length) await db.delete(s.push_tokens).where(inArray(s.push_tokens.token, gone));
  });
}

/** The scheduled job, then a notification for each record it closed. */
export async function closeDueAndNotify(deps: AppDeps) {
  const closed = await closeDueAttendance(deps.db, deps.now());
  notifyHoursToConfirm(deps, closed, 'auto_closed');
  return closed.length;
}
