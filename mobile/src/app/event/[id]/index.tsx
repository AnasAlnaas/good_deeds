import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, InfoRow, Row, SectionTitle } from '@/components/ui';
import { PILLARS } from '@/data/types';
import * as server from '@/demo/server';
import { dayTimeRange, fmt } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, pillarColor, space } from '@/theme/tokens';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, s, lang, now } = useApp();
  const me = useMe();
  const act = useAction();
  const event = db.events.find((e) => e.id === id);
  if (!event) {
    return (
      <Screen back>
        <EmptyState icon="alert-circle-outline" text={s.errors.not_found} />
      </Screen>
    );
  }

  const status = server.effectiveStatus(event, now);
  const participants = server.joinedUsers(db, event.id);
  const full = participants.length >= event.capacity;
  const reg = server.registrationOf(db, event.id, me.id);
  const attendance = server.attendanceOf(db, event.id, me.id);
  const organizer = server.isOrganizer(db, event.id, me.id);
  const forMe = server.canUserJoinCategory(me, event);
  const open = status === 'published' || status === 'running';
  const branches = server.eventBranches(db, event.id);

  const join = () => {
    if (act((d, t) => server.startJoin(d, me.id, event.id, t))) router.push(`/event/${event.id}/terms`);
  };
  const cancel = () =>
    Alert.alert(s.event.cancelJoinTitle, s.event.cancelJoinBody, [
      { text: s.cancel, style: 'cancel' },
      { text: s.event.cancelJoin, style: 'destructive', onPress: () => act((d) => server.cancelJoin(d, me.id, event.id)) },
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
        {open && !attendance && <Button variant="danger" label={s.event.cancelJoin} onPress={cancel} />}
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
          value={full ? s.event.full : fmt(s.event.seats, { joined: participants.length, capacity: event.capacity })}
        />
      </Card>

      <SectionTitle>{s.event.pillars}</SectionTitle>
      <PillarBar values={server.eventPillarWeights(db, event.id)} height={14} />

      <SectionTitle>{s.event.branches}</SectionTitle>
      {branches.map((b) => (
        <View key={b.id} style={styles.branch}>
          <Txt style={styles.flex}>{lang === 'ar' ? b.name_ar : b.name_en}</Txt>
          {PILLARS.filter((p) => db.branch_pillars.some((bp) => bp.branch_id === b.id && bp.pillar === p)).map((p) => (
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
