// Certificates of confirmed hours (owner's decisions, 2026-11-19; shared/types.ts
// Certificate). The app makes the PDF; the server keeps what it says, from its
// own records, so its QR code can be checked: GET /api/verify/:id shows the
// name, the hours and the day it was made, and nothing more.

import { randomInt } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { CertificateResponse } from '../../../shared/api';
import { ApiError } from '../../../shared/errors';
import * as rules from '../../../shared/rules';
import { requireUser } from '../auth';
import type { Database } from '../db/client';
import { findInstitution, membershipOf } from '../db/queries';
import { iso } from '../db/rows';
import * as s from '../db/schema';
import { type AppContext, type AppEnv, readBody } from '../http';

const makeBody = z.object({ institution_id: z.string().max(80).nullish() });

// No letters that look alike (0/O, 1/I/L): the code may be typed in by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const newCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** The person's confirmed hours, as the hours record counts them: all, or one institution's. */
async function confirmedHours(db: Database, userId: string, institutionId: string | null) {
  const attended = await db
    .select({ event_id: s.attendance.event_id, hours: s.attendance.hours, institution_id: s.events.institution_id })
    .from(s.attendance)
    .innerJoin(s.events, eq(s.events.id, s.attendance.event_id))
    .where(and(eq(s.attendance.user_id, userId), eq(s.attendance.participant_status, 'confirmed')));
  const outside = await db
    .select({ minutes: s.outside_hours.minutes, institution_id: s.outside_hours.institution_id })
    .from(s.outside_hours)
    .where(and(eq(s.outside_hours.user_id, userId), eq(s.outside_hours.status, 'approved')));
  const mine = attended.filter((a) => (a.hours ?? 0) > 0 && (!institutionId || a.institution_id === institutionId));
  const eventHours = mine.reduce((sum, a) => sum + (a.hours ?? 0), 0);
  const outsideHours = outside.filter((o) => !institutionId || o.institution_id === institutionId).reduce((sum, o) => sum + o.minutes, 0) / 60;
  return { hours: rules.round2(eventHours + outsideHours), events: new Set(mine.map((a) => a.event_id)).size, outside_hours: rules.round2(outsideHours) };
}

function verifyUrl(c: AppContext, id: string) {
  const base = c.var.deps.publicUrl ?? new URL(c.req.url).origin;
  return `${base}/api/verify/${id}`;
}

export const certificateRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .post('/', async (c) => {
    const { db, now } = c.var.deps;
    const me = c.var.user;
    const body = await readBody(c, makeBody);
    const institutionId = body.institution_id ?? null;
    const institution = institutionId ? await findInstitution(db, institutionId) : null;
    // One of their own institutions only (confirmed): someone else's is not there.
    if (institutionId && (!institution || (await membershipOf(db, institutionId, me.id))?.status !== 'confirmed')) throw new ApiError('not_found');
    const totals = await confirmedHours(db, me.id, institutionId);
    const id = newCode();
    const [row] = await db
      .insert(s.certificates)
      .values({ id, user_id: me.id, institution_id: institutionId, ...totals, issued_at: new Date(now()) })
      .returning();
    return c.json<CertificateResponse>(
      {
        certificate: iso(row),
        institution: institution ? { id: institution.id, name: institution.name, kind: institution.kind } : null,
        verify_url: verifyUrl(c, id),
      },
      201,
    );
  });

const PAGE = {
  title: 'التحقق من شهادة ساعات تطوعية · Certificate check',
  valid: 'شهادة صحيحة · Valid certificate',
  missing: 'لا توجد شهادة بهذا الرمز · No certificate has this code',
  name: 'الاسم · Name',
  hours: 'الساعات المؤكدة · Confirmed hours',
  institution: 'المؤسسة · Institution',
  issued: 'أُعدّت في · Issued on',
  code: 'الرمز · Code',
  by: 'الأعمال الصالحة · الإصلاح التربوي',
};

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(rows: [string, string][] | null, ok: boolean) {
  const body = rows ? `<dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>` : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(PAGE.title)}</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#f6f4ef;color:#1d2a24;margin:0;padding:24px 16px}
main{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
h1{font-size:20px;margin:0 0 16px;color:${ok ? '#1f6f50' : '#a33'}}dt{color:#6b766f;font-size:13px;margin-top:12px}dd{margin:2px 0 0;font-size:17px;font-weight:600}
footer{margin-top:20px;color:#6b766f;font-size:13px}</style></head>
<body><main><h1>${escapeHtml(ok ? PAGE.valid : PAGE.missing)}</h1>${body}<footer>${escapeHtml(PAGE.by)}</footer></main></body></html>`;
}

/** The public page a certificate's QR code opens. No sign-in: whoever holds the certificate may check it. */
export const verifyRoutes = new Hono<AppEnv>().get('/:id', async (c) => {
  const { db, timeZone } = c.var.deps;
  const id = c.req.param('id').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  const [row] = await db
    .select({ cert: s.certificates, full_name: s.users.full_name, deleted_at: s.users.deleted_at, institution: s.institutions.name })
    .from(s.certificates)
    .innerJoin(s.users, eq(s.users.id, s.certificates.user_id))
    .leftJoin(s.institutions, eq(s.institutions.id, s.certificates.institution_id))
    .where(eq(s.certificates.id, id));
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };
  // A deleted account's certificates are no longer shown: its name is gone.
  if (!row || row.deleted_at) return c.html(page(null, false), 404, headers);
  const issued = new Intl.DateTimeFormat('ar-LY-u-nu-latn', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(row.cert.issued_at);
  const rows: [string, string][] = [
    [PAGE.name, row.full_name],
    [PAGE.hours, String(row.cert.hours)],
    ...(row.institution ? ([[PAGE.institution, row.institution]] as [string, string][]) : []),
    [PAGE.issued, issued],
    [PAGE.code, row.cert.id],
  ];
  return c.html(page(rows, true), 200, headers);
});
