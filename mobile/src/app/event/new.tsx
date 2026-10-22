import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { type LatLng, LocationPicker } from '@/components/LocationPicker';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Field, QueryState, Row, SectionTitle } from '@/components/ui';
import type { EventFormMeta, EventProposal, ProposeEventResponse } from '@/data/api';
import type { GenderCategory } from '@/data/types';
import { useEventForm } from '@/data/queries';
import { count, fmt } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space, touch } from '@/theme/tokens';
import * as rules from '../../../../shared/rules';

// Proposing an event in the app (level 5, or a supervisor). An admin approves
// it before it is published; the server re-checks every rule.

const TRIPOLI: LatLng = { lat: 32.8872, lng: 13.1913 };
const HOUR = 3_600_000;

export default function NewEventScreen() {
  const { s } = useApp();
  const form = useEventForm();
  if (!form.data) {
    return (
      <Screen back title={s.newEvent.title}>
        <QueryState query={form} />
      </Screen>
    );
  }
  return <Form meta={form.data} />;
}

function initial(): Omit<EventProposal, 'capacity'> {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    title: '',
    description: '',
    subtype: 'street_cleanup',
    address_text: '',
    lat: TRIPOLI.lat,
    lng: TRIPOLI.lng,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3 * HOUR).toISOString(),
    gender_category: 'mixed',
    branch_ids: [],
    terms: [],
  };
}

function Form({ meta }: { meta: EventFormMeta }) {
  const { s, lang, now } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const [v, setV] = useState(initial);
  const [capacity, setCapacity] = useState('20');
  const [invalid, setInvalid] = useState(false);
  const [mapTouched, setMapTouched] = useState(false);
  const [done, setDone] = useState<ProposeEventResponse | null>(null);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const onPlace = useCallback((p: LatLng) => setV((prev) => ({ ...prev, lat: p.lat, lng: p.lng })), []);

  const direct = meta.publishes_directly;
  const full = !direct && meta.waiting >= meta.max_waiting;
  const starts = new Date(v.starts_at);
  const ends = new Date(v.ends_at);
  const seats = Number(capacity);
  const points = meta.subtypes.find((x) => x.id === v.subtype)?.base_points ?? 0;
  const chosen = meta.branches.filter((b) => v.branch_ids.includes(b.id));
  const categories: GenderCategory[] = ['mixed', me.gender];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const valid =
    v.title.trim().length >= 3 &&
    v.description.trim().length > 0 &&
    v.address_text.trim().length > 0 &&
    v.branch_ids.length > 0 &&
    starts.getTime() > now &&
    ends.getTime() > starts.getTime() &&
    Number.isInteger(seats) &&
    seats >= 1 &&
    v.terms.every((x) => x.trim().length > 0);

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
    const body: EventProposal = {
      ...v,
      title: v.title.trim(),
      description: v.description.trim(),
      address_text: v.address_text.trim(),
      capacity: seats,
      terms: v.terms.map((x) => x.trim()),
    };
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
          {s.newEvent.invalid}
        </Txt>
      )}
      <Button icon={direct ? 'megaphone-outline' : 'paper-plane-outline'} label={direct ? s.newEvent.submitAdmin : s.newEvent.submit} disabled={busy || full} onPress={submit} />
    </>
  );

  return (
    <Screen back title={direct ? s.newEvent.titleAdmin : s.newEvent.title} footer={footer} scrollEnabled={!mapTouched}>
      <Card style={styles.intro}>
        <Txt>{direct ? s.newEvent.introAdmin : s.newEvent.intro}</Txt>
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
      <Row>
        {meta.subtypes.map((x) => (
          <Chip key={x.id} label={s.subtype[x.id] ?? x.id} selected={v.subtype === x.id} onPress={() => set('subtype', x.id)} />
        ))}
      </Row>
      <Txt variant="caption" color={colors.inkMuted}>
        {fmt(s.newEvent.typePoints, { points: count(points, s.units.point) })}
      </Txt>

      <SectionTitle>{s.newEvent.branches}</SectionTitle>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.newEvent.branchesHint}
      </Txt>
      <Row>
        {meta.branches.map((b) => (
          <Chip
            key={b.id}
            label={lang === 'ar' ? b.name_ar : b.name_en}
            selected={v.branch_ids.includes(b.id)}
            onPress={() => set('branch_ids', v.branch_ids.includes(b.id) ? v.branch_ids.filter((x) => x !== b.id) : [...v.branch_ids, b.id])}
          />
        ))}
      </Row>
      {chosen.length > 0 && <PillarBar values={rules.pillarWeights(chosen.flatMap((b) => b.pillars))} height={14} />}

      <SectionTitle>{s.newEvent.place}</SectionTitle>
      <Field label={s.newEvent.address} placeholder={s.newEvent.addressPlaceholder} value={v.address_text} maxLength={200} onChangeText={(t) => set('address_text', t)} />
      <Txt variant="caption" color={colors.inkMuted}>
        {s.newEvent.mapHint}
      </Txt>
      <LocationPicker value={TRIPOLI} onChange={onPlace} onTouching={setMapTouched} />

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
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  warning: { borderColor: colors.warning },
  term: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1 },
  remove: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
