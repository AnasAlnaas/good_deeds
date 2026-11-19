import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, EmptyState, QueryState } from '@/components/ui';
import { useInstitutions, useMyAttendance, useMyOutsideHours } from '@/data/queries';
import { count, date, fmt, num } from '@/i18n/format';
import { shareCertificate } from '@/lib/certificate';
import * as dialog from '@/lib/dialog';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';

/** One line of the record: an event's confirmed hours, or approved hours outside the app's events. */
interface Entry {
  key: string;
  at: string;
  title: string;
  details: string[];
  organiser: string;
  hours: number;
  eventId: string | null;
  institutionId: string | null;
}

// The volunteer's record of hours: every event whose hours they confirmed, and
// the hours outside the app's events their institution approved, with the
// total, to share or to send as a PDF certificate (owner's decisions,
// 2026-11-19) for a school, a university or an employer. Only confirmed hours
// count, as for points; hours waiting or disputed are left out.
export default function HoursRecordScreen() {
  const { s, now, isRTL } = useApp();
  const me = useMe();
  const query = useMyAttendance();
  const outside = useMyOutsideHours();
  const institutions = useInstitutions();
  const { run } = useAction();
  // The certificate covers all hours, or one institution's (null = all).
  const [scope, setScope] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  if (!query.data || !outside.data) {
    return (
      <Screen back title={s.hoursRecord.title}>
        <QueryState query={query.data ? outside : query} />
      </Screen>
    );
  }

  const all: Entry[] = [
    ...query.data
      .filter((x) => x.attendance.participant_status === 'confirmed' && (x.attendance.hours ?? 0) > 0)
      .map((x) => ({
        key: x.attendance.id,
        at: x.attendance.started_at,
        title: x.event.title,
        details: [
          x.event.location_type === 'online' ? s.hoursRecord.online : (x.event.address_text ?? ''),
          x.recorded_by ? fmt(s.hoursRecord.recordedBy, { name: x.recorded_by.full_name }) : '',
        ].filter(Boolean),
        // The institution that organised it, when not the association: a school or employer may ask.
        organiser: x.event.institution ? fmt(s.institutions.organizedBy, { name: x.event.institution.name }) : '',
        hours: x.attendance.hours ?? 0,
        eventId: x.event.id,
        institutionId: x.event.institution?.id ?? null,
      })),
    ...outside.data
      .filter((x) => x.claim.status === 'approved')
      .map((x) => ({
        key: x.claim.id,
        at: `${x.claim.done_on}T12:00:00`,
        title: x.claim.description,
        details: [x.claim.place ?? '', s.outsideHours.title].filter(Boolean),
        organiser: fmt(s.outsideHours.forInstitution, { name: x.institution.name }),
        hours: x.claim.minutes / 60,
        eventId: null,
        institutionId: x.institution.id,
      })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // The institutions a certificate may cover: those the person belongs to and has hours for.
  const mine = (institutions.data?.mine ?? []).filter((x) => x.status === 'confirmed' && all.some((e) => e.institutionId === x.institution.id));
  const chosen = mine.some((x) => x.institution.id === scope) ? scope : null;
  const entries = chosen ? all.filter((e) => e.institutionId === chosen) : all;
  // Hours recorded but not confirmed yet are left out; the person is told, and taken where they confirm them.
  const waiting = query.data.some((x) => x.attendance.ended_at && x.attendance.participant_status === 'pending');
  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  const events = new Set(entries.flatMap((e) => (e.eventId ? [e.eventId] : []))).size;
  const first = entries[0]?.at;
  const last = entries[entries.length - 1]?.at;

  const text = [
    `${s.hoursRecord.title}: ${me.full_name}`,
    s.association,
    fmt(s.hoursRecord.summary, { hours: count(total, s.units.hour), events: num(events) }),
    '',
    ...entries.map((e) => `• ${date(e.at, s)}: ${e.title}${e.organiser ? ` · ${e.organiser}` : ''} (${count(e.hours, s.units.hour)})`),
    '',
    fmt(s.hoursRecord.preparedOn, { day: date(now, s) }),
  ].join('\n');

  const makeCertificate = async () => {
    setMaking(true);
    try {
      const made = await run((b) => b.makeCertificate({ institution_id: chosen }));
      if (!made) return;
      await shareCertificate({
        made: made.value,
        name: me.full_name,
        entries: entries.map((e) => ({ day: date(e.at, s), title: e.title, hours: e.hours })),
        s,
        rtl: isRTL,
      });
    } catch {
      dialog.notify(s.errorTitle, s.errors.network);
    } finally {
      setMaking(false);
    }
  };

  const footer =
    entries.length > 0 ? (
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button icon="document-outline" label={making ? s.certificate.making : s.certificate.make} disabled={making} onPress={makeCertificate} />
        </View>
        <View style={styles.flex}>
          <Button
            variant="secondary"
            icon="share-outline"
            label={s.hoursRecord.share}
            onPress={() => Share.share({ title: s.hoursRecord.title, message: text }).catch(() => {})}
          />
        </View>
      </View>
    ) : undefined;

  return (
    <Screen back title={s.hoursRecord.title} footer={footer}>
      <Card style={styles.head}>
        <Image source={require('../../assets/brand/islah-tarbawi.png')} style={styles.logo} contentFit="contain" accessibilityLabel={s.association} />
        <Txt variant="caption" align="center" color={colors.inkMuted}>
          {s.association}
        </Txt>
        <Txt variant="sectionTitle" align="center">
          {me.full_name}
        </Txt>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Txt variant="hero" color={colors.primary} tabular align="center">
              {num(Math.round(total * 100) / 100)}
            </Txt>
            <Txt variant="caption" color={colors.inkMuted} align="center">
              {s.hoursRecord.hours}
            </Txt>
          </View>
          <View style={styles.metric}>
            <Txt variant="hero" color={colors.primary} tabular align="center">
              {num(events)}
            </Txt>
            <Txt variant="caption" color={colors.inkMuted} align="center">
              {s.hoursRecord.events}
            </Txt>
          </View>
        </View>
        {first && last && (
          <Txt variant="caption" align="center" color={colors.inkMuted}>
            {fmt(s.hoursRecord.period, { from: date(first, s), to: date(last, s) })}
          </Txt>
        )}
      </Card>

      {mine.length > 0 && (
        <>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.certificate.scope}
          </Txt>
          <View style={styles.chips}>
            <Chip label={s.certificate.all} selected={!chosen} onPress={() => setScope(null)} />
            {mine.map((x) => (
              <Chip key={x.institution.id} label={x.institution.name} selected={chosen === x.institution.id} onPress={() => setScope(x.institution.id)} />
            ))}
          </View>
        </>
      )}

      {waiting && (
        <Card style={styles.waiting}>
          <Txt>{s.next.hoursWaiting}</Txt>
          <Button icon="checkmark-circle-outline" label={s.next.confirmHours} onPress={() => router.push('/activity')} />
        </Card>
      )}

      {entries.length === 0 && (
        <EmptyState
          icon="time-outline"
          text={s.hoursRecord.empty}
          action={waiting ? null : { label: s.next.findEvent, icon: 'search-outline', onPress: () => router.push('/events') }}
        />
      )}

      {entries.map((e) => (
        <View key={e.key} style={styles.row}>
          <View style={styles.flex}>
            <Txt variant="bodyStrong" numberOfLines={2}>
              {e.title}
            </Txt>
            <Txt variant="caption" color={colors.inkMuted} numberOfLines={1}>
              {[date(e.at, s), ...e.details.slice(0, 1)].join(' · ')}
            </Txt>
            {!!e.organiser && (
              <Txt variant="caption" color={colors.primary} numberOfLines={1}>
                {e.organiser}
              </Txt>
            )}
            {e.details[1] && (
              <Txt variant="caption" color={colors.inkMuted}>
                {e.details[1]}
              </Txt>
            )}
          </View>
          <Txt variant="bodyStrong" color={colors.primary} tabular>
            {count(e.hours, s.units.hour)}
          </Txt>
        </View>
      ))}

      {entries.length > 0 && (
        <Txt variant="caption" align="center" color={colors.inkMuted}>
          {s.hoursRecord.onlyConfirmed} {fmt(s.hoursRecord.preparedOn, { day: date(now, s) })}
        </Txt>
      )}

      <Button variant="quiet" icon="add-circle-outline" label={s.outsideHours.open} onPress={() => router.push('/outside-hours')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  waiting: { borderColor: colors.accent, borderWidth: 3 },
  logo: { width: 56, height: 56 },
  metrics: { flexDirection: 'row', alignSelf: 'stretch', marginTop: space.sm },
  metric: { flex: 1, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
