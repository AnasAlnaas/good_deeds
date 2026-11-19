import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, EmptyState, QueryState } from '@/components/ui';
import { useInstitutionHoursReport } from '@/data/queries';
import { count, date, fmt, num } from '@/i18n/format';
import { shareCsv } from '@/lib/shareFile';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import { ASSOCIATION_TIME_ZONE, dayIn } from '../../../../../shared/rules';

type Range = 'month' | 'year';

// An institution's representative: its members' confirmed hours (owner's
// decisions, 2026-11-19), at its events and outside them, as a CSV to keep.
export default function InstitutionReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, now } = useApp();
  const [range, setRange] = useState<Range>('month');
  const to = dayIn(now, ASSOCIATION_TIME_ZONE);
  const from = range === 'month' ? dayIn(now - 30 * 86_400_000, ASSOCIATION_TIME_ZONE) : `${to.slice(0, 4)}-01-01`;
  const query = useInstitutionHoursReport(id, from, to);
  const shown = (d: string) => date(`${d}T12:00:00`, s);

  const chips = (
    <View style={styles.chips}>
      <Chip label={s.institutionReport.lastMonth} selected={range === 'month'} onPress={() => setRange('month')} />
      <Chip label={s.institutionReport.thisYear} selected={range === 'year'} onPress={() => setRange('year')} />
    </View>
  );

  if (!query.data) {
    return (
      <Screen back title={s.institutionReport.title}>
        {chips}
        <QueryState query={query} />
      </Screen>
    );
  }

  const report = query.data;
  const rows = report.rows.filter((r) => r.hours > 0);
  const download = () =>
    shareCsv(`${s.institutionReport.title}-${report.institution.name}-${from}-${to}`, [
      [fmt(s.institutionReport.header, { name: report.institution.name, from: shown(from), to: shown(to) })],
      [s.institutionReport.name, s.institutionReport.events, s.institutionReport.eventHours, s.institutionReport.outsideHours, s.institutionReport.total],
      ...rows.map((r) => [r.user.full_name, r.events, r.event_hours, r.outside_hours, r.hours]),
    ]).catch(() => {});

  return (
    <Screen
      back
      title={s.institutionReport.title}
      footer={rows.length > 0 ? <Button icon="download-outline" label={s.institutionReport.share} onPress={download} /> : undefined}>
      <Txt variant="bodyStrong">{report.institution.name}</Txt>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.institutionReport.intro}
      </Txt>
      {chips}
      <Txt variant="caption" color={colors.inkMuted}>
        {fmt(s.hoursRecord.period, { from: shown(from), to: shown(to) })}
      </Txt>
      {rows.length === 0 && <EmptyState icon="time-outline" text={s.institutionReport.empty} />}
      {rows.map((r) => (
        <Card key={r.user.id}>
          <View style={styles.row}>
            <Avatar user={r.user} size={36} />
            <Txt variant="bodyStrong" style={styles.flex}>
              {r.user.full_name}
            </Txt>
            <Txt variant="bodyStrong" color={colors.primary} tabular>
              {count(r.hours, s.units.hour)}
            </Txt>
          </View>
          <Txt variant="caption" color={colors.inkMuted}>
            {`${s.institutionReport.eventHours}: ${num(r.event_hours)} (${num(r.events)} ${s.institutionReport.events}) · ${s.institutionReport.outsideHours}: ${num(r.outside_hours)}`}
          </Txt>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
