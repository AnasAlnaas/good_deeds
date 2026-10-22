import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Field, QueryState, Row, SectionTitle } from '@/components/ui';
import type { ReportBody, ReportFormMeta } from '@/data/api';
import { useReportForm } from '@/data/queries';
import type { ReportCategory } from '@/data/types';
import { day, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';
import { REPORT_NOTE_MAX } from '../../../../shared/rules';

// A member tells the association about something (بلاغ): by category, about an
// event they were at or none, naming someone who was there or no one. Only
// admins read it, and the person named is never told. The server re-checks every rule.
export default function NewReportScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const { s } = useApp();
  const form = useReportForm();
  if (!form.data) {
    return (
      <Screen back title={s.report.title}>
        <QueryState query={form} />
      </Screen>
    );
  }
  return <Form meta={form.data} eventId={eventId} />;
}

function Form({ meta, eventId }: { meta: ReportFormMeta; eventId?: string }) {
  const { s, now } = useApp();
  const { run, busy } = useAction();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  // Opened from an event page: that event is already chosen.
  const [event, setEvent] = useState(() => meta.events.find((x) => x.event.id === eventId)?.event.id ?? null);
  const [subject, setSubject] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const full = meta.open >= meta.max_open;
  const noteNeeded = category === 'other';
  const people = meta.events.find((x) => x.event.id === event)?.people ?? [];
  const ready = !!category && !full && (!noteNeeded || note.trim().length > 0);

  const chooseEvent = (id: string | null) => {
    setEvent(id);
    setSubject(null);
  };

  const submit = async () => {
    if (!category) return;
    const body: ReportBody = { category };
    if (event) body.event_id = event;
    if (event && subject) body.subject_id = subject;
    if (note.trim()) body.note = note.trim();
    if (await run((b) => b.report(body))) setDone(true);
  };

  if (done) {
    return (
      <Screen scroll={false}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Txt variant="screenTitle" align="center">
            {s.report.doneTitle}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {s.report.doneBody}
          </Txt>
          <Button label={s.report.showMine} onPress={() => router.replace('/reports')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen back title={s.report.title} footer={<Button icon="flag-outline" label={s.report.submit} disabled={busy || !ready} onPress={submit} />}>
      <Card style={styles.intro}>
        <Txt>{s.report.intro}</Txt>
      </Card>
      {full && (
        <Card style={styles.warning}>
          <Txt color={colors.warning}>{fmt(s.report.full, { n: meta.open })}</Txt>
        </Card>
      )}

      <SectionTitle>{s.report.what}</SectionTitle>
      <Row>
        {meta.categories.map((c) => (
          <Chip key={c} label={s.reportCategory[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </Row>

      {meta.events.length > 0 && (
        <>
          <SectionTitle>{s.report.event}</SectionTitle>
          <Row>
            <Chip label={s.report.noEvent} selected={event === null} onPress={() => chooseEvent(null)} />
            {meta.events.map(({ event: e }) => (
              <Chip key={e.id} label={`${e.title} · ${day(e.starts_at, s, now)}`} selected={event === e.id} onPress={() => chooseEvent(e.id)} />
            ))}
          </Row>
        </>
      )}

      {people.length > 0 && (
        <>
          <SectionTitle>{s.report.person}</SectionTitle>
          <Row>
            <Chip label={s.report.noPerson} selected={subject === null} onPress={() => setSubject(null)} />
            {people.map(({ user: u, supervisor }) => (
              <Chip
                key={u.id}
                label={supervisor ? fmt(u.gender === 'female' ? s.report.supervisorFemale : s.report.supervisor, { name: u.full_name }) : u.full_name}
                selected={subject === u.id}
                onPress={() => setSubject(u.id)}
              />
            ))}
          </Row>
        </>
      )}

      <Field
        label={noteNeeded ? s.report.note : s.report.noteOptional}
        placeholder={s.report.notePlaceholder}
        value={note}
        maxLength={REPORT_NOTE_MAX}
        multiline
        onChangeText={setNote}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  warning: { borderColor: colors.warning },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
