import { Image } from 'expo-image';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, EmptyState, QueryState } from '@/components/ui';
import type { AttendanceItem } from '@/data/api';
import { useMyAttendance } from '@/data/queries';
import { count, date, fmt, num } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';

// The volunteer's record of hours: every event whose hours they confirmed,
// with the total, in a form they can share or (on the web) print, to show a
// school, a university or an employer. Only confirmed hours count, as for
// points; hours waiting for confirmation or disputed are left out.
export default function HoursRecordScreen() {
  const { s, now } = useApp();
  const me = useMe();
  const query = useMyAttendance();

  if (!query.data) {
    return (
      <Screen back title={s.hoursRecord.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const confirmed = query.data
    .filter((x) => x.attendance.participant_status === 'confirmed' && (x.attendance.hours ?? 0) > 0)
    .sort((a, b) => Date.parse(a.attendance.started_at) - Date.parse(b.attendance.started_at));
  const total = confirmed.reduce((sum, x) => sum + (x.attendance.hours ?? 0), 0);
  const events = new Set(confirmed.map((x) => x.event.id)).size;
  const first = confirmed[0]?.attendance.started_at;
  const last = confirmed[confirmed.length - 1]?.attendance.started_at;
  const place = (x: AttendanceItem) => (x.event.location_type === 'online' ? s.hoursRecord.online : (x.event.address_text ?? ''));

  const text = [
    `${s.hoursRecord.title}: ${me.full_name}`,
    s.association,
    fmt(s.hoursRecord.summary, { hours: count(total, s.units.hour), events: num(events) }),
    '',
    ...confirmed.map((x) => `• ${date(x.attendance.started_at, s)}: ${x.event.title} (${count(x.attendance.hours ?? 0, s.units.hour)})`),
    '',
    fmt(s.hoursRecord.preparedOn, { day: date(now, s) }),
  ].join('\n');

  const footer =
    confirmed.length > 0 ? (
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button icon="share-outline" label={s.hoursRecord.share} onPress={() => Share.share({ title: s.hoursRecord.title, message: text }).catch(() => {})} />
        </View>
        {Platform.OS === 'web' && (
          <View style={styles.flex}>
            <Button variant="secondary" icon="print-outline" label={s.hoursRecord.print} onPress={() => window.print()} />
          </View>
        )}
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
              {num(total)}
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

      {confirmed.length === 0 && <EmptyState icon="time-outline" text={s.hoursRecord.empty} />}

      {confirmed.map((x) => (
        <View key={x.attendance.id} style={styles.row}>
          <View style={styles.flex}>
            <Txt variant="bodyStrong" numberOfLines={2}>
              {x.event.title}
            </Txt>
            <Txt variant="caption" color={colors.inkMuted} numberOfLines={1}>
              {date(x.attendance.started_at, s)}
              {place(x) ? ` · ${place(x)}` : ''}
            </Txt>
            {x.recorded_by && (
              <Txt variant="caption" color={colors.inkMuted}>
                {fmt(s.hoursRecord.recordedBy, { name: x.recorded_by.full_name })}
              </Txt>
            )}
          </View>
          <Txt variant="bodyStrong" color={colors.primary} tabular>
            {count(x.attendance.hours ?? 0, s.units.hour)}
          </Txt>
        </View>
      ))}

      {confirmed.length > 0 && (
        <Txt variant="caption" align="center" color={colors.inkMuted}>
          {s.hoursRecord.onlyConfirmed} {fmt(s.hoursRecord.preparedOn, { day: date(now, s) })}
        </Txt>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  logo: { width: 56, height: 56 },
  metrics: { flexDirection: 'row', alignSelf: 'stretch', marginTop: space.sm },
  metric: { flex: 1, alignItems: 'center' },
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
