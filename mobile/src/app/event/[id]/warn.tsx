import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, EmptyState, Field, QueryState } from '@/components/ui';
import { useRoster } from '@/data/queries';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';
import { REASON_MAX } from '../../../../../shared/rules';

// A supervisor records a warning (إنذار) for someone who joined this event, with
// a reason. It is recorded only: no points are taken and nothing is blocked.
// The member is told and may appeal; only they and the admins see it.
export default function WarnScreen() {
  const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  const { s } = useApp();
  const { run, busy } = useAction();
  const query = useRoster(id);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);

  const entry = query.data?.participants.find((p) => p.user.id === userId);

  if (done) {
    return (
      <Screen scroll={false}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Txt variant="screenTitle" align="center">
            {s.warn.done}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {entry?.user.full_name ?? ''}
          </Txt>
          <Button variant="secondary" label={s.warn.backToRoster} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen back title={s.warn.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  if (!entry) {
    return (
      <Screen back title={s.warn.title}>
        <EmptyState icon="alert-circle-outline" text={s.errors.not_joined} />
      </Screen>
    );
  }

  const { user } = entry;
  const submit = async () => {
    if (await run((b) => b.warn(id, userId, reason.trim()))) setDone(true);
  };

  return (
    <Screen
      back
      title={s.warn.title}
      footer={<Button variant="danger" icon="alert-circle-outline" label={s.warn.submit} disabled={busy || !reason.trim()} onPress={submit} />}>
      <Card style={styles.person}>
        <Avatar user={user} size={56} />
        <View style={styles.flex}>
          <Txt variant="sectionTitle">{user.full_name}</Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {query.data.event.title}
          </Txt>
        </View>
      </Card>
      <Txt color={colors.inkMuted}>{user.gender === 'female' ? s.warn.infoFemale : s.warn.info}</Txt>
      <Field label={s.warn.reason} placeholder={s.warn.reasonPlaceholder} value={reason} maxLength={REASON_MAX} multiline onChangeText={setReason} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
