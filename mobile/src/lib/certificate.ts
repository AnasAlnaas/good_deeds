import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { Platform } from 'react-native';

import type { CertificateResponse } from '@/data/api';
import { count, date, fmt, num } from '@/i18n/format';
import type { Strings } from '@/i18n/strings';
import { safeFileName } from '@/lib/shareFile';

export interface CertificateEntry {
  day: string;
  title: string;
  hours: number;
}

const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The association's logo, inside the page (a PDF made on the phone loads nothing from outside). */
async function logoSource() {
  const asset = Asset.fromModule(require('../../assets/brand/islah-tarbawi.png'));
  await asset.downloadAsync();
  if (Platform.OS === 'web') return asset.uri;
  const base64 = await new File(asset.localUri ?? asset.uri).base64();
  return `data:image/png;base64,${base64}`;
}

/**
 * Owner's decisions (2026-11-19): the certificate as an A4 page, with the
 * association's logo, the volunteer's name, their confirmed hours (all, or one
 * institution's) and the events, and a QR code with its code that opens the
 * server's check page (none in the demo, which has no server).
 */
export async function certificateHtml(args: { made: CertificateResponse; name: string; entries: CertificateEntry[]; s: Strings; rtl: boolean }) {
  const { made, name, entries, s, rtl } = args;
  const { certificate: c } = made;
  const qr = made.verify_url ? await QRCode.toString(made.verify_url, { type: 'svg', margin: 0, width: 120 }) : '';
  const logo = await logoSource().catch(() => null);
  const t = s.certificate;
  const rows = entries
    .map((e) => `<tr><td>${escapeHtml(e.day)}</td><td>${escapeHtml(e.title)}</td><td class="n">${escapeHtml(count(e.hours, s.units.hour))}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<style>
@page{size:A4;margin:18mm}
body{font-family:"Noto Naskh Arabic","Segoe UI",Tahoma,Arial,sans-serif;color:#1d2a24;margin:0}
.frame{border:3px double #1f6f50;border-radius:14px;padding:28px 32px}
header{text-align:center}header img{width:84px;height:84px;object-fit:contain}
.assoc{color:#6b766f;font-size:14px;margin-top:6px}
h1{font-size:28px;color:#1f6f50;margin:18px 0 8px}
.lead{font-size:16px;margin:0}.name{font-size:26px;font-weight:700;margin:10px 0}
.total{font-size:18px;margin:6px 0 2px}.total b{color:#1f6f50;font-size:22px}
.scope{color:#1f6f50;font-size:15px}
table{width:100%;border-collapse:collapse;margin-top:22px;font-size:13px}
th,td{border-bottom:1px solid #e2ddd2;padding:7px 6px;text-align:start}th{color:#6b766f;font-weight:600}.n{white-space:nowrap}
footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;gap:16px}
.meta{font-size:12px;color:#6b766f;line-height:1.7}.qr svg{width:110px;height:110px}.code{font-family:monospace;font-size:13px;letter-spacing:1px;text-align:center}
</style></head><body><div class="frame">
<header>${logo ? `<img src="${logo}" alt="">` : ''}<div class="assoc">${escapeHtml(s.association)}</div>
<h1>${escapeHtml(t.title)}</h1>
<p class="lead">${escapeHtml(t.lead)}</p>
<div class="name">${escapeHtml(name)}</div>
<p class="total">${escapeHtml(t.gave)} <b>${escapeHtml(count(c.hours, s.units.hour))}</b> ${escapeHtml(fmt(t.inEvents, { n: num(c.events) }))}</p>
${c.outside_hours > 0 ? `<p class="meta">${escapeHtml(fmt(t.outside, { hours: count(c.outside_hours, s.units.hour) }))}</p>` : ''}
${made.institution ? `<p class="scope">${escapeHtml(fmt(t.forInstitution, { name: made.institution.name }))}</p>` : ''}
</header>
${rows ? `<table><thead><tr><th>${escapeHtml(t.day)}</th><th>${escapeHtml(t.work)}</th><th>${escapeHtml(t.hours)}</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
<footer><div class="meta">${escapeHtml(fmt(t.issued, { day: date(c.issued_at, s) }))}<br>${escapeHtml(made.verify_url ? t.check : t.demo)}</div>
${qr ? `<div><div class="qr">${qr}</div><div class="code">${escapeHtml(c.id)}</div></div>` : ''}</footer>
</div></body></html>`;
}

/** The PDF, sent through the share sheet (WhatsApp, email, files…); on the web, the print window. */
export async function shareCertificate(args: Parameters<typeof certificateHtml>[0]) {
  const html = await certificateHtml(args);
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  // A file named after the person reads better where it is sent than a random one.
  const named = new File(Paths.cache, `${safeFileName(`${args.s.certificate.title}-${args.name}`)}.pdf`);
  if (named.exists) named.delete();
  new File(uri).copy(named);
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: args.s.certificate.title });
}
