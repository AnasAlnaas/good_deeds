import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, QueryState, SectionTitle } from '@/components/ui';
import type { InstitutionMembersResponse } from '@/data/api';
import { useInstitutionMembers } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';

type Member = InstitutionMembersResponse['members'][number];

// An institution's representative: who asks to belong to it (confirm or
// decline), and who belongs (take someone off). Representatives themselves
// are the association's to change, in the admin panel.
export default function InstitutionMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, now } = useApp();
  const query = useInstitutionMembers(id);
  const { run, busy } = useAction();

  if (!query.data) {
    return (
      <Screen back title={s.institutions.membersTitle}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const { institution, members } = query.data;
  const requests = members.filter((m) => m.status === 'pending');
  const confirmed = members.filter((m) => m.status === 'confirmed');
  const remove = (m: Member) =>
    dialog.confirm({
      title: fmt(s.institutions.removeTitle, { name: m.user.full_name }),
      message: m.user.gender === 'female' ? s.institutions.removeBodyFemale : s.institutions.removeBody,
      cancel: s.cancel,
      action: s.institutions.remove,
      destructive: true,
      onConfirm: () => run((b) => b.removeMember(id, m.user.id)),
    });

  return (
    <Screen back title={s.institutions.membersTitle}>
      <Txt variant="bodyStrong">{institution.name}</Txt>

      <SectionTitle>{s.institutions.requestsTitle}</SectionTitle>
      {requests.length === 0 && <Txt color={colors.inkMuted}>{s.institutions.noRequests}</Txt>}
      {requests.map((m) => (
        <Card key={m.user.id}>
          <View style={styles.row}>
            <Avatar user={m.user} size={40} />
            <View style={styles.flex}>
              <Txt variant="bodyStrong">{m.user.full_name}</Txt>
              <Txt variant="caption" color={colors.inkMuted}>
                {day(m.created_at, s, now)}
              </Txt>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button icon="checkmark" label={s.institutions.confirm} disabled={busy} onPress={() => run((b) => b.confirmMember(id, m.user.id))} />
            </View>
            <View style={styles.flex}>
              <Button variant="secondary" icon="close" label={s.institutions.decline} disabled={busy} onPress={() => run((b) => b.removeMember(id, m.user.id))} />
            </View>
          </View>
        </Card>
      ))}

      <SectionTitle>{s.institutions.membersSection}</SectionTitle>
      {confirmed.length === 0 && <Txt color={colors.inkMuted}>{s.institutions.noMembers}</Txt>}
      {confirmed.map((m) => (
        <Card key={m.user.id}>
          <View style={styles.row}>
            <Avatar user={m.user} size={40} />
            <Txt variant="bodyStrong" style={styles.flex}>
              {m.user.full_name}
            </Txt>
            {m.role === 'representative' && <Badge label={s.institutions.representative} />}
          </View>
          {m.role === 'member' && <Button variant="quiet" icon="person-remove-outline" label={s.institutions.remove} disabled={busy} onPress={() => remove(m)} />}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
