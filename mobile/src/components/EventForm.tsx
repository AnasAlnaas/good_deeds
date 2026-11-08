import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { type LatLng, LocationPicker } from '@/components/LocationPicker';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Field, Row, SectionTitle } from '@/components/ui';
import { LessonPicture } from '@/components/LessonPicture';
import type { EventDetail, EventFormMeta, EventProposal, LessonImageRef, LessonInput, ProposeEventResponse } from '@/data/api';
import { type GenderCategory, MEETING_PLATFORMS, type MeetingPlatform } from '@/data/types';
import { count, fmt } from '@/i18n/format';
import { goBack } from '@/lib/goBack';
import { pickLessonPicture } from '@/lib/photo';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { classIcon, className, EVENT_CLASSES } from '@/theme/classes';
import { colors, space, touch } from '@/theme/tokens';
import { ADDRESS_MAX, cleanPlace, LESSON_BODY_MAX, LESSON_TITLE_MAX, lessonComplete, MAX_LESSONS, MEETING_URL_MAX } from '../../../shared/rules';

// The event form of the app: proposing an event (level 5, or a supervisor),
// and the proposer editing it while it waits for an admin (`editing`). An
// admin approves it before it is published; the server re-checks every rule.

const TRIPOLI: LatLng = { lat: 32.8872, lng: 13.1913 };
const HOUR = 3_600_000;

/** A lesson as the form keeps it: with its picture, to show it. */
type FormLesson = LessonInput & { image: LessonImageRef | null };

/** The form keeps both kinds of place while one is chosen; rules.cleanPlace sends only the chosen one's. */
type Values = Omit<EventProposal, 'capacity' | 'address_text' | 'lat' | 'lng' | 'meeting_platform' | 'meeting_url' | 'lessons'> & {
  address_text: string;
  lat: number;
  lng: number;
  meeting_platform: MeetingPlatform;
  meeting_url: string;
  lessons: FormLesson[];
};

const NEW_LESSON: FormLesson = { title: '', body: '', image_id: null, image: null };

function blank(): Values {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    title: '',
    description: '',
    subtype: 'street_cleanup',
    location_type: 'in_person',
    address_text: '',
    lat: TRIPOLI.lat,
    lng: TRIPOLI.lng,
    meeting_platform: 'zoom',
    meeting_url: '',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3 * HOUR).toISOString(),
    gender_category: 'mixed',
    terms: [],
    lessons: [],
  };
}

function valuesOf(e: EventDetail): Values {
  return {
    title: e.title,
    description: e.description,
    subtype: e.subtype,
    location_type: e.location_type,
    address_text: e.address_text ?? '',
    lat: e.lat ?? TRIPOLI.lat,
    lng: e.lng ?? TRIPOLI.lng,
    meeting_platform: e.meeting_platform ?? 'zoom',
    // The proposer supervises their event, so its page gives them the link.
    meeting_url: e.meeting_url ?? '',
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    gender_category: e.gender_category,
    terms: e.terms.map((x) => x.text ?? ''),
    // A server from before lesson pictures sends none.
    lessons: (e.lessons ?? []).map(({ title, body, image }) => ({ title, body, image_id: image?.id ?? null, image: image ?? null })),
  };
}

export function EventForm({ meta, editing }: { meta: EventFormMeta; editing?: EventDetail }) {
  const { s, lang, now } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const [v, setV] = useState(() => (editing ? valuesOf(editing) : blank()));
  const [capacity, setCapacity] = useState(String(editing?.capacity ?? 20));
  const [invalid, setInvalid] = useState(false);
  const [mapTouched, setMapTouched] = useState(false);
  const [done, setDone] = useState<ProposeEventResponse | null>(null);
  // The lesson whose picture is being sent, and the one whose picture could not be used.
  const [sending, setSending] = useState<number | null>(null);
  const [badPicture, setBadPicture] = useState<number | null>(null);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));
  // Where the map opens: the event's pin, or the city. Kept fixed so moving the map does not re-centre it.
  const [startPin] = useState<LatLng>(() => ({ lat: v.lat, lng: v.lng }));
  const onPlace = useCallback((p: LatLng) => setV((prev) => ({ ...prev, lat: p.lat, lng: p.lng })), []);

  // Only a waiting proposal is edited, so an edit never publishes; and it is one of those waiting, not one more.
  const direct = !editing && meta.publishes_directly;
  const full = !editing && !direct && meta.waiting >= meta.max_waiting;
  const starts = new Date(v.starts_at);
  const ends = new Date(v.ends_at);
  const seats = Number(capacity);
  const points = meta.subtypes.find((x) => x.id === v.subtype)?.base_points ?? 0;
  const categories: GenderCategory[] = ['mixed', me.gender];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const place = cleanPlace(v);
  const valid =
    v.title.trim().length >= 3 &&
    v.description.trim().length > 0 &&
    place !== null &&
    starts.getTime() > now &&
    ends.getTime() > starts.getTime() &&
    Number.isInteger(seats) &&
    seats >= 1 &&
    v.terms.every((x) => x.trim().length > 0) &&
    v.lessons.every(lessonComplete);
  const lessonsIncomplete = !v.lessons.every(lessonComplete);

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
      ...v,
      ...place,
      title: v.title.trim(),
      description: v.description.trim(),
      capacity: seats,
      terms: v.terms.map((x) => x.trim()),
      lessons: v.lessons.map((l) => ({ title: l.title.trim(), body: l.body.trim(), image_id: l.image_id })),
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

  const footer = (
    <>
      {invalid && (
        <Txt variant="caption" color={colors.danger}>
          {lessonsIncomplete ? s.newEvent.lessonIncomplete : s.newEvent.invalid}
        </Txt>
      )}
      <Button
        icon={editing ? 'checkmark' : direct ? 'megaphone-outline' : 'paper-plane-outline'}
        label={editing ? s.newEvent.save : direct ? s.newEvent.submitAdmin : s.newEvent.submit}
        disabled={busy || full}
        onPress={submit}
      />
    </>
  );

  return (
    <Screen
      back
      title={editing ? s.newEvent.editTitle : direct ? s.newEvent.titleAdmin : s.newEvent.title}
      footer={footer}
      scrollEnabled={!mapTouched}>
      <Card style={styles.intro}>
        <Txt>{editing ? s.newEvent.editIntro : direct ? s.newEvent.introAdmin : s.newEvent.intro}</Txt>
      </Card>
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
      <Txt variant="caption" color={colors.inkMuted}>
        {s.newEvent.type}
      </Txt>
      {EVENT_CLASSES.map((c) => {
        const types = meta.subtypes.filter((x) => x.event_class === c.id);
        if (types.length === 0) return null;
        return (
          <View key={c.id} style={styles.typeGroup}>
            <View style={styles.typeClass}>
              <Ionicons name={classIcon(c.id)} size={16} color={colors.inkMuted} />
              <Txt variant="caption" color={colors.inkMuted}>
                {className(c.id, lang)}
              </Txt>
            </View>
            <Row>
              {types.map((x) => (
                <Chip key={x.id} label={s.subtype[x.id] ?? x.id} selected={v.subtype === x.id} onPress={() => set('subtype', x.id)} />
              ))}
            </Row>
          </View>
        );
      })}
      <Txt variant="caption" color={colors.inkMuted}>
        {fmt(s.newEvent.typePoints, { points: count(points, s.units.point) })}
      </Txt>

      <SectionTitle>{s.newEvent.place}</SectionTitle>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.newEvent.locationType}
      </Txt>
      <Row>
        <Chip label={s.newEvent.inPerson} icon="location-outline" selected={v.location_type === 'in_person'} onPress={() => set('location_type', 'in_person')} />
        <Chip label={s.newEvent.online} icon="videocam-outline" selected={v.location_type === 'online'} onPress={() => set('location_type', 'online')} />
      </Row>
      {v.location_type === 'in_person' ? (
        <>
          <Field label={s.newEvent.address} placeholder={s.newEvent.addressPlaceholder} value={v.address_text} maxLength={ADDRESS_MAX} onChangeText={(t) => set('address_text', t)} />
          <Txt variant="caption" color={colors.inkMuted}>
            {s.newEvent.mapHint}
          </Txt>
          <LocationPicker value={startPin} onChange={onPlace} onTouching={setMapTouched} />
        </>
      ) : (
        <>
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
        </>
      )}

      <SectionTitle>{s.newEvent.time}</SectionTitle>
      <DateTimeField label={s.newEvent.starts} value={starts} minimumDate={today} onChange={setStart} />
      <DateTimeField label={s.newEvent.ends} value={ends} minimumDate={today} onChange={(d) => set('ends_at', d.toISOString())} />

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
              label={lesson.image ? s.newEvent.lessonBodyOptional : s.newEvent.lessonBody}
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
        <Button variant="secondary" icon="add" label={s.newEvent.addLesson} onPress={() => set('lessons', [...v.lessons, NEW_LESSON])} />
      )}

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeGroup: { gap: space.xs },
  typeClass: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  warning: { borderColor: colors.warning },
  term: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1 },
  remove: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
