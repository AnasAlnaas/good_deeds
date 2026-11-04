import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, QueryState, SectionTitle } from '@/components/ui';
import type { PublicUser } from '@/data/api';
import { useEvent } from '@/data/queries';
import { fmt } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';
import { MAX_EVENT_SUPERVISORS } from '../../../../../shared/rules';

// A supervisor of the event (or an admin) makes one or two of the people who
// joined it supervisors too, so nobody runs an event alone. Those added here
// can be taken off here, or step down; the one it was made with stays (an admin
// changes that in the panel). The server decides (rules.assertCanAddSupervisor).
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const query = useEvent(id);

  if (!query.data) {
    return (
      <Screen back title={s.team.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const event = query.data;
  const supervisors = event.supervisors;
  const open = event.status === 'published' || event.status === 'running';
  const full = supervisors.length >= MAX_EVENT_SUPERVISORS;
  const candidates = event.participants.filter((u) => !supervisors.some((x) => x.id === u.id));
  const female = (u: PublicUser) => u.gender === 'female';

  const make = (u: PublicUser) =>
    dialog.confirm({
      title: s.team.makeTitle,
      message: fmt(female(u) ? s.team.makeBodyFemale : s.team.makeBody, { name: u.full_name }),
      cancel: s.cancel,
      action: female(u) ? s.team.makeFemale : s.team.make,
      onConfirm: () => run((b) => b.addSupervisor(id, u.id)),
    });
  const remove = (u: PublicUser) => {
    const self = u.id === me.id;
    dialog.confirm({
      title: self ? s.team.stepDownTitle : s.team.removeTitle,
      message: self ? s.team.stepDownBody : fmt(female(u) ? s.team.removeBodyFemale : s.team.removeBody, { name: u.full_name }),
      cancel: s.cancel,
      action: self ? s.team.stepDown : s.team.remove,
      destructive: true,
      onConfirm: () => run((b) => b.removeSupervisor(id, u.id)),
    });
  };

  return (
    <Screen back title={s.team.title}>
      <Txt variant="bodyStrong">{event.title}</Txt>
      <Txt color={colors.inkMuted}>{open ? s.team.intro : s.team.closed}</Txt>

      <SectionTitle>{s.team.current}</SectionTitle>
      {supervisors.map((u) => (
        <Card key={u.id}>
          <View style={styles.row}>
            <Avatar user={u} size={40} />
            <View style={styles.flex}>
              <Txt variant="bodyStrong">{u.full_name}</Txt>
              <Txt variant="caption" color={colors.inkMuted}>
                {u.id === me.id ? s.team.you : !u.added_in_app ? s.team.original : female(u) ? s.team.coSupervisorFemale : s.team.coSupervisor}
              </Txt>
            </View>
          </View>
          {open && u.added_in_app && supervisors.length > 1 && (
            <Button variant="quiet" label={u.id === me.id ? s.team.stepDown : s.team.remove} disabled={busy} onPress={() => remove(u)} />
          )}
        </Card>
      ))}

      {open && (
        <>
          <SectionTitle>{s.team.candidates}</SectionTitle>
          {full && <Txt color={colors.inkMuted}>{fmt(s.team.full, { max: MAX_EVENT_SUPERVISORS })}</Txt>}
          {candidates.length === 0 && <Txt color={colors.inkMuted}>{s.team.noCandidates}</Txt>}
          {candidates.map((u) => (
            <Card key={u.id}>
              <View style={styles.row}>
                <Avatar user={u} size={40} />
                <Txt variant="bodyStrong" style={styles.flex}>
                  {u.full_name}
                </Txt>
              </View>
              {!full && (
                <Button variant="secondary" icon="shield-checkmark-outline" label={female(u) ? s.team.makeFemale : s.team.make} disabled={busy} onPress={() => make(u)} />
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
