import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { DisputeRow, ResolveDisputeBody } from '../../../shared/admin-api';
import { api } from '../api';
import { fill, ltr, num, range, time } from '../format';
import { t } from '../strings';
import { Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

export function Disputes() {
  const query = useQuery({ queryKey: ['disputes'], queryFn: api.disputes });
  const [done, setDone] = useState(false);

  return (
    <>
      <PageHeader title={t.disputes.title} body={t.disputes.body} />
      {done && <Notice tone="success">{t.disputes.done}</Notice>}
      {!query.data ? (
        <QueryState query={query} />
      ) : query.data.length === 0 ? (
        <p className="empty card">{t.disputes.empty}</p>
      ) : (
        query.data.map((d) => <Dispute key={d.attendance.id} row={d} onDone={() => setDone(true)} />)
      )}
    </>
  );
}

function Dispute({ row, onDone }: { row: DisputeRow; onDone: () => void }) {
  const { attendance: a, user, event, recorded_by } = row;
  const { run, busy, error } = useAction();
  const [decision, setDecision] = useState<ResolveDisputeBody['decision']>('accept');
  const [hours, setHours] = useState(String(a.hours ?? 0));
  const [note, setNote] = useState('');
  const maxHours = (Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 3_600_000;

  const decide = async () => {
    const body: ResolveDisputeBody = { decision, note: note.trim(), ...(decision === 'correct' ? { hours: Number(hours) } : {}) };
    if (await run(() => api.resolveDispute(a.id, body))) onDone();
  };

  return (
    <section className="card">
      <div className="spread">
        <div>
          <h2>{user.full_name}</h2>
          <span className="small muted ltr">{ltr(user.phone)}</span>
        </div>
        <div className="small muted" style={{ textAlign: 'end' }}>
          <div>{event.title}</div>
          <div>{range(event.starts_at, event.ends_at)}</div>
        </div>
      </div>
      <p>
        {fill(t.disputes.recorded, { hours: num(a.hours ?? 0) })} ({time(a.started_at)}
        {a.ended_at ? ` – ${time(a.ended_at)}` : ''}){a.end_source === 'auto_closed' ? ` · ${t.event.autoClosed}` : ''}
        {recorded_by && <span className="muted"> · {fill(t.disputes.recordedBy, { name: recorded_by.full_name })}</span>}
      </p>
      <div className="stack" role="radiogroup">
        {(['accept', 'correct', 'reject'] as const).map((x) => (
          <label key={x} className="check">
            <input type="radio" name={`decision-${a.id}`} checked={decision === x} onChange={() => setDecision(x)} />
            <span>{t.disputes[x]}</span>
          </label>
        ))}
      </div>
      {decision === 'correct' && (
        <Field label={t.disputes.hours} hint={fill(t.disputes.hoursMax, { max: num(maxHours) })}>
          <input type="number" min={0} max={maxHours} step={0.25} dir="ltr" value={hours} onChange={(e) => setHours(e.target.value)} style={{ maxWidth: 160 }} />
        </Field>
      )}
      <Field label={t.disputes.note}>
        <textarea value={note} maxLength={500} placeholder={t.disputes.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorNote code={error} />
      <div>
        <Button disabled={busy || !note.trim()} onClick={decide}>
          {t.disputes.decide}
        </Button>
      </div>
    </section>
  );
}
