import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import type { AuditEntry } from '../../../shared/admin-api';
import type { Role } from '../../../shared/types';
import { api } from '../api';
import { dateTime, num } from '../format';
import { t } from '../strings';
import { PageHeader, QueryState } from '../ui';

export function Audit() {
  const query = useQuery({ queryKey: ['audit'], queryFn: api.audit });

  return (
    <>
      <PageHeader title={t.audit.title} body={t.audit.body} />
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.audit.when}</th>
                <th>{t.audit.who}</th>
                <th>{t.audit.what}</th>
                <th>{t.audit.details}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((e) => (
                <tr key={e.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {dateTime(e.created_at)}
                  </td>
                  <td>{e.actor?.full_name ?? <span className="muted">{t.audit.system}</span>}</td>
                  <td>{t.audit.actions[e.action]}</td>
                  <td className="small">
                    <Details entry={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.data.length === 0 && <p className="empty">{t.audit.empty}</p>}
        </div>
      )}
    </>
  );
}

/** One readable line per action, from what the server recorded. */
function Details({ entry: e }: { entry: AuditEntry }) {
  const d = e.details as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  switch (e.action) {
    case 'change_role':
      return (
        <>
          {str('name')}: {t.role[d.from as Role]} ← {t.role[d.to as Role]}
        </>
      );
    case 'create_event':
    case 'publish_event':
    case 'cancel_event':
      return <Link to={`/events/${e.target_id}`}>{str('title')}</Link>;
    case 'update_event': {
      const changed = Array.isArray(d.changed) ? (d.changed as string[]) : [];
      const labels = [...new Set(changed.map((k) => t.audit.fields[k] ?? k))];
      return (
        <>
          <Link to={`/events/${e.target_id}`}>{str('title')}</Link> · {labels.length ? labels.join('، ') : t.audit.nothingChanged}
        </>
      );
    }
    case 'resolve_dispute':
      return (
        <>
          {str('event_title')} · {t.audit.decisions[str('decision')] ?? str('decision')}: {num(Number(d.hours_before ?? 0))} ← {num(Number(d.hours_after ?? 0))}{' '}
          {t.event.hours} · «{str('note')}»
        </>
      );
  }
}
