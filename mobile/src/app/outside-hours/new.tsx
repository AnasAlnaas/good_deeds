import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Field, QueryState, SectionTitle } from '@/components/ui';
import type { LessonImageRef } from '@/data/api';
import type { OutsideHours } from '../../../../shared/types';
import { useInstitutions, useMyOutsideHours } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { pickLessonPicture } from '@/lib/photo';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';
import { ASSOCIATION_TIME_ZONE, OUTSIDE_HOURS_DAYS_BACK, OUTSIDE_HOURS_DESCRIPTION_MAX, OUTSIDE_HOURS_PLACE_MAX, dayIn } from '../../../../shared/rules';

const DAY_MS = 86_400_000;

// Owner's decisions (2026-11-19): a day within the last two weeks, up to 12
// hours, what was done, and (if they like) where and a photo. The rules are the
// server's (rules.assertCanClaimOutsideHours); the form only guides.
export default function NewOutsideHoursScreen() {
  const { s } = useApp();
  const institutions = useInstitutions();
  const past = useMyOutsideHours();
  if (!institutions.data || !past.data) {
    return (
      <Screen back title={s.outsideHours.newTitle}>
        <QueryState query={institutions.data ? past : institutions} />
      </Screen>
    );
  }
  // Filled in from their last request, if it was for one of their institutions: what, where and how long; never the day.
  const last = past.data[0]?.claim;
  const usable = institutions.data.mine.some((x) => x.status === 'confirmed' && x.institution.status === 'approved' && x.institution.id === last?.institution_id);
  return <ClaimForm institutions={institutions} last={usable ? last : undefined} />;
}

function ClaimForm({ institutions, last }: { institutions: ReturnType<typeof useInstitutions>; last?: OutsideHours }) {
  const { s, now, photoSource } = useApp();
  const { run, busy } = useAction();
  const prefilled = !!last;
  const [institutionId, setInstitutionId] = useState<string | null>(last?.institution_id ?? null);
  // Which day: today, unless filled in from the last request; then they pick it (owner's decision, 2026-11-22).
  const [back, setBack] = useState<number | null>(last ? null : 0);
  const [hours, setHours] = useState(last ? String(Math.floor(last.minutes / 60)) : '');
  const [minutes, setMinutes] = useState(last && last.minutes % 60 ? String(last.minutes % 60) : '');
  const [description, setDescription] = useState(last?.description ?? '');
  const [place, setPlace] = useState(last?.place ?? '');
  const [image, setImage] = useState<LessonImageRef | null>(null);
  const [photoState, setPhotoState] = useState<'idle' | 'sending' | 'too_big'>('idle');

  if (!institutions.data) {
    return (
      <Screen back title={s.outsideHours.newTitle}>
        <QueryState query={institutions} />
      </Screen>
    );
  }

  const mine = institutions.data.mine.filter((x) => x.status === 'confirmed' && x.institution.status === 'approved').map((x) => x.institution);
  const chosen = mine.find((i) => i.id === institutionId) ?? (mine.length === 1 ? mine[0] : undefined);
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const ready = !!chosen && back !== null && total > 0 && description.trim().length > 0 && photoState !== 'sending';

  const choosePhoto = async () => {
    setPhotoState('idle');
    const picked = await pickLessonPicture();
    if (!picked) return;
    if (picked === 'too_big') return setPhotoState('too_big');
    setPhotoState('sending');
    const result = await run((b) => b.uploadLessonImage(picked));
    setPhotoState('idle');
    if (result) setImage(result.value.image);
  };

  const send = async () => {
    if (!chosen || back === null) return;
    const result = await run((b) =>
      b.claimOutsideHours({
        institution_id: chosen.id,
        done_on: dayIn(now - back * DAY_MS, ASSOCIATION_TIME_ZONE),
        minutes: total,
        description,
        place: place.trim() || null,
        image_id: image?.id ?? null,
      }),
    );
    if (!result) return;
    dialog.notify(s.outsideHours.sentTitle, fmt(s.outsideHours.sent, { name: chosen.name }));
    router.replace('/outside-hours');
  };

  return (
    <Screen
      back
      title={s.outsideHours.newTitle}
      footer={<Button icon="paper-plane-outline" label={s.outsideHours.send} disabled={!ready || busy} onPress={send} />}>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.outsideHours.rules}
      </Txt>
      {prefilled && (
        <Txt variant="caption" color={colors.primary}>
          {s.outsideHours.prefilled}
        </Txt>
      )}

      {mine.length > 1 && (
        <>
          <SectionTitle>{s.outsideHours.institution}</SectionTitle>
          <View style={styles.chips}>
            {mine.map((i) => (
              <Chip key={i.id} label={i.name} selected={chosen?.id === i.id} onPress={() => setInstitutionId(i.id)} />
            ))}
          </View>
        </>
      )}
      {mine.length === 1 && (
        <Txt variant="bodyStrong" color={colors.primary}>
          {fmt(s.outsideHours.forInstitution, { name: mine[0].name })}
        </Txt>
      )}

      <SectionTitle>{s.outsideHours.day}</SectionTitle>
      <View style={styles.chips}>
        {Array.from({ length: OUTSIDE_HOURS_DAYS_BACK + 1 }, (_, k) => (
          <Chip key={k} label={day(now - k * DAY_MS, s, now)} selected={back === k} onPress={() => setBack(k)} />
        ))}
      </View>

      <SectionTitle>{s.outsideHours.duration}</SectionTitle>
      <View style={styles.duration}>
        <View style={styles.flex}>
          <Field label={s.outsideHours.hoursLabel} value={hours} onChangeText={(x) => setHours(x.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" ltr />
        </View>
        <View style={styles.flex}>
          <Field label={s.outsideHours.minutesLabel} value={minutes} onChangeText={(x) => setMinutes(x.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" ltr />
        </View>
      </View>

      <Field
        label={s.outsideHours.description}
        placeholder={s.outsideHours.descriptionHint}
        value={description}
        onChangeText={setDescription}
        maxLength={OUTSIDE_HOURS_DESCRIPTION_MAX}
        multiline
      />
      <Field label={s.outsideHours.place} value={place} onChangeText={setPlace} maxLength={OUTSIDE_HOURS_PLACE_MAX} />

      <SectionTitle>{s.outsideHours.photo}</SectionTitle>
      <Card>
        {image && <Image source={photoSource(image.url)} style={[styles.photo, { aspectRatio: image.width / image.height }]} contentFit="cover" />}
        {photoState === 'sending' && <Txt color={colors.inkMuted}>{s.outsideHours.sendingPhoto}</Txt>}
        {photoState === 'too_big' && <Txt color={colors.danger}>{s.outsideHours.photoTooBig}</Txt>}
        <Button
          variant="secondary"
          icon="image-outline"
          label={image ? s.outsideHours.changePhoto : s.outsideHours.addPhoto}
          disabled={busy || photoState === 'sending'}
          onPress={choosePhoto}
        />
        {image && <Button variant="quiet" icon="trash-outline" label={s.outsideHours.removePhoto} onPress={() => setImage(null)} />}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  duration: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  photo: { width: '100%', borderRadius: radius.input },
});
