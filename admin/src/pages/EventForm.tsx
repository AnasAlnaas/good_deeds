import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import type { AdminEventDetail, AdminMeta, EventInput } from '../../../shared/admin-api';
import { LIBYAN_CITIES, placeInCity, splitAddress } from '../../../shared/cities';
import { classOfEvent, EVENT_CLASSES, type EventClassId } from '../../../shared/classes';
import { cityTarget, locateInCity, type MapTarget } from '../../../shared/geocode';
import { nameExample } from '../../../shared/name-examples';
import { cleanTag, TAG_MAX, tagKey } from '../../../shared/tags';
import { ADDRESS_MAX, cleanPlace, MEETING_URL_MAX } from '../../../shared/rules';
import { type GenderCategory, type LocationType, MEETING_PLATFORMS, type MeetingPlatform } from '../../../shared/types';
import { api } from '../api';
import { fill, fromLocalInput, toLocalInput } from '../format';
import type { LessonImageRef } from '../../../shared/api';
import { LESSON_BODY_MAX, LESSON_TITLE_MAX, lessonComplete, MAX_LESSONS, youtubeId, youtubeWatchUrl } from '../../../shared/rules';
import { LessonPicture, LessonVideo, lessonJpeg } from '../LessonPicture';
import { MapPicker, type MovedBy } from '../MapPicker';
import { t } from '../strings';
import { Button, ErrorNote, Field, Notice, PageHeader, QueryState, useAction } from '../ui';

const TRIPOLI = { lat: 32.8872, lng: 13.1913 };
/** The place is looked up on the map once typing has paused this long (shared/geocode.ts says why). */
const PAUSE_MS = 1500;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

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
      subtype: '',
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
    // Kept for a tag its proposer wrote: the class they put it under (shared/tags.ts).
    event_class: e.event_class,
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
    lessons: existing.lessons.map(({ title, body, image_id, video_id }) => ({ title, body, image_id, video_id })),
  };
}

/** The form keeps both kinds of place while one is chosen; rules.cleanPlace sends only the chosen one's. */
interface PlaceDraft {
  location_type: LocationType;
  /** The place in the city, as written; the address sent is it and the city (cities.placeInCity). */
  address_text: string;
  /** The city chosen from the list (its Arabic name), or '' before a choice. */
  city: string;
  lat: number;
  lng: number;
  meeting_platform: MeetingPlatform;
  meeting_url: string;
}

function placeDraft(v: EventInput): PlaceDraft {
  const { place, city } = splitAddress(v.address_text ?? '');
  return {
    location_type: v.location_type,
    address_text: place,
    city: city?.ar ?? '',
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
  const inPerson = place.location_type === 'in_person';
  const city = LIBYAN_CITIES.find((c) => c.ar === place.city) ?? null;
  const placeText = oneLine(place.address_text);
  // In a place, the address sent is the place and its city; it counts once both are there.
  const address = city && placeText.length >= 2 ? placeInCity(placeText, city.ar) : '';
  const cleaned = cleanPlace({ ...place, address_text: address });

  // ---------- the class and its tag, as the app's form ----------

  const typesOf = (c: EventClassId) => [
    ...meta.subtypes.filter((x) => x.event_class === c).map((x) => ({ id: x.id, label: t.subtype[x.id] ?? x.id, points: x.base_points })),
    ...(meta.tags ?? []).filter((x) => x.event_class === c).map((x) => ({ id: x.tag, label: x.tag, points: meta.custom_tag_points ?? 0 })),
  ];
  const [eventClass, setEventClass] = useState<EventClassId | null>(() => (existing ? classOfEvent(existing.event) : null));
  const options = eventClass ? typesOf(eventClass) : [];
  // An event whose tag is not among those offered (one its proposer wrote) opens with it written.
  const [writing, setWriting] = useState(() => !!existing && !typesOf(classOfEvent(existing.event)).some((o) => o.id === existing.event.subtype));
  const [ownTag, setOwnTag] = useState(() => (writing && existing ? existing.event.subtype : ''));
  const typed = cleanTag(ownTag);
  const same = writing && typed ? options.find((o) => tagKey(o.label) === tagKey(typed) || tagKey(o.id) === tagKey(typed)) : undefined;
  const subtype = writing ? (same?.id ?? typed ?? '') : v.subtype;
  const points = options.find((o) => o.id === subtype)?.points ?? (writing ? (meta.custom_tag_points ?? 0) : (existing?.event.base_points ?? 0));
  const chooseClass = (c: EventClassId) => {
    if (c === eventClass) return;
    setEventClass(c);
    set('subtype', '');
    setWriting(false);
  };

  // ---------- the place on the map, as the app's form ----------

  const hadPin = !!existing && existing.event.location_type === 'in_person';
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [mapShown, setMapShown] = useState(hadPin);
  const [spot, setSpot] = useState<'place' | 'city' | null>(null);
  const [looking, setLooking] = useState(false);
  // The pin was put by hand: from then on the place no longer moves the map by itself.
  const [moved, setMoved] = useState(hadPin);
  const [looked, setLooked] = useState(() => `${placeText}|${place.city}`);
  const lookups = useRef(0);
  const pointAt = (to: MapTarget) => {
    setTarget(to);
    setPlace((prev) => ({ ...prev, lat: to.lat, lng: to.lng }));
    setMapShown(true);
  };
  const onPin = (p: { lat: number; lng: number }, by: MovedBy) => {
    setPlace((prev) => ({ ...prev, lat: p.lat, lng: p.lng }));
    if (by === 'hand') setMoved(true);
  };
  const chooseCity = (c: string) => {
    setPlaceField('city', c);
    setMoved(false);
    const next = LIBYAN_CITIES.find((x) => x.ar === c);
    if (next && mapShown) {
      pointAt(cityTarget(next));
      setSpot('city');
    }
  };
  /** The place in its city on the map, or the city when it is not found there. `asked`: even from a pin put by hand. */
  const lookUp = async (asked = false) => {
    if (!inPerson || !city || placeText.length < 2) return;
    const key = `${placeText}|${city.ar}`;
    if (!asked && (moved || key === looked)) return;
    setLooked(key);
    if (asked) setMoved(false);
    const mine = ++lookups.current;
    setLooking(true);
    const found = await locateInCity(placeText, city, 'ar');
    if (mine !== lookups.current) return;
    setLooking(false);
    pointAt(found.target);
    setSpot(found.kind);
  };
  const lookUpLater = useRef(lookUp);
  lookUpLater.current = lookUp;
  useEffect(() => {
    const timer = setTimeout(() => void lookUpLater.current(), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [place.address_text, place.city, place.location_type]);
  const [peopleFilter, setPeopleFilter] = useState('');
  const [invalid, setInvalid] = useState(false);
  // The lessons' pictures, to show them; the form itself names each by its id.
  const [pictures, setPictures] = useState<Record<string, LessonImageRef>>(() =>
    Object.fromEntries((existing?.lessons ?? []).flatMap((l) => (l.image ? [[l.image.id, l.image]] : []))),
  );
  const [sending, setSending] = useState<number | null>(null);
  // Each lesson's video link as typed, beside its lesson; the form sends the id read from it.
  const [videoLinks, setVideoLinks] = useState<string[]>(() =>
    (existing?.lessons ?? []).map((l) => (l.video_id ? youtubeWatchUrl(l.video_id) : '')),
  );
  const videoLinkOk = (i: number) => !(videoLinks[i] ?? '').trim() || !!v.lessons[i]?.video_id;
  const [pictureProblem, setPictureProblem] = useState<{ i: number; text: string } | null>(null);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setV((prev) => ({ ...prev, [key]: value }));

  // What the server would refuse to change, shown as locked instead.
  const termsLocked = !!existing?.event.terms_locked_at;
  const lessonsLocked = !!existing?.lessons.some((l) => l.learned_count > 0);
  const categoryLocked = (existing?.joined_count ?? 0) > 0;
  const timesLocked = !!existing?.participants.some((p) => p.attendance);
  // A tag its proposer wrote is not among the types: it stays offered while this event has it.

  const valid =
    !!eventClass &&
    !!subtype &&
    v.title.trim().length >= 3 &&
    v.description.trim().length > 0 &&
    cleaned !== null &&
    !!v.starts_at &&
    !!v.ends_at &&
    Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
    v.capacity >= 1 &&
    v.terms.every((x) => x.trim().length > 0) &&
    v.lessons.every((l, i) => lessonComplete(l) && videoLinkOk(i));
  const lessonsIncomplete = !v.lessons.every((l, i) => lessonComplete(l) && videoLinkOk(i));

  const submit = async (publish: boolean) => {
    if (!valid || !cleaned) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const body = {
      ...v,
      subtype,
      event_class: eventClass,
      ...cleaned,
      terms: v.terms.map((x) => x.trim()),
      lessons: v.lessons.map((l) => ({ title: l.title.trim(), body: l.body.trim(), image_id: l.image_id, video_id: l.video_id })),
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
    const swap = <T,>(list: T[]) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    };
    set('lessons', swap(v.lessons));
    setVideoLinks((prev) => swap(v.lessons.map((_, j) => prev[j] ?? '')));
  };
  const removeLesson = (i: number) => {
    set('lessons', v.lessons.filter((_, j) => j !== i));
    setVideoLinks((prev) => prev.filter((_, j) => j !== i));
  };
  const setVideoLink = (i: number, text: string) => {
    setVideoLinks((prev) => v.lessons.map((_, j) => (j === i ? text : (prev[j] ?? ''))));
    putLesson(i, { video_id: youtubeId(text) });
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
        <h2>{t.form.type}</h2>
        {timesLocked && <Notice tone="warning">{t.form.lockedTimes}</Notice>}
        <Field label={t.form.classLabel}>
          <div className="chips" role="group" aria-label={t.form.classLabel}>
            {EVENT_CLASSES.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={eventClass === c.id} disabled={timesLocked} onClick={() => chooseClass(c.id)}>
                {c.name_ar}
              </button>
            ))}
          </div>
        </Field>
        {eventClass && (
          <Field label={t.form.tagLabel} hint={subtype ? fill(t.form.typePoints, { n: points }) : undefined}>
            <div className="chips" role="group" aria-label={t.form.tagLabel}>
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="chip"
                  aria-pressed={subtype === o.id}
                  disabled={timesLocked}
                  onClick={() => {
                    set('subtype', o.id);
                    setWriting(false);
                  }}>
                  {o.label}
                </button>
              ))}
              {meta.tags !== undefined && (
                <button type="button" className="chip" aria-pressed={writing} disabled={timesLocked} onClick={() => setWriting(true)}>
                  {t.form.writeTag}
                </button>
              )}
            </div>
          </Field>
        )}
        {eventClass && writing && (
          <Field label={t.form.ownTag} hint={same ? fill(t.form.ownTagExists, { tag: same.label }) : t.form.ownTagHint}>
            <input value={ownTag} maxLength={TAG_MAX} placeholder={t.form.ownTagPlaceholder} disabled={timesLocked} onChange={(e) => setOwnTag(e.target.value)} />
          </Field>
        )}
      </section>

      <section className="card">
        <h2>{t.form.basics}</h2>
        <Field label={t.form.title}>
          <input
            value={v.title}
            maxLength={120}
            placeholder={nameExample('ar', subtype, eventClass) ?? t.form.titlePlaceholder}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <Field label={t.form.description}>
          <textarea value={v.description} maxLength={4000} placeholder={t.form.descriptionPlaceholder} onChange={(e) => set('description', e.target.value)} />
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
        {inPerson ? (
          <>
            <Field label={t.form.city}>
              <select value={place.city} onChange={(e) => chooseCity(e.target.value)}>
                <option value="" disabled>
                  {t.form.chooseCity}
                </option>
                {LIBYAN_CITIES.map((c) => (
                  <option key={c.ar} value={c.ar}>
                    {c.ar}
                  </option>
                ))}
              </select>
            </Field>
            {city && (
              <Field label={t.form.address} hint={looking ? t.form.looking : t.form.addressHint}>
                <input
                  value={place.address_text}
                  maxLength={ADDRESS_MAX - city.ar.length - 2}
                  placeholder={t.form.addressPlaceholder}
                  onChange={(e) => setPlaceField('address_text', e.target.value)}
                  onBlur={() => void lookUp()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void lookUp();
                    }
                  }}
                />
              </Field>
            )}
            {city && mapShown && (
              <>
                <p className="small muted" aria-live="polite">
                  {spot === 'place' ? t.form.mapAtPlace : spot === 'city' ? fill(t.form.mapAtCity, { city: city.ar }) : t.form.mapHint}
                </p>
                <MapPicker value={place} target={target} onChange={onPin} label={t.form.mapLabel} />
                {moved && placeText.length >= 2 && `${placeText}|${city.ar}` !== looked && (
                  <Button variant="quiet" className="btn-small" disabled={looking} onClick={() => void lookUp(true)}>
                    {t.form.showOnMap}
                  </Button>
                )}
              </>
            )}
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
              <Field label={t.form.videoLink} hint={videoLinkOk(i) ? undefined : <span style={{ color: 'var(--danger)' }}>{t.form.videoInvalid}</span>}>
                <input
                  dir="ltr"
                  type="url"
                  placeholder="https://youtu.be/…"
                  value={videoLinks[i] ?? ''}
                  disabled={lessonsLocked}
                  aria-invalid={!videoLinkOk(i)}
                  onChange={(e) => setVideoLink(i, e.target.value)}
                />
              </Field>
              {lesson.video_id && <LessonVideo videoId={lesson.video_id} label={fill(t.event.lessonVideo, { title: lesson.title })} />}
              <Field label={lesson.image_id || lesson.video_id ? t.form.lessonBodyOptional : t.form.lessonBody}>
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
                <Button variant="quiet" className="btn-small" onClick={() => removeLesson(i)}>
                  {t.form.remove}
                </Button>
              </div>
            )}
          </div>
        ))}
        {!lessonsLocked && v.lessons.length < MAX_LESSONS && (
          <div>
            <Button variant="secondary" onClick={() => set('lessons', [...v.lessons, { title: '', body: '', image_id: null, video_id: null }])}>
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
