import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { EventStatus } from '../../../shared/types';
import { api } from '../api';
import { fill, range } from '../format';
import { t } from '../strings';
import { PageHeader, QueryState, StatusBadge } from '../ui';

const FILTERS: (EventStatus | 'all')[] = ['all', 'running', 'published', 'draft', 'finished', 'cancelled'];

export function Events() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['events'], queryFn: api.events });
  const [filter, setFilter] = useState<EventStatus | 'all'>('all');
  const rows = (query.data ?? []).filter((r) => filter === 'all' || r.effective_status === filter);

  return (
    <>
      <PageHeader
        title={t.events.title}
        actions={
          <Link className="btn btn-primary" to="/events/new">
            {t.events.new}
          </Link>
        }
      />
      <div className="chips" role="group">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t.events.all : t.status[f]}
          </button>
        ))}
      </div>
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.events.name}</th>
                <th>{t.events.when}</th>
                <th>{t.events.status}</th>
                <th className="num">{t.events.seats}</th>
                <th>{t.events.supervisors}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event: e, effective_status, joined_count, organizers }) => (
                <tr key={e.id} className="clickable" onClick={() => navigate(`/events/${e.id}`)}>
                  <td>
                    <Link to={`/events/${e.id}`}>{e.title}</Link>
                    <div className="small muted">{e.address_text}</div>
                  </td>
                  <td className="small">{range(e.starts_at, e.ends_at)}</td>
                  <td>
                    <StatusBadge status={effective_status} />
                  </td>
                  <td className="num">{fill(t.event.seats, { joined: joined_count, capacity: e.capacity })}</td>
                  <td className="small">{organizers.length ? organizers.map((o) => o.full_name).join('، ') : <span className="muted">{t.events.noSupervisor}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">{t.events.empty}</p>}
        </div>
      )}
    </>
  );
}
