import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { api } from '../api';
import { Icon, IconCircle, type IconName } from '../icons';
import { t } from '../strings';
import { PageHeader, QueryState } from '../ui';

export function Overview() {
  const query = useQuery({ queryKey: ['overview'], queryFn: api.overview });
  const o = query.data;

  return (
    <>
      <PageHeader
        title={t.overview.title}
        actions={
          <Link className="btn btn-primary" to="/events/new">
            <Icon name="add" />
            {t.overview.newEvent}
          </Link>
        }
      />
      {!o ? (
        <QueryState query={query} />
      ) : (
        <>
          <div className="stats">
            <Stat n={o.open_disputes} icon="scale" label={t.overview.disputes} alert={o.open_disputes > 0} to="/disputes" />
            <Stat n={o.proposals_waiting} icon="hourglass" label={t.overview.proposals} alert={o.proposals_waiting > 0} to="/events?status=draft" />
            <Stat n={o.open_reports} icon="flag" label={t.overview.reports} alert={o.open_reports > 0} to="/reports" />
            <Stat n={o.appealed_warnings} icon="warning" label={t.overview.appeals} alert={o.appealed_warnings > 0} to="/warnings?status=appealed" />
            <Stat n={o.institutions_waiting} icon="building" label={t.overview.institutions} alert={o.institutions_waiting > 0} to="/institutions?status=pending" />
            <Stat n={o.running_events} icon="time" label={t.overview.running} to="/events?status=running" />
            <Stat n={o.upcoming_events} icon="calendar" label={t.overview.upcoming} to="/events?status=published" />
            <Stat n={o.draft_events} icon="list" label={t.overview.drafts} to="/events?status=draft" />
            <Stat n={o.awaiting_confirmation} icon="check" label={t.overview.awaiting} />
            <Stat n={o.users} icon="people" label={t.overview.users} to="/users" />
          </div>
          {(o.open_disputes > 0 || o.proposals_waiting > 0 || o.open_reports > 0 || o.appealed_warnings > 0 || o.institutions_waiting > 0) && (
            <div className="actions">
              {o.open_disputes > 0 && (
                <Link className="btn btn-secondary" to="/disputes">
                  {t.overview.reviewDisputes}
                </Link>
              )}
              {o.proposals_waiting > 0 && (
                <Link className="btn btn-secondary" to="/events?status=draft">
                  {t.overview.reviewProposals}
                </Link>
              )}
              {o.open_reports > 0 && (
                <Link className="btn btn-secondary" to="/reports">
                  {t.overview.reviewReports}
                </Link>
              )}
              {o.appealed_warnings > 0 && (
                <Link className="btn btn-secondary" to="/warnings?status=appealed">
                  {t.overview.reviewAppeals}
                </Link>
              )}
              {o.institutions_waiting > 0 && (
                <Link className="btn btn-secondary" to="/institutions?status=pending">
                  {t.overview.reviewInstitutions}
                </Link>
              )}
            </div>
          )}
          <HoursCharts />
        </>
      )}
    </>
  );
}

const hoursText = (h: number) => `${Math.round(h * 10) / 10} ${t.overview.hoursUnit}`;

/**
 * Owner's decisions (2026-11-19): confirmed hours by month, by organiser and by
 * city. One measure each, so one colour (the panel's primary); every bar names
 * its value on hover, and the numbers are also there as a table.
 */
function HoursCharts() {
  const query = useQuery({ queryKey: ['hoursStats'], queryFn: api.hoursStats });
  const d = query.data;
  if (!d) return <QueryState query={query} />;
  const monthLabel = (m: string) => `${t.overview.monthNames[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
  const top = Math.max(1, ...d.months.map((m) => m.hours));
  const any = d.months.some((m) => m.hours > 0);
  return (
    <section className="charts">
      <h2>{t.overview.chartsTitle}</h2>
      {!any ? (
        <p className="muted">{t.overview.noHours}</p>
      ) : (
        <>
          <figure className="chart">
            <figcaption>{t.overview.byMonth}</figcaption>
            <div className="columns" role="img" aria-label={t.overview.byMonth}>
              {d.months.map((m) => (
                <div key={m.month} className="column" title={`${monthLabel(m.month)}: ${hoursText(m.hours)}`}>
                  <span className="column-bar" style={{ height: `${(m.hours / top) * 100}%` }} />
                  <span className="column-label">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
            <details>
              <summary>{t.overview.showTable}</summary>
              <table className="table">
                <tbody>
                  {d.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td>{hoursText(m.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </figure>
          <div className="chart-pair">
            <Bars title={t.overview.byInstitution} rows={d.institutions.map((x) => ({ label: x.name || t.overview.association, hours: x.hours }))} />
            <Bars title={t.overview.byCity} rows={d.cities.map((x) => ({ label: x.city, hours: x.hours }))} />
          </div>
        </>
      )}
    </section>
  );
}

/** Horizontal bars, largest first, each with its name and value written beside it. */
function Bars({ title, rows }: { title: string; rows: { label: string; hours: number }[] }) {
  const top = Math.max(1, ...rows.map((r) => r.hours));
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {rows.map((r) => (
        <div key={r.label} className="hbar" title={`${r.label}: ${hoursText(r.hours)}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(r.hours / top) * 100}%` }} />
          </span>
          <span className="hbar-value">{hoursText(r.hours)}</span>
        </div>
      ))}
    </figure>
  );
}

function Stat({ n, icon, label, alert, to }: { n: number; icon: IconName; label: string; alert?: boolean; to?: string }) {
  const body = (
    <>
      <strong>{n}</strong>
      <IconCircle name={icon} />
      <span className="muted">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={`stat${alert ? ' alert' : ''}`}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
