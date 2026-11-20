import { useQuery } from '@tanstack/react-query';

import type { AdminHijriMonth } from '../../../shared/admin-api';
import { api } from '../api';
import { t } from '../strings';
import { Button, ErrorNote, PageHeader, QueryState, useAction } from '../ui';

const gregorian = (day: string) =>
  new Intl.DateTimeFormat('ar-LY-u-nu-latn', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));

/**
 * Owner's decisions (2026-11-20): the Hijri months follow Umm al-Qura; after
 * the moon is sighted an admin moves a month's start a day earlier or later.
 * Ramadan and Dhul Hijjah decide the badges of the blessed times.
 */
export function Hijri() {
  const query = useQuery({ queryKey: ['hijri'], queryFn: api.hijri });
  const { run, busy, error } = useAction();
  const set = (m: AdminHijriMonth, days: number) => run(() => api.setHijri(m.year, m.month, days));

  return (
    <>
      <PageHeader title={t.hijri.title} body={t.hijri.body} />
      <ErrorNote code={error} />
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.hijri.month}</th>
                <th>{t.hijri.base}</th>
                <th>{t.hijri.start}</th>
                <th>{t.hijri.move}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((m) => (
                <tr key={`${m.year}-${m.month}`} className={m.month === 9 || m.month === 12 ? 'highlight' : undefined}>
                  <td>
                    <strong>
                      {t.hijri.months[m.month - 1]} {m.year}
                    </strong>
                    {m.month === 9 && <div className="muted">{t.hijri.ramadanNote}</div>}
                    {m.month === 12 && <div className="muted">{t.hijri.dhulHijjahNote}</div>}
                  </td>
                  <td>{gregorian(m.base_start)}</td>
                  <td>{gregorian(m.start)}</td>
                  <td>
                    <div className="actions">
                      {[-1, 0, 1].map((d) => (
                        <Button key={d} variant={m.days === d ? 'primary' : 'secondary'} disabled={busy || m.days === d} onClick={() => void set(m, d)}>
                          {d === -1 ? t.hijri.earlier : d === 1 ? t.hijri.later : t.hijri.asIs}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
