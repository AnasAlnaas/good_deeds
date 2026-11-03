import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import type { AdminEventDetail, AdminMeta, EventInput } from '../../../shared/admin-api';
import type { GenderCategory } from '../../../shared/types';
import { api } from '../api';
import { fill, fromLocalInput, toLocalInput } from '../format';
import { t } from '../strings';
import { Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

const TRIPOLI = { lat: 32.8872, lng: 13.1913 };

/** Create (/events/new) or edit (/events/:id/edit). The server re-checks every rule. */
export function EventForm() {
  const { id } = useParams();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });
  const existing = useQuery({ queryKey: ['event', id], queryFn: () => api.event(id!), enabled: !!id });

  if (!meta.data) return <QueryState query={meta} />;
  if (id && !existing.data) return <QueryState query={existing} />;
  // Keyed so the form starts fresh when switching between events.
  return <Form key={id ?? 'new'} meta={meta.data} existing={existing.data} />;
}

function initial(existing: AdminEventDetail | undefined): EventInput {
  if (!existing) {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(9, 0, 0, 0);
    return {
      title: '',
      description: '',
      subtype: 'street_cleanup',
      address_text: '',
      lat: TRIPOLI.lat,
      lng: TRIPOLI.lng,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      capacity: 20,
      gender_category: 'mixed',
      organizer_ids: [],
      terms: [],
    };
  }
  const e = existing.event;
  return {
    title: e.title,
    description: e.description,
    subtype: e.subtype,
    address_text: e.address_text,
    lat: e.lat,
    lng: e.lng,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    capacity: e.capacity,
    gender_category: e.gender_category,
    organizer_ids: existing.organizers.map((o) => o.id),
    terms: existing.terms.map((x) => x.text ?? ''),
  };
}

function Form({ meta, existing }: { meta: AdminMeta; existing?: AdminEventDetail }) {
  const navigate = useNavigate();
  const { run, busy, error } = useAction();
  const [v, setV] = useState<EventInput>(() => initial(existing));
  const [peopleFilter, setPeopleFilter] = useState('');
  const [invalid, setInvalid] = useState(false);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setV((prev) => ({ ...prev, [key]: value }));

  // What the server would refuse to change, shown as locked instead.
  const termsLocked = !!existing?.event.terms_locked_at;
  const categoryLocked = (existing?.joined_count ?? 0) > 0;
  const timesLocked = !!existing?.participants.some((p) => p.attendance);
  const points = meta.subtypes.find((x) => x.id === v.subtype)?.base_points ?? 0;

  const valid =
    v.title.trim().length >= 3 &&
    v.description.trim().length > 0 &&
    v.address_text.trim().length > 0 &&
    !!v.starts_at &&
    !!v.ends_at &&
    Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
    v.capacity >= 1 &&
    v.terms.every((x) => x.trim().length > 0);

  const submit = async (publish: boolean) => {
    if (!valid) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const body = { ...v, terms: v.terms.map((x) => x.trim()) };
    if (existing) {
      if (await run(() => api.updateEvent(existing.event.id, body))) navigate(`/events/${existing.event.id}`);
    } else {
      const r = await run(() => api.createEvent({ ...body, publish }));
      if (r) navigate(`/events/${r.value.id}`);
    }
  };

  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const moveTerm = (i: number, by: number) => {
    const next = [...v.terms];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set('terms', next);
  };
  const filterText = peopleFilter.trim();
  const people = meta.people.filter((p) => !filterText || p.full_name.includes(filterText) || p.phone.includes(filterText));
  const chosen = meta.people.filter((p) => v.organizer_ids.includes(p.id));

  return (
    <form
      className="stack"
      style={{ gap: 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}>
      <PageHeader title={existing ? t.form.editTitle : t.form.newTitle} />
      {existing && existing.event.status !== 'draft' && <Notice tone="primary">{t.form.notifies}</Notice>}

      <section className="card">
        <h2>{t.form.basics}</h2>
        <Field label={t.form.title}>
          <input value={v.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t.form.description}>
          <textarea value={v.description} maxLength={4000} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t.form.type} hint={timesLocked ? t.form.lockedTimes : fill(t.form.typePoints, { n: points })}>
          <select value={v.subtype} disabled={timesLocked} onChange={(e) => set('subtype', e.target.value)}>
            {meta.subtypes.map((x) => (
              <option key={x.id} value={x.id}>
                {t.subtype[x.id] ?? x.id}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card">
        <h2>{t.form.place}</h2>
        <Field label={t.form.address}>
          <input value={v.address_text} maxLength={200} onChange={(e) => set('address_text', e.target.value)} />
        </Field>
        <div className="fields-2">
          <Field label={t.form.lat}>
            <input type="number" step="any" dir="ltr" value={v.lat} onChange={(e) => set('lat', Number(e.target.value))} />
          </Field>
          <Field label={t.form.lng}>
            <input type="number" step="any" dir="ltr" value={v.lng} onChange={(e) => set('lng', Number(e.target.value))} />
          </Field>
        </div>
        <p className="small muted">
          {t.form.placeHint}{' '}
          <a href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=17/${v.lat}/${v.lng}`} target="_blank" rel="noreferrer">
            {t.event.openMap}
          </a>
        </p>
      </section>

      <section className="card">
        <h2>{t.form.time}</h2>
        {timesLocked && <Notice tone="warning">{t.form.lockedTimes}</Notice>}
        <div className="fields-2">
          <Field label={t.form.starts}>
            <input type="datetime-local" disabled={timesLocked} value={toLocalInput(v.starts_at)} onChange={(e) => set('starts_at', fromLocalInput(e.target.value))} />
          </Field>
          <Field label={t.form.ends}>
            <input type="datetime-local" disabled={timesLocked} value={toLocalInput(v.ends_at)} onChange={(e) => set('ends_at', fromLocalInput(e.target.value))} />
          </Field>
          <Field label={t.form.capacity}>
            <input type="number" min={Math.max(1, existing?.joined_count ?? 0)} value={v.capacity} onChange={(e) => set('capacity', Math.round(Number(e.target.value)))} />
          </Field>
          <Field label={t.form.category} hint={categoryLocked ? t.form.lockedCategory : undefined}>
            <select value={v.gender_category} disabled={categoryLocked} onChange={(e) => set('gender_category', e.target.value as GenderCategory)}>
              {(['mixed', 'male', 'female'] as const).map((c) => (
                <option key={c} value={c}>
                  {t.category[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>{t.form.supervisors}</h2>
        <p className="small muted">{t.form.supervisorsHint}</p>
        {chosen.length > 0 && (
          <div className="chips">
            {chosen.map((p) => (
              <span key={p.id} className="chip-remove">
                {p.full_name}
                <button type="button" aria-label={`${t.form.remove} ${p.full_name}`} onClick={() => set('organizer_ids', toggle(v.organizer_ids, p.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input placeholder={t.form.searchPeople} value={peopleFilter} onChange={(e) => setPeopleFilter(e.target.value)} />
        <div className="pick-list">
          {people.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={v.organizer_ids.includes(p.id)} onChange={() => set('organizer_ids', toggle(v.organizer_ids, p.id))} />
              <span>{p.full_name}</span>
              <span className="small muted">{t.role[p.role]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t.form.terms}</h2>
        <p className="small muted">{t.form.termsHint}</p>
        {termsLocked && <Notice tone="warning">{t.form.lockedTerms}</Notice>}
        {v.terms.map((term, i) => (
          <div key={i} className="term-row">
            <Field label={fill(t.form.term, { n: i + 1 })}>
              <textarea
                value={term}
                maxLength={1000}
                disabled={termsLocked}
                onChange={(e) => set('terms', v.terms.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </Field>
            {!termsLocked && (
              <div className="term-tools">
                <Button variant="quiet" className="btn-small" disabled={i === 0} onClick={() => moveTerm(i, -1)}>
                  {t.form.moveUp}
                </Button>
                <Button variant="quiet" className="btn-small" disabled={i === v.terms.length - 1} onClick={() => moveTerm(i, 1)}>
                  {t.form.moveDown}
                </Button>
                <Button variant="quiet" className="btn-small" onClick={() => set('terms', v.terms.filter((_, j) => j !== i))}>
                  {t.form.remove}
                </Button>
              </div>
            )}
          </div>
        ))}
        {!termsLocked && (
          <div>
            <Button variant="secondary" onClick={() => set('terms', [...v.terms, ''])}>
              {t.form.addTerm}
            </Button>
          </div>
        )}
      </section>

      {invalid && <Notice tone="danger">{t.form.invalid}</Notice>}
      <ErrorNote code={error} />
      <div className="actions">
        {existing ? (
          <Button type="submit" disabled={busy}>
            {t.form.saveChanges}
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={() => submit(true)}>
              {t.form.publish}
            </Button>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.form.saveDraft}
            </Button>
          </>
        )}
        <Button variant="quiet" onClick={() => navigate(-1)}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
