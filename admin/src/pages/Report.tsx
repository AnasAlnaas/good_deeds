import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { HoursReportRow } from '../../../shared/admin-api';
import { api } from '../api';
import { dayInput, ltr, num } from '../format';
import { t } from '../strings';
import { Button, PageHeader, QueryState } from '../ui';

// A day picked in the form covers that whole day in local time; the server takes exact times.
const startOf = (day: string) => new Date(`${day}T00:00`).toISOString();
const endOf = (day: string) => {
  const d = new Date(`${day}T00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export function Report() {
  const today = new Date();
  const [from, setFrom] = useState(dayInput(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(dayInput(today));
  const [range, setRange] = useState({ from, to });
  const query = useQuery({
    queryKey: ['report', range.from, range.to],
    queryFn: () => api.hoursReport(startOf(range.from), endOf(range.to)),
  });
  const rows = query.data ?? [];
  const totals = {
    events: rows.reduce((s, r) => s + r.events, 0),
    hours: rows.reduce((s, r) => s + r.hours, 0),
    points: rows.reduce((s, r) => s + r.total_points, 0),
  };

  return (
    <>
      <PageHeader title={t.report.title} body={t.report.body} />
      <form
        className="row"
        style={{ alignItems: 'end' }}
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to });
        }}>
        <label className="field">
          <span className="field-label">{t.report.from}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t.report.to}</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="submit" disabled={!from || !to || to < from}>
          {t.report.show}
        </Button>
        {rows.length > 0 && (
          <Button variant="secondary" onClick={() => downloadCsv(rows, range.from, range.to)}>
            {t.report.download}
          </Button>
        )}
      </form>
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.report.name}</th>
                <th>{t.report.phone}</th>
                <th>{t.report.city}</th>
                <th className="num">{t.report.events}</th>
                <th className="num">{t.report.hours}</th>
                <th className="num">{t.report.total}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.full_name}</td>
                  <td className="ltr tabular">{r.phone}</td>
                  <td>{r.city}</td>
                  <td className="num">{r.events}</td>
                  <td className="num">{num(r.hours)}</td>
                  <td className="num">{num(r.total_points)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3}>{t.report.sum}</td>
                  <td className="num">{totals.events}</td>
                  <td className="num">{num(totals.hours)}</td>
                  <td className="num">{num(totals.points)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {rows.length === 0 && <p className="empty">{t.report.empty}</p>}
        </div>
      )}
    </>
  );
}

/**
 * A CSV that Excel opens with Arabic intact: UTF-8 with a byte-order mark.
 * Names and cities are typed by members, and Excel runs a cell starting with
 * = + - @ (or a tab or carriage return) as a formula, so such text gets a ' in
 * front and is shown as typed. Numbers stay numbers.
 */
function downloadCsv(rows: HoursReportRow[], from: string, to: string) {
  const cell = (value: string | number) => {
    if (typeof value === 'number') return String(value);
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = [t.report.name, t.report.phone, t.report.city, t.report.gender, t.report.events, t.report.hours, t.report.total];
  const lines = rows.map((r) =>
    // The phone inside left-to-right marks: Excel then keeps it as text (+218…), not a number in scientific notation.
    [r.full_name, ltr(r.phone), r.city, t.gender[r.gender], r.events, r.hours, r.total_points].map(cell).join(','),
  );
  const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${t.report.fileName}-${from}-${to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
