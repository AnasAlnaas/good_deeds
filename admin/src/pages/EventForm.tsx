import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import type { AdminEventDetail, AdminMeta, EventInput } from '../../../shared/admin-api';
import { ADDRESS_MAX, cleanPlace, MEETING_URL_MAX } from '../../../shared/rules';
import { type GenderCategory, type LocationType, MEETING_PLATFORMS, type MeetingPlatform } from '../../../shared/types';
import { api } from '../api';
import { fill, fromLocalInput, toLocalInput } from '../format';
import type { LessonImageRef } from '../../../shared/api';
import { LESSON_BODY_MAX, LESSON_TITLE_MAX, lessonComplete, MAX_LESSONS } from '../../../shared/rules';
import { LessonPicture, lessonJpeg } from '../LessonPicture';
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
      location_type: 'in_person',
      address_text: null,
      lat: null,
      lng: null,
      meeting_platform: null,
      meeting_url: null,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      capacity: 20,
      gender_category: 'mixed',
      organizer_ids: [],
      terms: [],
      lessons: [],
    };
  }
  const e = existing.event;
  return {
    title: e.title,
    description: e.description,
    subtype: e.subtype,
    location_type: e.location_type,
    address_text: e.address_text,
    lat: e.lat,
    lng: e.lng,
    meeting_platform: e.meeting_platform,
    meeting_url: e.meeting_url,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    capacity: e.capacity,
    gender_category: e.gender_category,
    organizer_ids: existing.organizers.map((o) => o.id),
    terms: existing.terms.map((x) => x.text ?? ''),
    lessons: existing.lessons.map(({ title, body, image_id }) => ({ title, body, image_id })),
  };
}

/** The form keeps both kinds of place while one is chosen; rules.cleanPlace sends only the chosen one's. */
interface PlaceDraft {
  location_type: LocationType;
  address_text: string;
  lat: number;
  lng: number;
  meeting_platform: MeetingPlatform;
  meeting_url: string;
}

function placeDraft(v: EventInput): PlaceDraft {
  return {
    location_type: v.location_type,
    address_text: v.address_text ?? '',
    lat: v.lat ?? TRIPOLI.lat,
    lng: v.lng ?? TRIPOLI.lng,
    meeting_platform: v.meeting_platform ?? 'zoom',
    meeting_url: v.meeting_url ?? '',
  };
}

function Form({ meta, existing }: { meta: AdminMeta; existing?: AdminEventDetail }) {
  const navigate = useNavigate();
  const { run, busy, error } = useAction();
  const [v, setV] = useState<EventInput>(() => initial(existing));
  const [place, setPlace] = useState<PlaceDraft>(() => placeDraft(initial(existing)));
  const setPlaceField = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => setPlace((prev) => ({ ...prev, [key]: value }));
  const cleaned = cleanPlace(place);
  const [peopleFilter, setPeopleFilter] = useState('');
  const [invalid, setInvalid] = useState(false);
  // The lessons' pictures, to show them; the form itself names each by its id.
  const [pictures, setPictures] = useState<Record<string, LessonImageRef>>(() =>
    Object.fromEntries((existing?.lessons ?? []).flatMap((l) => (l.image ? [[l.image.id, l.image]] : []))),
  );
  const [sending, setSending] = useState<number | null>(null);
  const [pictureProblem, setPictureProblem] = useState<{ i: number; text: string } | null>(null);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setV((prev) => ({ ...prev, [key]: value }));

  // What the server would refuse to change, shown as locked instead.
  const termsLocked = !!existing?.event.terms_locked_at;
  const lessonsLocked = !!existing?.lessons.some((l) => l.learned_count > 0);
  const categoryLocked = (existing?.joined_count ?? 0) > 0;
  const timesLocked = !!existing?.participants.some((p) => p.attendance);
  const points = meta.subtypes.find((x) => x.id === v.subtype)?.base_points ?? 0;

  const valid =
    v.title.trim().length >= 3 &&
    v.description.trim().length > 0 &&
    cleaned !== null &&
    !!v.starts_at &&
    !!v.ends_at &&
    Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
    v.capacity >= 1 &&
    v.terms.every((x) => x.trim().length > 0) &&
    v.lessons.every(lessonComplete);
  const lessonsIncomplete = !v.lessons.every(lessonComplete);

  const submit = async (publish: boolean) => {
    if (!valid || !cleaned) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const body = {
      ...v,
      ...cleaned,
      terms: v.terms.map((x) => x.trim()),
      lessons: v.lessons.map((l) => ({ title: l.title.trim(), body: l.body.trim(), image_id: l.image_id })),
    };
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
  const moveLesson = (i: number, by: number) => {
    const next = [...v.lessons];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set('lessons', next);
  };
  const putLesson = (i: number, patch: Partial<EventInput['lessons'][number]>) =>
    setV((prev) => ({ ...prev, lessons: prev.lessons.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  // The picture is made small enough here and sent first; saving the event keeps it.
  const choosePicture = async (i: number, file: File | undefined) => {
    setPictureProblem(null);
    if (!file) return;
    const jpeg = await lessonJpeg(file);
    if (jpeg === 'unreadable' || jpeg === 'too_big') {
      setPictureProblem({ i, text: jpeg === 'unreadable' ? t.form.pictureUnreadable : t.form.pictureTooBig });
      return;
    }
    setSending(i);
    const r = await run(() => api.uploadLessonImage(jpeg));
    setSending(null);
    if (!r) return;
    const { image } = r.value;
    setPictures((prev) => ({ ...prev, [image.id]: image }));
    putLesson(i, { image_id: image.id });
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
        <div className="row" role="radiogroup" aria-label={t.form.locationType}>
          {(['in_person', 'online'] as const).map((kind) => (
            <label key={kind} className="check">
              <input type="radio" name="location_type" checked={place.location_type === kind} onChange={() => setPlaceField('location_type', kind)} />
              <span>{t.form.locationTypes[kind]}</span>
            </label>
          ))}
        </div>
        {place.location_type === 'in_person' ? (
          <>
            <Field label={t.form.address}>
              <input value={place.address_text} maxLength={ADDRESS_MAX} onChange={(e) => setPlaceField('address_text', e.target.value)} />
            </Field>
            <div className="fields-2">
              <Field label={t.form.lat}>
                <input type="number" step="any" dir="ltr" value={place.lat} onChange={(e) => setPlaceField('lat', Number(e.target.value))} />
              </Field>
              <Field label={t.form.lng}>
                <input type="number" step="any" dir="ltr" value={place.lng} onChange={(e) => setPlaceField('lng', Number(e.target.value))} />
              </Field>
            </div>
            <p className="small muted">
              {t.form.placeHint}{' '}
              <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}`} target="_blank" rel="noreferrer">
                {t.event.openMap}
              </a>
            </p>
          </>
        ) : (
          <>
            <Field label={t.form.platform}>
              <select value={place.meeting_platform} onChange={(e) => setPlaceField('meeting_platform', e.target.value as MeetingPlatform)}>
                {MEETING_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {t.platforms[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.form.meetingUrl} hint={t.form.meetingUrlHint}>
              <input
                type="url"
                dir="ltr"
                inputMode="url"
                placeholder="https://zoom.us/j/…"
                value={place.meeting_url}
                maxLength={MEETING_URL_MAX}
                onChange={(e) => setPlaceField('meeting_url', e.target.value.trim())}
              />
            </Field>
          </>
        )}
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
        <h2>{t.form.lessons}</h2>
        <p className="small muted">{t.form.lessonsHint}</p>
        {lessonsLocked && <Notice tone="warning">{t.form.lockedLessons}</Notice>}
        {v.lessons.map((lesson, i) => (
          <div key={i} className="term-row">
            <div className="stack" style={{ gap: 8 }}>
              <strong>{fill(t.form.lesson, { n: i + 1 })}</strong>
              <Field label={t.form.lessonTitle}>
                <input value={lesson.title} maxLength={LESSON_TITLE_MAX} disabled={lessonsLocked} onChange={(e) => putLesson(i, { title: e.target.value })} />
              </Field>
              {lesson.image_id && pictures[lesson.image_id] && (
                <LessonPicture image={pictures[lesson.image_id]} alt={fill(t.event.lessonPicture, { title: lesson.title })} />
              )}
              {!lessonsLocked && (
                <div className="row">
                  <label className={`btn btn-secondary btn-small ${busy ? 'btn-disabled' : ''}`}>
                    {lesson.image_id ? t.form.changePicture : t.form.addPicture}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={busy}
                      onChange={(e) => {
                        void choosePicture(i, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {lesson.image_id && (
                    <Button variant="quiet" className="btn-small" onClick={() => putLesson(i, { image_id: null })}>
                      {t.form.removePicture}
                    </Button>
                  )}
                  {sending === i && <span className="small muted">{t.form.sendingPicture}</span>}
                </div>
              )}
              {pictureProblem?.i === i && <Notice tone="danger">{pictureProblem.text}</Notice>}
              <Field label={lesson.image_id ? t.form.lessonBodyOptional : t.form.lessonBody}>
                <textarea rows={4} value={lesson.body} maxLength={LESSON_BODY_MAX} disabled={lessonsLocked} onChange={(e) => putLesson(i, { body: e.target.value })} />
              </Field>
            </div>
            {!lessonsLocked && (
              <div className="term-tools">
                <Button variant="quiet" className="btn-small" disabled={i === 0} onClick={() => moveLesson(i, -1)}>
                  {t.form.moveUp}
                </Button>
                <Button variant="quiet" className="btn-small" disabled={i === v.lessons.length - 1} onClick={() => moveLesson(i, 1)}>
                  {t.form.moveDown}
                </Button>
                <Button variant="quiet" className="btn-small" onClick={() => set('lessons', v.lessons.filter((_, j) => j !== i))}>
                  {t.form.remove}
                </Button>
              </div>
            )}
          </div>
        ))}
        {!lessonsLocked && v.lessons.length < MAX_LESSONS && (
          <div>
            <Button variant="secondary" onClick={() => set('lessons', [...v.lessons, { title: '', body: '', image_id: null }])}>
              {t.form.addLesson}
            </Button>
          </div>
        )}
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

      {invalid && <Notice tone="danger">{lessonsIncomplete ? t.form.lessonIncomplete : t.form.invalid}</Notice>}
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
