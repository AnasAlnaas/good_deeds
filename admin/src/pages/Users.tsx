import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { AdminUserRow } from '../../../shared/admin-api';
import type { Role } from '../../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { fill, num } from '../format';
import { t } from '../strings';
import { ErrorNote, PageHeader, QueryState, useAction } from '../ui';

export function Users() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  // Ask the server once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({ queryKey: ['users', q], queryFn: () => api.users(q), placeholderData: (prev) => prev });
  const { run, busy, error } = useAction();

  const changeRole = (u: AdminUserRow, role: Role) => {
    if (window.confirm(fill(t.users.roleConfirm, { name: u.full_name, from: t.role[u.role], to: t.role[role] }))) {
      run(() => api.changeRole(u.id, { role }));
    }
  };

  return (
    <>
      <PageHeader title={t.users.title} />
      <input type="search" placeholder={t.users.search} value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 420 }} />
      <ErrorNote code={error} />
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.users.name}</th>
                <th>{t.users.phone}</th>
                <th>{t.users.city}</th>
                <th>{t.users.role}</th>
                <th className="num">{t.users.level}</th>
                <th className="num">{t.users.points}</th>
                <th className="num">{t.users.hours}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((u) => {
                const self = u.id === session?.user.id;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.full_name}
                      {self && <span className="small muted"> ({t.users.you})</span>}
                    </td>
                    <td className="ltr tabular">{u.phone}</td>
                    <td>{u.city}</td>
                    <td>
                      <select
                        aria-label={`${t.users.role}: ${u.full_name}`}
                        value={u.role}
                        disabled={self || busy}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        style={{ minWidth: 110 }}>
                        {(['member', 'supervisor', 'admin'] as const).map((r) => (
                          <option key={r} value={r}>
                            {t.role[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">{u.level}</td>
                    <td className="num">{num(u.total_points)}</td>
                    <td className="num">{num(u.confirmed_hours)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {query.data.length === 0 && <p className="empty">{t.users.empty}</p>}
          {query.data.length === 500 && <p className="small muted" style={{ padding: 12 }}>{t.users.limit}</p>}
        </div>
      )}
    </>
  );
}
