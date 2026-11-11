import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { type LatLng, LocationPicker, type MapTarget, type MovedBy } from '@/components/LocationPicker';
import { Reveal } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { CopyEvent, LessonLibrary } from '@/components/CopyEvent';
import { Card, Chip, Field, Row, SectionTitle } from '@/components/ui';
import { LessonPicture } from '@/components/LessonPicture';
import { LessonVideo } from '@/components/LessonVideo';
import type { EventDetail, EventFormMeta, EventProposal, LessonImageRef, LessonInput, LessonLibraryItem, ProposeEventResponse } from '@/data/api';
import { type GenderCategory, type LocationType, MEETING_PLATFORMS, type MeetingPlatform } from '@/data/types';
import { count, fmt } from '@/i18n/format';
import { cityTarget, findPlace } from '@/lib/geocode';
import { goBack } from '@/lib/goBack';
import { pickLessonPicture } from '@/lib/photo';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { classIcon, className, classOfEvent, EVENT_CLASSES, type EventClassId } from '@/theme/classes';
import { colors, radius, space, touch } from '@/theme/tokens';
import { type City, cityInText, LIBYAN_CITIES } from '../../../shared/cities';
import {
  ADDRESS_MAX,
  cleanPlace,
  LESSON_BODY_MAX,
  LESSON_TITLE_MAX,
  lessonComplete,
  MAX_LESSONS,
  MEETING_URL_MAX,
  repeatTimes,
  youtubeId,
  youtubeWatchUrl,
} from '../../../shared/rules';
import { cleanTag, TAG_MAX, tagKey } from '../../../shared/tags';

// The event form of the app: proposing an event (level 5, or a supervisor),
// and the proposer editing it while it waits for an admin (`editing`). An
// admin approves it before it is published; the server re-checks every rule.
//
// Owner's decision (2026-11-09): a new event is filled in step by step. Each
// section appears once the one before it is filled in (Reveal), and stays:
// about the event → its class and tag → its place → the rest, which has
// sensible values already. Inside a section, what a choice needs appears with
// the choice: a class's tags, the map once the address is known, the meeting
// link for an online event. An event being edited shows everything at once.
//
// A new event may start from an earlier one (CopyEvent: its name, place,
// lessons and terms, at the same hour in a week to come), and a lesson may be
// added from an earlier event (LessonLibrary). Either way the new event is
// sent and reviewed like any other.

const HOUR = 3_600_000;
/** The address is looked up on the map once typing has paused this long (lib/geocode.ts says why). */
const PAUSE_MS = 1500;
/** Sections that appear together follow one another by this much. */
const STAGGER_MS = 110;

/** A tag the form offers under a class: a known type, or one people wrote that came into use. */
interface TagOption {
  id: string;
  label: string;
  points: number;
}

/** What the form says about where the map is: at the address, at its city, or that it found neither. */
type Spot = { kind: 'place' } | { kind: 'city'; city: City } | { kind: 'none' };

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A lesson as the form keeps it: with its picture, to show it, and its video link as typed (video_id is read from it). */
type FormLesson = LessonInput & { image: LessonImageRef | null; video_link: string };

/** A typed link is fine when empty, or when it is a YouTube video's. */
const videoLinkOk = (l: FormLesson) => !l.video_link.trim() || !!l.video_id;

/** The form keeps both kinds of place while one is chosen; rules.cleanPlace sends only the chosen one's. */
type Values = Omit<
  EventProposal,
  'capacity' | 'event_class' | 'location_type' | 'address_text' | 'lat' | 'lng' | 'meeting_platform' | 'meeting_url' | 'lessons'
> & {
  /** null until chosen: a new event starts with neither. */
  event_class: EventClassId | null;
  location_type: LocationType | null;
  address_text: string;
  lat: number;
  lng: number;
  meeting_platform: MeetingPlatform;
  meeting_url: string;
  lessons: FormLesson[];
};

const NEW_LESSON: FormLesson = { title: '', body: '', image_id: null, image: null, video_id: null, video_link: '' };

function blank(home: LatLng): Values {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    title: '',
    description: '',
    subtype: '',
    event_class: null,
    location_type: null,
    address_text: '',
    lat: home.lat,
    lng: home.lng,
    meeting_platform: 'zoom',
    meeting_url: '',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3 * HOUR).toISOString(),
    gender_category: 'mixed',
    terms: [],
    lessons: [],
  };
}

/** A lesson of the library, as the form keeps it: a copy, with the same picture and video. */
function libraryLesson(l: LessonLibraryItem): FormLesson {
  return {
    title: l.title,
    body: l.body,
    image_id: l.image?.id ?? null,
    image: l.image,
    video_id: l.video_id,
    video_link: l.video_id ? youtubeWatchUrl(l.video_id) : '',
  };
}

/** A new event from an earlier one: all of it, at the same hour in a week to come (rules.repeatTimes). */
function copied(e: EventDetail, home: LatLng, now: number): Values {
  return { ...valuesOf(e, home), ...repeatTimes(e, now) };
}

function valuesOf(e: EventDetail, home: LatLng): Values {
  return {
    title: e.title,
    description: e.description,
    subtype: e.subtype,
    event_class: classOfEvent(e),
    location_type: e.location_type,
    address_text: e.address_text ?? '',
    lat: e.lat ?? home.lat,
    lng: e.lng ?? home.lng,
    meeting_platform: e.meeting_platform ?? 'zoom',
    // The proposer supervises their event, so its page gives them the link.
    meeting_url: e.meeting_url ?? '',
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    gender_category: e.gender_category,
    terms: e.terms.map((x) => x.text ?? ''),
    // A server from before lesson pictures sends none.
    lessons: (e.lessons ?? []).map(({ title, body, image, video_id }) => ({
      title,
      body,
      image_id: image?.id ?? null,
      image: image ?? null,
      video_id: video_id ?? null,
      video_link: video_id ? youtubeWatchUrl(video_id) : '',
    })),
  };
}

export function EventForm({
  meta,
  editing,
  copyFrom = null,
  onCopy,
}: {
  meta: EventFormMeta;
  editing?: EventDetail;
  /** A new event filled in from an earlier one (CopyEvent); the screen keys the form by it, so the form starts again from it. */
  copyFrom?: EventDetail | null;
  /** Start from this earlier event (its id), or from a blank form again (null). Only for a new event. */
  onCopy?: (id: string | null) => void;
}) {
  const { s, lang, now } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  // The person's own city: where the pin starts, and where the map opens when the address is not found.
  const [home] = useState(() => cityTarget(LIBYAN_CITIES.find((c) => c.ar === me.city) ?? LIBYAN_CITIES[0]));
  // What the form starts from: the event being edited, or the earlier one being copied.
  const init = editing ?? copyFrom ?? undefined;
  const [v, setV] = useState(() => (editing ? valuesOf(editing, home) : copyFrom ? copied(copyFrom, home, now) : blank(home)));
  const [capacity, setCapacity] = useState(String(init?.capacity ?? 20));
  const [invalid, setInvalid] = useState(false);
  const [mapTouched, setMapTouched] = useState(false);
  const [done, setDone] = useState<ProposeEventResponse | null>(null);
  // The lesson whose picture is being sent, and the one whose picture could not be used.
  const [sending, setSending] = useState<number | null>(null);
  const [badPicture, setBadPicture] = useState<number | null>(null);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));

  // ---------- the class and its tags ----------

  // A server from before written tags sends none, and would refuse one: the form then offers the types only.
  const canWrite = meta.tags !== undefined;
  const writtenPoints = meta.custom_tag_points ?? 0;
  const tagsOf = (c: EventClassId): TagOption[] => [
    ...meta.subtypes.filter((x) => x.event_class === c).map((x) => ({ id: x.id, label: s.subtype[x.id] ?? x.id, points: x.base_points })),
    ...(meta.tags ?? []).filter((x) => x.event_class === c).map((x) => ({ id: x.tag, label: x.tag, points: writtenPoints })),
  ];
  const options = v.event_class ? tagsOf(v.event_class) : [];
  // Writing a tag of their own. An event being edited opens that way when its tag is not among those offered.
  const [writing, setWriting] = useState(() => !!init && !tagsOf(classOfEvent(init)).some((o) => o.id === init.subtype));
  const [ownTag, setOwnTag] = useState(writing && init ? init.subtype : '');
  // The keyboard opens on the field when they choose to write, not when an edit opens on it.
  const [focusOwnTag, setFocusOwnTag] = useState(false);
  const typed = cleanTag(ownTag);
  // What they wrote is a tag already offered: the event carries that one, spelled as everyone's.
  const same = writing && typed ? options.find((o) => tagKey(o.label) === tagKey(typed) || tagKey(o.id) === tagKey(typed)) : undefined;
  const subtype = writing ? (same?.id ?? typed ?? '') : v.subtype;
  const points = options.find((o) => o.id === subtype)?.points ?? writtenPoints;

  const chooseClass = (c: EventClassId) => {
    if (c === v.event_class) return;
    setV((prev) => ({ ...prev, event_class: c, subtype: '' }));
    setWriting(false);
  };
  const chooseTag = (id: string) => {
    set('subtype', id);
    setWriting(false);
  };
  const startWriting = () => {
    setWriting(true);
    setFocusOwnTag(true);
  };

  // ---------- the place on the map ----------

  const hadPin = init?.location_type === 'in_person';
  // The map appears once the form knows where to open it: at the address, at its city, or (an edit) at the event's pin.
  const [mapShown, setMapShown] = useState(hadPin);
  // The last place the form pointed the map at. A new one flies the map there.
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [looking, setLooking] = useState(false);
  // The pin was put by hand: from then on the address no longer moves the map by itself.
  const [moved, setMoved] = useState(hadPin);
  const [confirmed, setConfirmed] = useState(hadPin);
  // The address as last looked up, so the same one is not looked up twice.
  const [looked, setLooked] = useState(oneLine(init?.address_text ?? ''));
  // The same facts for what runs after a wait (a lookup's answer): the screen may have moved on meanwhile.
  const live = useRef({ moved: hadPin, mapShown: hadPin, lookups: 0, city: null as string | null });

  const pointAt = (place: MapTarget) => {
    live.current.mapShown = true;
    setTarget(place);
    setV((prev) => ({ ...prev, lat: place.lat, lng: place.lng }));
    setMapShown(true);
  };
  const onPlace = useCallback((p: LatLng, by: MovedBy) => {
    setV((prev) => ({ ...prev, lat: p.lat, lng: p.lng }));
    if (by === 'hand') {
      live.current.moved = true;
      setMoved(true);
    }
  }, []);

  // A city of the list named in the address opens the map on it at once, as they type.
  const onAddress = (text: string) => {
    set('address_text', text);
    if (live.current.moved) return;
    const city = cityInText(text);
    if (!city || city.ar === live.current.city) return;
    live.current.city = city.ar;
    pointAt(cityTarget(city));
    setSpot({ kind: 'city', city });
  };

  /**
   * Finds the address on the map and points the map at it, or at the closest it
   * gets: the address's area, else its city, else the person's own city.
   * `asked`: they pressed the button, so the map moves even from a pin put by hand.
   */
  const lookUp = async (asked = false) => {
    const text = oneLine(v.address_text);
    if (v.location_type !== 'in_person' || text.length < 3) return;
    if (!asked && (live.current.moved || text === looked)) return;
    setLooked(text);
    const mine = ++live.current.lookups;
    if (asked) {
      live.current.moved = false;
      setMoved(false);
      setConfirmed(false);
    }
    setLooking(true);
    const place = await findPlace(text, lang);
    // A later lookup took over, or they put the pin themselves while this one was away.
    if (mine !== live.current.lookups) return;
    setLooking(false);
    if (live.current.moved) return;
    const city = cityInText(text);
    if (place) {
      live.current.city = city?.ar ?? null;
      pointAt(place);
      setSpot({ kind: 'place' });
    } else if (city) {
      if (asked || live.current.city !== city.ar) pointAt(cityTarget(city));
      live.current.city = city.ar;
      setSpot({ kind: 'city', city });
    } else {
      if (!live.current.mapShown) pointAt(home);
      setSpot({ kind: 'none' });
    }
  };
  const onPause = useEffectEvent(() => {
    void lookUp();
  });
  useEffect(() => {
    const timer = setTimeout(onPause, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [v.address_text, v.location_type]);

  // Only a waiting proposal is edited, so an edit never publishes; and it is one of those waiting, not one more.
  const direct = !editing && meta.publishes_directly;
  const full = !editing && !direct && meta.waiting >= meta.max_waiting;
  const starts = new Date(v.starts_at);
  const ends = new Date(v.ends_at);
  const seats = Number(capacity);
  const categories: GenderCategory[] = ['mixed', me.gender];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const inPerson = v.location_type === 'in_person';
  const online = v.location_type === 'online';
  const place = cleanPlace({ ...v, location_type: v.location_type ?? '' });
  const lessonsIncomplete = !v.lessons.every((l) => lessonComplete(l) && videoLinkOk(l));

  // ---------- the steps ----------

  const aboutDone = v.title.trim().length >= 3 && v.description.trim().length > 0;
  const kindDone = !!v.event_class && !!subtype;
  // In a place, the pin is confirmed on the map: an address alone does not say where.
  const placeDone = place !== null && (online || confirmed);
  const step = !aboutDone ? 0 : !kindDone ? 1 : !placeDone ? 2 : 3;
  // How far the form has opened. It never closes again: clearing a field leaves what is below it in place.
  const [reached, setReached] = useState(init ? 3 : 0);
  if (step > reached) setReached(step);
  // What to do for the next section to appear.
  const next =
    reached === 0
      ? s.newEvent.next.about
      : reached === 1
        ? v.event_class
          ? s.newEvent.next.tag
          : s.newEvent.next.eventClass
        : !v.location_type
          ? s.newEvent.next.where
          : online
            ? s.newEvent.next.link
            : mapShown
              ? s.newEvent.next.pin
              : s.newEvent.next.address;

  const valid =
    aboutDone &&
    kindDone &&
    placeDone &&
    starts.getTime() > now &&
    ends.getTime() > starts.getTime() &&
    Number.isInteger(seats) &&
    seats >= 1 &&
    v.terms.every((x) => x.trim().length > 0) &&
    !lessonsIncomplete;

  const putLesson = (i: number, patch: Partial<FormLesson>) =>
    setV((prev) => ({ ...prev, lessons: prev.lessons.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  // The picture is sent first; the form then names it, and saving the event keeps it.
  const choosePicture = async (i: number) => {
    setBadPicture(null);
    const picked = await pickLessonPicture();
    if (!picked) return;
    if (picked === 'too_big') {
      setBadPicture(i);
      return;
    }
    setSending(i);
    const result = await run((b) => b.uploadLessonImage(picked));
    setSending(null);
    if (result) putLesson(i, { image_id: result.value.image.id, image: result.value.image });
  };

  // A new start keeps the event's length.
  const setStart = (next: Date) =>
    setV((prev) => {
      const length = Date.parse(prev.ends_at) - Date.parse(prev.starts_at);
      return { ...prev, starts_at: next.toISOString(), ends_at: new Date(next.getTime() + length).toISOString() };
    });

  const submit = async () => {
    if (!valid) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (!place) return;
    const body: EventProposal = {
      title: v.title.trim(),
      description: v.description.trim(),
      subtype,
      event_class: v.event_class,
      ...place,
      starts_at: v.starts_at,
      ends_at: v.ends_at,
      capacity: seats,
      gender_category: v.gender_category,
      terms: v.terms.map((x) => x.trim()),
      lessons: v.lessons.map((l) => ({ title: l.title.trim(), body: l.body.trim(), image_id: l.image_id, video_id: l.video_id })),
    };
    if (editing) {
      if (await run((b) => b.editProposal(editing.id, body))) goBack(`/event/${editing.id}`);
      return;
    }
    const result = await run((b) => b.proposeEvent(body));
    if (result) setDone(result.value);
  };

  if (done) {
    const published = done.status === 'published';
    return (
      <Screen scroll={false}>
        <View style={styles.done}>
          <Ionicons name={published ? 'checkmark-circle' : 'hourglass-outline'} size={72} color={published ? colors.success : colors.primary} />
          <Txt variant="screenTitle" align="center">
            {published ? s.newEvent.doneTitleAdmin : s.newEvent.doneTitle}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {published ? s.newEvent.doneBodyAdmin : s.newEvent.doneBody}
          </Txt>
          <Button label={s.newEvent.open} onPress={() => router.replace(`/event/${done.id}`)} />
        </View>
      </Screen>
    );
  }

  // The button comes with the last sections: before them there is nothing to send yet.
  const footer = (
    <Reveal show={reached >= 3} gap={space.sm}>
      {invalid && (
        <Txt variant="caption" color={colors.danger}>
          {lessonsIncomplete ? s.newEvent.lessonIncomplete : place && inPerson && !confirmed ? s.newEvent.confirmPinFirst : s.newEvent.invalid}
        </Txt>
      )}
      <Button
        icon={editing ? 'checkmark' : direct ? 'megaphone-outline' : 'paper-plane-outline'}
        label={editing ? s.newEvent.save : direct ? s.newEvent.submitAdmin : s.newEvent.submit}
        disabled={busy || full}
        onPress={submit}
      />
    </Reveal>
  );

  const spotText = !spot
    ? s.newEvent.mapHint
    : spot.kind === 'place'
      ? s.newEvent.mapAtPlace
      : spot.kind === 'city'
        ? fmt(s.newEvent.mapAtCity, { city: spot.city[lang] })
        : s.newEvent.mapNotFound;
  const addressNow = oneLine(v.address_text);

  return (
    <Screen
      back
      title={editing ? s.newEvent.editTitle : direct ? s.newEvent.titleAdmin : s.newEvent.title}
      footer={footer}
      scrollEnabled={!mapTouched}>
      <Card style={styles.intro}>
        <Txt>{editing ? s.newEvent.editIntro : direct ? s.newEvent.introAdmin : s.newEvent.intro}</Txt>
      </Card>
      {!editing && onCopy && <CopyEvent copied={copyFrom} onCopy={onCopy} />}
      {full && (
        <Card style={styles.warning}>
          <Txt color={colors.warning}>{fmt(s.newEvent.waitingFull, { n: meta.waiting })}</Txt>
        </Card>
      )}

      <SectionTitle>{s.newEvent.about}</SectionTitle>
      <Field label={s.newEvent.name} placeholder={s.newEvent.namePlaceholder} value={v.title} maxLength={120} onChangeText={(t) => set('title', t)} />
      <Field
        label={s.newEvent.description}
        placeholder={s.newEvent.descriptionPlaceholder}
        value={v.description}
        maxLength={4000}
        multiline
        onChangeText={(t) => set('description', t)}
      />

      <Reveal show={reached >= 1}>
        <SectionTitle>{s.newEvent.type}</SectionTitle>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.classLabel}
        </Txt>
        <Row>
          {EVENT_CLASSES.map((c) => (
            <Chip key={c.id} label={className(c.id, lang)} icon={classIcon(c.id)} selected={v.event_class === c.id} onPress={() => chooseClass(c.id)} />
          ))}
        </Row>
      </Reveal>
      <Reveal show={reached >= 1 && !!v.event_class}>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.tagLabel}
        </Txt>
        {/* Keyed by the class: another class's tags fade in, in place of the first's. */}
        <Animated.View key={v.event_class} entering={FadeIn.duration(280)}>
          <Row>
            {options.map((o) => (
              <Chip key={o.id} label={o.label} selected={subtype === o.id} onPress={() => chooseTag(o.id)} />
            ))}
            {canWrite && <Chip label={s.newEvent.writeTag} icon="create-outline" selected={writing} onPress={startWriting} />}
          </Row>
        </Animated.View>
      </Reveal>
      <Reveal show={reached >= 1 && !!v.event_class && writing}>
        <Field
          label={s.newEvent.ownTag}
          placeholder={s.newEvent.ownTagPlaceholder}
          value={ownTag}
          maxLength={TAG_MAX}
          autoFocus={focusOwnTag}
          onChangeText={setOwnTag}
        />
        <Txt variant="caption" color={colors.inkMuted}>
          {same ? fmt(s.newEvent.ownTagExists, { tag: same.label }) : s.newEvent.ownTagHint}
        </Txt>
      </Reveal>
      <Reveal show={reached >= 1 && kindDone}>
        <Txt variant="caption" color={colors.inkMuted}>
          {fmt(s.newEvent.typePoints, { points: count(points, s.units.point) })}
        </Txt>
      </Reveal>

      <Reveal show={reached >= 2}>
        <SectionTitle>{s.newEvent.place}</SectionTitle>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.locationType}
        </Txt>
        <Row>
          <Chip label={s.newEvent.inPerson} icon="location-outline" selected={inPerson} onPress={() => set('location_type', 'in_person')} />
          <Chip label={s.newEvent.online} icon="videocam-outline" selected={online} onPress={() => set('location_type', 'online')} />
        </Row>
      </Reveal>
      <Reveal show={reached >= 2 && inPerson}>
        <Field
          label={s.newEvent.address}
          placeholder={s.newEvent.addressPlaceholder}
          value={v.address_text}
          maxLength={ADDRESS_MAX}
          returnKeyType="search"
          onChangeText={onAddress}
          onBlur={() => lookUp()}
          onSubmitEditing={() => lookUp()}
        />
        <View style={styles.status}>
          {looking && <Ionicons name="search" size={16} color={colors.inkMuted} />}
          <Txt variant="caption" color={colors.inkMuted} style={styles.flex} accessibilityLiveRegion="polite">
            {looking ? s.newEvent.looking : s.newEvent.addressHint}
          </Txt>
        </View>
      </Reveal>
      <Reveal show={reached >= 2 && inPerson && mapShown}>
        <Txt variant="caption" color={colors.inkMuted} accessibilityLiveRegion="polite">
          {spotText}
        </Txt>
        {/* It opens where the pin is; the form then points it at each place it finds. */}
        <LocationPicker value={v} zoom={moved ? 16 : (target?.zoom ?? 16)} target={target} onChange={onPlace} onTouching={setMapTouched} />
        {/* The pin was put by hand and the address then changed: the map follows only when asked. */}
        {moved && addressNow.length >= 3 && addressNow !== looked && (
          <Button variant="quiet" icon="navigate-outline" label={s.newEvent.showOnMap} disabled={looking} onPress={() => lookUp(true)} />
        )}
        {confirmed ? (
          <Animated.View key="confirmed" entering={FadeIn.duration(280)} style={styles.confirmed}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Txt variant="caption" color={colors.inkMuted} style={styles.flex}>
              {s.newEvent.pinConfirmed}
            </Txt>
          </Animated.View>
        ) : (
          <Button variant="secondary" icon="checkmark" label={s.newEvent.confirmPin} onPress={() => setConfirmed(true)} />
        )}
      </Reveal>
      <Reveal show={reached >= 2 && online}>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.platform}
        </Txt>
        <Row>
          {MEETING_PLATFORMS.map((p) => (
            <Chip key={p} label={s.platforms[p]} selected={v.meeting_platform === p} onPress={() => set('meeting_platform', p)} />
          ))}
        </Row>
        <Field
          label={s.newEvent.meetingUrl}
          placeholder={s.newEvent.meetingUrlPlaceholder}
          value={v.meeting_url}
          maxLength={MEETING_URL_MAX}
          ltr
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={(t) => set('meeting_url', t.trim())}
        />
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.meetingUrlHint}
        </Txt>
      </Reveal>

      <Reveal show={reached >= 3}>
        <SectionTitle>{s.newEvent.time}</SectionTitle>
        <DateTimeField label={s.newEvent.starts} value={starts} minimumDate={today} onChange={setStart} />
        <DateTimeField label={s.newEvent.ends} value={ends} minimumDate={today} onChange={(d) => set('ends_at', d.toISOString())} />
      </Reveal>

      <Reveal show={reached >= 3} delay={STAGGER_MS}>
        <SectionTitle>{s.newEvent.seats}</SectionTitle>
        <Field label={s.newEvent.capacity} value={capacity} keyboardType="number-pad" maxLength={5} ltr onChangeText={(t) => setCapacity(t.replace(/[^0-9]/g, ''))} />
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.category}
        </Txt>
        <Row>
          {categories.map((c) => (
            <Chip key={c} label={s.category[c]} selected={v.gender_category === c} onPress={() => set('gender_category', c)} />
          ))}
        </Row>
      </Reveal>

      <Reveal show={reached >= 3} delay={2 * STAGGER_MS}>
        <SectionTitle>{s.newEvent.lessons}</SectionTitle>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.lessonsHint}
        </Txt>
        {v.lessons.map((lesson, i) => {
          const put = (patch: Partial<FormLesson>) => putLesson(i, patch);
          return (
            <Card key={i}>
              <View style={styles.term}>
                <Txt variant="bodyStrong" color={colors.primary} style={styles.flex}>
                  {fmt(s.newEvent.lesson, { n: i + 1 })}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={fmt(s.newEvent.removeLesson, { n: i + 1 })}
                  onPress={() => set('lessons', v.lessons.filter((_, j) => j !== i))}
                  style={styles.remove}
                  hitSlop={4}>
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </Pressable>
              </View>
              <Field
                label={s.newEvent.lessonTitle}
                placeholder={s.newEvent.lessonTitlePlaceholder}
                value={lesson.title}
                maxLength={LESSON_TITLE_MAX}
                onChangeText={(title) => put({ title })}
              />
              {lesson.image && (
                <LessonPicture image={lesson.image} label={fmt(s.learn.picture, { title: lesson.title })} maxHeight={260} />
              )}
              {sending === i ? (
                <Button variant="quiet" icon="hourglass-outline" label={s.newEvent.sendingPicture} disabled onPress={() => {}} />
              ) : lesson.image ? (
                <Row>
                  <View style={styles.flex}>
                    <Button variant="secondary" icon="image-outline" label={s.newEvent.changePicture} disabled={busy} onPress={() => choosePicture(i)} />
                  </View>
                  <View style={styles.flex}>
                    <Button variant="quiet" icon="close" label={s.newEvent.removePicture} onPress={() => put({ image_id: null, image: null })} />
                  </View>
                </Row>
              ) : (
                <Button variant="secondary" icon="image-outline" label={s.newEvent.addPicture} disabled={busy} onPress={() => choosePicture(i)} />
              )}
              {badPicture === i && (
                <Txt variant="caption" color={colors.danger}>
                  {s.errors.photo_invalid}
                </Txt>
              )}
              <Field
                label={s.newEvent.videoLink}
                placeholder="https://youtu.be/…"
                value={lesson.video_link}
                ltr
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                error={videoLinkOk(lesson) ? null : s.newEvent.videoInvalid}
                onChangeText={(video_link) => put({ video_link, video_id: youtubeId(video_link) })}
              />
              {lesson.video_id && <LessonVideo videoId={lesson.video_id} title={lesson.title} />}
              <Field
                label={lesson.image || lesson.video_id ? s.newEvent.lessonBodyOptional : s.newEvent.lessonBody}
                placeholder={s.newEvent.lessonBodyPlaceholder}
                value={lesson.body}
                maxLength={LESSON_BODY_MAX}
                multiline
                onChangeText={(body) => put({ body })}
              />
            </Card>
          );
        })}
        {v.lessons.length < MAX_LESSONS && (
          <>
            <Button variant="secondary" icon="add" label={s.newEvent.addLesson} onPress={() => set('lessons', [...v.lessons, NEW_LESSON])} />
            <LessonLibrary
              library={meta.lesson_library ?? []}
              inForm={v.lessons}
              onAdd={(l) => setV((prev) => ({ ...prev, lessons: [...prev.lessons, libraryLesson(l)].slice(0, MAX_LESSONS) }))}
            />
          </>
        )}
      </Reveal>

      <Reveal show={reached >= 3} delay={3 * STAGGER_MS}>
        <SectionTitle>{s.newEvent.terms}</SectionTitle>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.newEvent.termsHint}
        </Txt>
        {v.terms.map((term, i) => (
          <View key={i} style={styles.term}>
            <View style={styles.flex}>
              <Field
                label={fmt(s.newEvent.term, { n: i + 1 })}
                value={term}
                maxLength={1000}
                multiline
                onChangeText={(t) => set('terms', v.terms.map((x, j) => (j === i ? t : x)))}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fmt(s.newEvent.removeTerm, { n: i + 1 })}
              onPress={() => set('terms', v.terms.filter((_, j) => j !== i))}
              style={styles.remove}
              hitSlop={4}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        <Button variant="secondary" icon="add" label={s.newEvent.addTerm} onPress={() => set('terms', [...v.terms, ''])} />
      </Reveal>

      {/* What makes the next section appear, until all of them have. */}
      <Reveal show={reached < 3}>
        <View style={styles.next}>
          <Ionicons name="chevron-down-circle-outline" size={20} color={colors.primary} />
          <Animated.View key={next} entering={FadeIn.duration(280)} style={styles.flex}>
            <Txt variant="caption" color={colors.primary} accessibilityLiveRegion="polite">
              {next}
            </Txt>
          </Animated.View>
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // As tall as the button it takes the place of, so the page does not move.
  confirmed: { minHeight: touch + 4, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
  },
  warning: { borderColor: colors.warning },
  term: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1 },
  remove: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
