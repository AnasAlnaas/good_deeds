import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { AdminInstitutionRow } from '../../../shared/admin-api';
import { INSTITUTION_REVIEWED_EVENTS } from '../../../shared/rules';
import type { InstitutionStatus } from '../../../shared/types';
import { api } from '../api';
import { dateTime, fill, ltr } from '../format';
import { t } from '../strings';
import { Badge, Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

const FILTERS: (InstitutionStatus | 'all')[] = ['pending', 'approved', 'rejected', 'all'];
const TONE = { pending: 'warning', approved: 'success', rejected: 'neutral' } as const;

// Institutions (owner's decisions, 2026-11-17): members ask for them in the app,
// admins approve or turn them down here, and add or remove their representatives.
// ?status=pending opens on those waiting (the overview links here).
export function Institutions() {
  const [params, setParams] = useSearchParams();
  const filter: InstitutionStatus | 'all' = FILTERS.find((f) => f === params.get('status')) ?? 'all';
  const setFilter = (f: InstitutionStatus | 'all') => setParams(f === 'all' ? {} : { status: f }, { replace: true });
  const query = useQuery({ queryKey: ['institutions', filter], queryFn: () => api.institutions(filter === 'all' ? undefined : filter) });
  const [done, setDone] = useState(false);

  return (
    <>
      <PageHeader title={t.institutions.title} body={fill(t.institutions.body, { n: INSTITUTION_REVIEWED_EVENTS })} />
      <div className="chips" role="group">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t.institutions.all : t.institutions.status[f]}
          </button>
        ))}
      </div>
      {done && <Notice tone="success">{t.institutions.done}</Notice>}
      {!query.data ? (
        <QueryState query={query} />
      ) : query.data.length === 0 ? (
        <div className="empty card">
          <p>{t.institutions.empty}</p>
          {filter !== 'all' && (
            <Button variant="secondary" onClick={() => setFilter('all')}>
              {t.institutions.showAll}
            </Button>
          )}
        </div>
      ) : (
        query.data.map((row) => <InstitutionCard key={row.institution.id} row={row} onDone={() => setDone(true)} />)
      )}
    </>
  );
}

function InstitutionCard({ row, onDone }: { row: AdminInstitutionRow; onDone: () => void }) {
  const { institution: i, requested_by, representatives } = row;
  const { run, busy, error } = useAction();
  const [phone, setPhone] = useState('');

  const approve = async () => {
    if (window.confirm(t.institutions.approveConfirm) && (await run(() => api.decideInstitution(i.id, 'approve')))) onDone();
  };
  const reject = async () => {
    // null = the admin pressed Cancel; an empty answer turns it down without a reason.
    const note = window.prompt(t.institutions.rejectPrompt, '');
    if (note !== null && (await run(() => api.decideInstitution(i.id, 'reject', note.trim() || undefined)))) onDone();
  };
  const add = async () => {
    if (await run(() => api.addRepresentative(i.id, phone.trim()))) {
      setPhone('');
      onDone();
    }
  };
  const remove = async (userId: string, name: string) => {
    if (window.confirm(fill(t.institutions.removeConfirm, { name })) && (await run(() => api.removeRepresentative(i.id, userId)))) onDone();
  };
  const direct = row.approved_events >= INSTITUTION_REVIEWED_EVENTS;

  return (
    <section className="card">
      <div className="spread">
        <div>
          <h2>{i.name}</h2>
          <span className="small muted">
            {t.institutions.kinds[i.kind]} · {dateTime(i.created_at)}
            {requested_by && (
              <>
                {' · '}
                {fill(t.institutions.requestedBy, { name: requested_by.full_name })} <span className="ltr">{ltr(requested_by.phone)}</span>
              </>
            )}
          </span>
        </div>
        <Badge tone={TONE[i.status]}>{t.institutions.status[i.status]}</Badge>
      </div>
      {i.status === 'rejected' && i.decision_note && <p className="small muted">{fill(t.institutions.reason, { note: i.decision_note })}</p>}

      {i.status === 'approved' && (
        <>
          <p className="small">
            {fill(t.institutions.members, { n: row.members })} · {fill(t.institutions.pendingMembers, { n: row.pending_members })} ·{' '}
            {direct
              ? fill(t.institutions.direct, { n: row.approved_events })
              : fill(t.institutions.approvedEvents, { n: row.approved_events, max: INSTITUTION_REVIEWED_EVENTS })}
          </p>
          <h3>{t.institutions.representatives}</h3>
          {representatives.length === 0 && <p className="small muted">{t.institutions.noRepresentative}</p>}
          <ul className="stack">
            {representatives.map((r) => (
              <li key={r.id} className="row">
                <span>{r.full_name}</span>
                <span className="small muted ltr">{ltr(r.phone)}</span>
                <Button variant="quiet" className="btn-small" disabled={busy} onClick={() => remove(r.id, r.full_name)}>
                  {t.institutions.removeRepresentative}
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="row"
            style={{ alignItems: 'end' }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}>
            <Field label={t.institutions.phone}>
              <input type="tel" dir="ltr" value={phone} placeholder="091 234 5678" onChange={(e) => setPhone(e.target.value)} style={{ maxWidth: 200 }} />
            </Field>
            <Button type="submit" variant="secondary" disabled={busy || !phone.trim()}>
              {t.institutions.addRepresentative}
            </Button>
          </form>
        </>
      )}

      <ErrorNote code={error} />
      {i.status === 'pending' && (
        <div className="actions">
          <Button disabled={busy} onClick={approve}>
            {t.institutions.approve}
          </Button>
          <Button variant="danger" disabled={busy} onClick={reject}>
            {t.institutions.reject}
          </Button>
        </div>
      )}
    </section>
  );
}
