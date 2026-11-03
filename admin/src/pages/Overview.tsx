import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { api } from '../api';
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
            {t.overview.newEvent}
          </Link>
        }
      />
      {!o ? (
        <QueryState query={query} />
      ) : (
        <>
          <div className="stats">
            <Stat n={o.open_disputes} label={t.overview.disputes} alert={o.open_disputes > 0} to="/disputes" />
            <Stat n={o.proposals_waiting} label={t.overview.proposals} alert={o.proposals_waiting > 0} to="/events?status=draft" />
            <Stat n={o.open_reports} label={t.overview.reports} alert={o.open_reports > 0} to="/reports" />
            <Stat n={o.appealed_warnings} label={t.overview.appeals} alert={o.appealed_warnings > 0} to="/warnings?status=appealed" />
            <Stat n={o.running_events} label={t.overview.running} to="/events" />
            <Stat n={o.upcoming_events} label={t.overview.upcoming} to="/events" />
            <Stat n={o.draft_events} label={t.overview.drafts} to="/events" />
            <Stat n={o.awaiting_confirmation} label={t.overview.awaiting} />
            <Stat n={o.users} label={t.overview.users} to="/users" />
          </div>
          {(o.open_disputes > 0 || o.proposals_waiting > 0 || o.open_reports > 0 || o.appealed_warnings > 0) && (
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
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({ n, label, alert, to }: { n: number; label: string; alert?: boolean; to?: string }) {
  const body = (
    <>
      <strong>{n}</strong>
      <span className="muted">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={`stat${alert ? ' alert' : ''}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
