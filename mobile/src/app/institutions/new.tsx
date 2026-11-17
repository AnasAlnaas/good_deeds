import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, Field, QueryState, Row, SectionTitle } from '@/components/ui';
import { INSTITUTION_KINDS, type InstitutionKind } from '@/data/types';
import { useInstitutions } from '@/data/queries';
import { fmt } from '@/i18n/format';
import { institutionIcon } from '@/lib/institutions';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';
import { cleanInstitutionName, INSTITUTION_NAME_MAX, INSTITUTION_NAME_MIN } from '../../../../shared/rules';

// Asking for a new institution. An admin of the association approves it; the
// person who asked is its first representative (owner's decisions, 2026-11-17).
// `name`: what was searched for on the join screen.
export default function NewInstitutionScreen() {
  const { s } = useApp();
  const params = useLocalSearchParams<{ name?: string }>();
  const query = useInstitutions();
  const { run, busy } = useAction();
  const [name, setName] = useState(params.name ?? '');
  const [kind, setKind] = useState<InstitutionKind | null>(null);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen scroll={false}>
        <View style={styles.done}>
          <Ionicons name="hourglass-outline" size={72} color={colors.primary} />
          <Txt variant="screenTitle" align="center">
            {s.institutions.sentTitle}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {s.institutions.sentBody}
          </Txt>
          <Button label={s.institutions.title} onPress={() => router.dismissTo('/institutions')} />
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    return (
      <Screen back title={s.institutions.addTitle}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const full = query.data.waiting_requests >= query.data.max_waiting_requests;
  const cleaned = cleanInstitutionName(name);
  const send = async () => {
    setChecked(true);
    if (!cleaned || !kind) return;
    if (await run((b) => b.requestInstitution({ name: cleaned, kind }))) setDone(true);
  };

  return (
    <Screen
      back
      title={s.institutions.addTitle}
      footer={<Button icon="paper-plane-outline" label={s.institutions.send} disabled={busy || full || !name.trim() || !kind} onPress={send} />}>
      <Card style={styles.intro}>
        <Txt>{s.institutions.addIntro}</Txt>
      </Card>
      {full && (
        <Card style={styles.warning}>
          <Txt color={colors.warning}>{fmt(s.institutions.addFull, { n: query.data.waiting_requests })}</Txt>
          <Button variant="quiet" icon="list-outline" label={s.institutions.title} onPress={() => router.dismissTo('/institutions')} />
        </Card>
      )}
      <Field
        label={s.institutions.name}
        placeholder={s.institutions.namePlaceholder}
        value={name}
        maxLength={INSTITUTION_NAME_MAX}
        onChangeText={setName}
        error={checked && !cleaned ? fmt(s.institutions.nameInvalid, { min: INSTITUTION_NAME_MIN, max: INSTITUTION_NAME_MAX }) : null}
      />
      <SectionTitle>{s.institutions.kind}</SectionTitle>
      <Row>
        {INSTITUTION_KINDS.map((k) => (
          <Chip key={k} label={s.institutions.kinds[k]} icon={institutionIcon(k)} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  warning: { borderColor: colors.warning },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
});
