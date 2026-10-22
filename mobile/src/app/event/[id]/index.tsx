import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState, Row, SectionTitle } from '@/components/ui';
import { useEvent } from '@/data/queries';
import { dayTimeRange, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, pillarColor, space } from '@/theme/tokens';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, lang, now } = useApp();
  const { run, busy } = useAction();
  const query = useEvent(id);
  if (!query.data) {
    return (
      <Screen back>
        <QueryState query={query} />
      </Screen>
    );
  }

  const event = query.data;
  const status = event.status;
  const participants = event.participants;
  const full = event.joined_count >= event.capacity;
  const reg = event.my_registration;
  const attendance = event.my_attendance;
  const organizer = event.i_organize;
  const forMe = event.can_join_category;
  const open = status === 'published' || status === 'running';

  const join = async () => {
    if (await run((b) => b.startJoin(event.id))) router.push(`/event/${event.id}/terms`);
  };
  const cancel = () =>
    Alert.alert(s.event.cancelJoinTitle, s.event.cancelJoinBody, [
      { text: s.cancel, style: 'cancel' },
      { text: s.event.cancelJoin, style: 'destructive', onPress: () => run((b) => b.cancelJoin(event.id)) },
    ]);

  let footer;
  if (organizer) {
    footer = (
      <>
        <Txt variant="caption" color={colors.inkMuted} align="center">
          {s.event.supervisor}
        </Txt>
        <Button icon="clipboard-outline" label={s.event.roster} onPress={() => router.push(`/event/${event.id}/roster`)} />
      </>
    );
  } else if (reg?.status === 'joined') {
    footer = (
      <>
        <Badge label={s.event.joined} color={colors.success} icon="checkmark-circle" />
        {open && !attendance && <Button variant="danger" label={s.event.cancelJoin} disabled={busy} onPress={cancel} />}
      </>
    );
  } else if (!open) {
    footer = <Txt color={colors.inkMuted} align="center">{s.event.finished}</Txt>;
  } else if (!forMe) {
    footer = (
      <Txt color={colors.inkMuted} align="center">
        {fmt(s.event.notForYou, { category: s.category[event.gender_category] })}
      </Txt>
    );
  } else if (full) {
    footer = <Button disabled label={s.event.full} />;
  } else {
    footer = (
      <Button
        icon="hand-left-outline"
        label={reg?.status === 'pending_terms' ? s.event.continueTerms : s.event.join}
        disabled={busy}
        onPress={join}
      />
    );
  }

  return (
    <Screen back footer={footer}>
      <Row>
        <Badge
          label={s.status[status]}
          color={status === 'running' ? colors.danger : colors.primary}
          icon={status === 'running' ? 'radio-button-on' : undefined}
        />
        <Badge label={s.category[event.gender_category]} color={colors.inkMuted} />
      </Row>
      <Txt variant="screenTitle">{event.title}</Txt>
      <Txt>{event.description}</Txt>

      <Card>
        <InfoRow icon="time-outline" label={s.event.when} value={dayTimeRange(event.starts_at, event.ends_at, s, now)} />
        <InfoRow icon="location-outline" label={s.event.where} value={event.address_text} />
        <InfoRow
          icon="people-outline"
          label={s.event.participants}
          value={full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
        />
      </Card>

      <SectionTitle>{s.event.pillars}</SectionTitle>
      <PillarBar values={event.pillar_weights} height={14} />

      <SectionTitle>{s.event.branches}</SectionTitle>
      {event.branches.map((b) => (
        <View key={b.id} style={styles.branch}>
          <Txt style={styles.flex}>{lang === 'ar' ? b.name_ar : b.name_en}</Txt>
          {b.pillars.map((p) => (
            <Badge key={p} label={s.pillar[p]} color={pillarColor[p]} />
          ))}
        </View>
      ))}

      <SectionTitle>{s.event.participants}</SectionTitle>
      {participants.length === 0 ? (
        <Txt color={colors.inkMuted}>{s.event.noParticipants}</Txt>
      ) : (
        <Txt color={colors.inkMuted}>{participants.map((u) => u.full_name).join(lang === 'ar' ? '، ' : ', ')}</Txt>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  branch: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
