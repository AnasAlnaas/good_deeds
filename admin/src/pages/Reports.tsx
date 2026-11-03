import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import type { AdminReportRow } from '../../../shared/admin-api';
import type { ReportStatus } from '../../../shared/types';
import { api } from '../api';
import { dateTime, fill, ltr } from '../format';
import { t } from '../strings';
import { Badge, Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

const FILTERS: (ReportStatus | 'all')[] = ['open', 'handled', 'all'];

// Members' reports (بلاغ). An admin closes each one with a note saying what was
// done; the note goes to the audit log, and the reporter is told only that it was looked at.
export function Reports() {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const query = useQuery({ queryKey: ['reports', filter], queryFn: () => api.reports(filter === 'all' ? undefined : filter) });
  const [done, setDone] = useState(false);

  return (
    <>
      <PageHeader title={t.reports.title} body={t.reports.body} />
      <div className="chips" role="group">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t.reports.all : t.reports.status[f]}
          </button>
        ))}
      </div>
      {done && <Notice tone="success">{t.reports.done}</Notice>}
      {!query.data ? (
        <QueryState query={query} />
      ) : query.data.length === 0 ? (
        <p className="empty card">{t.reports.empty}</p>
      ) : (
        query.data.map((row) => <ReportCard key={row.report.id} row={row} onDone={() => setDone(true)} />)
      )}
    </>
  );
}

function ReportCard({ row, onDone }: { row: AdminReportRow; onDone: () => void }) {
  const { report: r, reporter, event, subject, handled_by } = row;
  const { run, busy, error } = useAction();
  const [note, setNote] = useState('');
  const open = r.status === 'open';

  const close = async () => {
    if (await run(() => api.handleReport(r.id, { note: note.trim() }))) onDone();
  };

  return (
    <section className="card">
      <div className="spread">
        <div>
          <h2>{t.reportCategory[r.category]}</h2>
          <span className="small muted">
            {reporter && (
              <>
                {fill(t.reports.from, { name: reporter.full_name })} <span className="ltr">{ltr(reporter.phone)}</span> ·{' '}
              </>
            )}
            {dateTime(r.created_at)}
          </span>
        </div>
        <Badge tone={open ? 'warning' : 'success'}>{t.reports.status[r.status]}</Badge>
      </div>
      {(event || subject) && (
        <p className="small">
          {event && <Link to={`/events/${event.id}`}>{event.title}</Link>}
          {event && subject && ' · '}
          {subject && (
            <>
              {fill(t.reports.about, { name: subject.full_name })} <span className="ltr muted">{ltr(subject.phone)}</span> ·{' '}
              <Link to={`/warnings?user=${subject.id}`}>{t.reports.subjectWarnings}</Link>
            </>
          )}
        </p>
      )}
      <p>{r.note ?? <span className="muted">{t.reports.noNote}</span>}</p>
      {open ? (
        <>
          <Field label={t.reports.note}>
            <textarea value={note} maxLength={500} placeholder={t.reports.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote code={error} />
          <div>
            <Button disabled={busy || !note.trim()} onClick={close}>
              {t.reports.close}
            </Button>
          </div>
        </>
      ) : (
        <p className="small muted">
          {fill(t.reports.closedBy, { name: handled_by?.full_name ?? t.none, when: r.handled_at ? dateTime(r.handled_at) : '' })}
          {r.handled_note && ` · «${r.handled_note}»`}
        </p>
      )}
    </section>
  );
}
