import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import type { AdminWarningRow, DecideWarningBody } from '../../../shared/admin-api';
import type { WarningStatus } from '../../../shared/types';
import { api } from '../api';
import { dateTime, fill, ltr } from '../format';
import { t } from '../strings';
import { Badge, Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

const FILTERS: (WarningStatus | 'all')[] = ['all', 'appealed', 'active', 'upheld', 'withdrawn'];

const TONE = { active: 'danger', appealed: 'warning', upheld: 'danger', withdrawn: 'neutral' } as const;

// Supervisors' warnings (إنذار). ?user=<id> shows one member's (the members list
// links here); ?status=appealed opens on the appeals waiting (the overview links here).
// An admin keeps an appealed warning or withdraws one; the member reads the note in the app.
export function Warnings() {
  const [params] = useSearchParams();
  const userId = params.get('user') ?? undefined;
  const [filter, setFilter] = useState<WarningStatus | 'all'>(() => FILTERS.find((f) => f === params.get('status')) ?? 'all');
  const query = useQuery({
    queryKey: ['warnings', userId, filter],
    queryFn: () => api.warnings({ user_id: userId, status: filter === 'all' ? undefined : filter }),
  });
  const [done, setDone] = useState<string | null>(null);
  const member = query.data?.[0]?.user;

  return (
    <>
      <PageHeader
        title={userId && member ? fill(t.warnings.of, { name: member.full_name }) : t.warnings.title}
        body={t.warnings.body}
        actions={
          userId && (
            <Link className="btn btn-secondary" to="/warnings">
              {t.warnings.showAll}
            </Link>
          )
        }
      />
      <div className="chips" role="group">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t.warnings.all : t.warnings.status[f]}
          </button>
        ))}
      </div>
      {done && <Notice tone="success">{done}</Notice>}
      {!query.data ? (
        <QueryState query={query} />
      ) : query.data.length === 0 ? (
        <p className="empty card">{userId && filter === 'all' ? t.warnings.noneFor : t.warnings.empty}</p>
      ) : (
        query.data.map((row) => <WarningCard key={row.warning.id} row={row} onDone={setDone} />)
      )}
    </>
  );
}

function WarningCard({ row, onDone }: { row: AdminWarningRow; onDone: (message: string) => void }) {
  const { warning: w, user, event, issued_by, decided_by } = row;
  const { run, busy, error } = useAction();
  const [note, setNote] = useState('');
  // An appeal waits for a decision; any other warning that stands may still be withdrawn.
  const [deciding, setDeciding] = useState(w.status === 'appealed');

  const decide = async (decision: DecideWarningBody['decision']) => {
    if (await run(() => api.decideWarning(w.id, { decision, note: note.trim() }))) {
      onDone(decision === 'uphold' ? t.warnings.upheld : t.warnings.withdrawn);
    }
  };

  return (
    <section className="card">
      <div className="spread">
        <div>
          <h2>
            <Link to={`/warnings?user=${user.id}`}>{user.full_name}</Link>
          </h2>
          <span className="small muted ltr">{ltr(user.phone)}</span>
        </div>
        <div className="small muted" style={{ textAlign: 'end' }}>
          <Badge tone={TONE[w.status]}>{t.warnings.status[w.status]}</Badge>
          <div>
            <Link to={`/events/${event.id}`}>{event.title}</Link>
          </div>
          <div>
            {issued_by && `${fill(t.warnings.by, { name: issued_by.full_name })} · `}
            {dateTime(w.created_at)}
          </div>
        </div>
      </div>
      <p>
        <strong>{t.warnings.reason}:</strong> {w.reason}
      </p>
      {w.appeal_reason && (
        <p>
          <strong>{t.warnings.appeal}:</strong> {w.appeal_reason}
        </p>
      )}
      {w.decision_note && (
        <p className="small muted">
          {fill(t.warnings.decidedBy, { name: decided_by?.full_name ?? t.none, when: w.decided_at ? dateTime(w.decided_at) : '' })} · «{w.decision_note}»
        </p>
      )}
      {w.status !== 'withdrawn' &&
        (deciding ? (
          <>
            <Field label={t.warnings.note}>
              <textarea value={note} maxLength={500} placeholder={t.warnings.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <ErrorNote code={error} />
            <div className="actions">
              {w.status === 'appealed' && (
                <Button disabled={busy || !note.trim()} onClick={() => decide('uphold')}>
                  {t.warnings.uphold}
                </Button>
              )}
              <Button variant="danger" disabled={busy || !note.trim()} onClick={() => decide('withdraw')}>
                {t.warnings.withdraw}
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button variant="secondary" className="btn-small" onClick={() => setDeciding(true)}>
              {t.warnings.withdrawOpen}
            </Button>
          </div>
        ))}
    </section>
  );
}
