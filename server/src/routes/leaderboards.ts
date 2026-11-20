// Leaderboards (owner's decisions, 2026-11-20): this month's confirmed hours,
// for the whole association or within one of the person's institutions. Only
// those who turned "show me on leaderboards" on are listed; everyone sees the
// boards, and their own hours and place (if shown).

import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { Hono } from 'hono';

import type { LeaderboardResponse } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import { requireUser } from '../auth';
import { findInstitution, membershipOf, publicUser, shownTo } from '../db/queries';
import * as s from '../db/schema';
import type { AppEnv } from '../http';

/** How many are listed. */
export const LEADERBOARD_SIZE = 20;

export const leaderboardRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const { db, now, timeZone } = c.var.deps;
    const me = c.var.user;
    const institutionId = c.req.query('institution_id') || null;
    const institution = institutionId ? await findInstitution(db, institutionId) : null;
    // One of the person's own institutions (confirmed): another's board is not there.
    if (institutionId && (!institution || institution.status !== 'approved' || (await membershipOf(db, institutionId, me.id))?.status !== 'confirmed')) {
      throw new ApiError('not_found');
    }
    const month = rules.dayIn(now(), timeZone).slice(0, 7);
    const first = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    // A day either side, then each record's own day where the association is decides.
    const from = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000);
    const to = new Date(Date.parse(`${next}T00:00:00Z`) + 86_400_000);
    const members = institutionId
      ? (
          await db
            .select({ user_id: s.institution_members.user_id })
            .from(s.institution_members)
            .where(and(eq(s.institution_members.institution_id, institutionId), eq(s.institution_members.status, 'confirmed')))
        ).map((r) => r.user_id)
      : null;
    const among = (column: typeof s.attendance.user_id | typeof s.outside_hours.user_id) =>
      members ? inArray(column, members.length ? members : ['']) : undefined;
    const attended = await db
      .select({ user_id: s.attendance.user_id, hours: s.attendance.hours, started_at: s.attendance.started_at })
      .from(s.attendance)
      .where(and(eq(s.attendance.participant_status, 'confirmed'), gte(s.attendance.started_at, from), lt(s.attendance.started_at, to), among(s.attendance.user_id)));
    const outside = await db
      .select({ user_id: s.outside_hours.user_id, minutes: s.outside_hours.minutes })
      .from(s.outside_hours)
      .where(and(eq(s.outside_hours.status, 'approved'), gte(s.outside_hours.done_on, first), lt(s.outside_hours.done_on, next), among(s.outside_hours.user_id)));
    const totals = new Map<string, number>();
    for (const a of attended) {
      const day = rules.dayIn(a.started_at.getTime(), timeZone);
      if (day >= first && day < next) totals.set(a.user_id, (totals.get(a.user_id) ?? 0) + (a.hours ?? 0));
    }
    for (const o of outside) totals.set(o.user_id, (totals.get(o.user_id) ?? 0) + o.minutes / 60);
    const ids = [...totals.keys()];
    const people = ids.length
      ? await db
          .select({ ...publicUser, show: s.users.show_on_leaderboards })
          .from(s.users)
          .where(and(inArray(s.users.id, ids), isNull(s.users.deleted_at)))
      : [];
    const ranked = people
      .filter((p) => p.show && (totals.get(p.id) ?? 0) > 0)
      .map(({ show: _show, ...user }) => ({ user, hours: rules.round2(totals.get(user.id)!) }))
      .sort((a, b) => b.hours - a.hours || a.user.full_name.localeCompare(b.user.full_name, 'ar'));
    // Equal hours share a place (1, 2, 2, 4).
    const rankOf = (i: number) => ranked.findIndex((r) => r.hours === ranked[i].hours) + 1;
    const mine = ranked.findIndex((r) => r.user.id === me.id);
    return c.json<LeaderboardResponse>({
      institution: institution ? { id: institution.id, name: institution.name, kind: institution.kind } : null,
      month,
      rows: ranked.slice(0, LEADERBOARD_SIZE).map((r, i) => ({ rank: rankOf(i), user: shownTo(me, r.user), hours: r.hours })),
      me: { hours: rules.round2(totals.get(me.id) ?? 0), rank: mine >= 0 ? rankOf(mine) : null, shown: me.show_on_leaderboards },
    });
  });
