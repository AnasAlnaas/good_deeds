import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { classOf, EVENT_CLASSES } from '../../../shared/classes';
import { api } from '../api';
import { fill, ltr, num, range, time } from '../format';
import { t } from '../strings';
import { Badge, Button, ErrorNote, Notice, PageHeader, QueryState, StatusBadge, useAction } from '../ui';

export function EventPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id) });
  const { run, busy, error } = useAction();

  if (!query.data) return <QueryState query={query} />;
  const d = query.data;
  const e = d.event;
  const status = d.effective_status;
  const editable = status !== 'finished' && status !== 'cancelled' && status !== 'rejected';
  const hasAttendance = d.participants.some((p) => p.attendance);
  const draft = e.status === 'draft';
  // Made in the app by a member or supervisor: it waits for an admin's decision.
  const proposal = d.creator && d.creator.role !== 'admin' ? d.creator : null;

  const changeStatus = (action: 'publish' | 'cancel' | 'reject') => {
    if (action === 'reject' && proposal) {
      // null = the admin pressed Cancel; an empty answer turns it down without a reason.
      const note = window.prompt(t.event.rejectPrompt, '');
      if (note !== null) run(() => api.setEventStatus(id, 'reject', { note: note.trim() || undefined }));
      return;
    }
    const question = {
      publish: proposal ? t.event.approveConfirm : t.event.publishConfirm,
      cancel: t.event.cancelConfirm,
      reject: t.event.discardConfirm,
    }[action];
    if (window.confirm(question)) run(() => api.setEventStatus(id, action));
  };

  return (
    <>
      <PageHeader
        title={e.title}
        actions={
          <>
            {editable && (
              <Link className="btn btn-secondary" to={`/events/${id}/edit`}>
                {t.event.edit}
              </Link>
            )}
            {draft && (
              <Button disabled={busy} onClick={() => changeStatus('publish')}>
                {proposal ? t.event.approve : t.event.publish}
              </Button>
            )}
            {draft && (
              <Button variant="danger" disabled={busy} onClick={() => changeStatus('reject')}>
                {proposal ? t.event.reject : t.event.discardDraft}
              </Button>
            )}
            {!draft && editable && !hasAttendance && (
              <Button variant="danger" disabled={busy} onClick={() => changeStatus('cancel')}>
                {t.event.cancelEvent}
              </Button>
            )}
          </>
        }
      />
      <div className="row">
        <StatusBadge status={status} />
        <Badge>{t.category[e.gender_category]}</Badge>
      </div>
      {proposal && draft && (
        <Notice tone="primary">{fill(t.event.proposal, { name: proposal.full_name, role: t.role[proposal.role], level: proposal.level })}</Notice>
      )}
      {proposal && status === 'rejected' && <Notice>{t.event.proposalRejected}</Notice>}
      <ErrorNote code={error} />

      <div className="grid-2">
        <section className="card">
          <h2>{t.event.details}</h2>
          <p>{e.description}</p>
          <dl className="facts">
            <dt>{t.event.when}</dt>
            <dd>{range(e.starts_at, e.ends_at)}</dd>
            <dt>{t.event.where}</dt>
            <dd>
              {e.address_text} ·{' '}
              <a href={`https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=17/${e.lat}/${e.lng}`} target="_blank" rel="noreferrer">
                {t.event.openMap}
              </a>
            </dd>
            <dt>{t.event.type}</dt>
            <dd>
              {EVENT_CLASSES.find((k) => k.id === classOf(e.subtype))?.name_ar} · {t.subtype[e.subtype] ?? e.subtype} ·{' '}
              {fill(t.event.points, { n: e.base_points })}
            </dd>
            <dt>{t.events.seats}</dt>
            <dd className="tabular">{fill(t.event.seats, { joined: d.joined_count, capacity: e.capacity })}</dd>
            <dt>{t.events.supervisors}</dt>
            <dd>{d.organizers.length ? d.organizers.map((o) => o.full_name).join('، ') : t.events.noSupervisor}</dd>
            <dt>{t.event.createdBy}</dt>
            <dd>{d.creator ? `${d.creator.full_name} · ${t.role[d.creator.role]}` : t.none}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>{t.event.branches}</h2>
          <ul className="stack" style={{ margin: 0, paddingInlineStart: 18 }}>
            {d.branches.map((b) => (
              <li key={b.id}>
                {b.name_ar}
              </li>
            ))}
          </ul>
          <h2>{t.event.terms}</h2>
          {e.terms_locked_at && <p className="small muted">{t.event.termsLocked}</p>}
          {d.terms.length ? (
            <ol className="terms">
              {d.terms.map((x) => (
                <li key={x.id}>{x.text}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t.event.noTerms}</p>
          )}
        </section>
      </div>

      <section className="stack">
        <h2>{t.event.participants}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.event.person}</th>
                <th>{t.event.phone}</th>
                <th>{t.event.registration}</th>
                <th>{t.event.attendance}</th>
                <th className="num">{t.event.hours}</th>
                <th>{t.event.confirmation}</th>
              </tr>
            </thead>
            <tbody>
              {d.participants.map(({ user, registration, attendance: a }) => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td className="ltr tabular">{user.phone}</td>
                  <td>
                    <Badge tone={registration.status === 'joined' ? 'success' : 'neutral'}>{t.registration[registration.status]}</Badge>
                  </td>
                  <td className="small">
                    {a ? (
                      <>
                        {fill(t.event.started, { time: time(a.started_at) })}
                        {a.ended_at && ` · ${fill(t.event.ended, { time: time(a.ended_at) })}`}
                        {a.end_source === 'auto_closed' && ` · ${t.event.autoClosed}`}
                      </>
                    ) : (
                      t.none
                    )}
                  </td>
                  <td className="num">{a?.hours != null ? num(a.hours) : t.none}</td>
                  <td>
                    {a?.ended_at ? (
                      <Badge tone={a.participant_status === 'confirmed' ? 'success' : a.participant_status === 'disputed' ? 'warning' : 'neutral'}>
                        {t.participant[a.participant_status]}
                      </Badge>
                    ) : (
                      t.none
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.participants.length === 0 && <p className="empty">{t.event.noParticipants}</p>}
        </div>
      </section>
      <p className="small muted">{ltr(e.id)}</p>
    </>
  );
}
