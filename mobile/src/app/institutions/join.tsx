import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, Field, QueryState } from '@/components/ui';
import { useInstitutions } from '@/data/queries';
import { institutionIcon } from '@/lib/institutions';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';
import { sameInstitutionName } from '../../../../shared/rules';

// Choosing an institution to belong to, among the approved ones. A
// representative confirms it. One not listed can be asked for (new.tsx).
export default function JoinInstitutionScreen() {
  const { s } = useApp();
  const query = useInstitutions();
  const { run, busy } = useAction();
  const [text, setText] = useState('');

  if (!query.data) {
    return (
      <Screen back title={s.institutions.joinTitle}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const words = text.trim();
  // Spelled any way (أ / ا, ة / ه…): the same check the server uses for the same institution.
  const plain = (x: string) => x.toLowerCase().replace(/\s+/g, '');
  const shown = query.data.directory.filter((i) => !words || plain(i.name).includes(plain(words)) || sameInstitutionName(i.name, words));
  const mine = new Map(query.data.mine.map((x) => [x.institution.id, x]));
  const addOne = () => router.push({ pathname: '/institutions/new', params: words ? { name: words } : {} });

  return (
    <Screen back title={s.institutions.joinTitle}>
      <Txt color={colors.inkMuted}>{s.institutions.joinIntro}</Txt>
      <Field label={s.institutions.search} value={text} onChangeText={setText} autoFocus returnKeyType="search" accessibilityLabel={s.institutions.search} />
      {shown.length === 0 && (
        // Not here: ask for it, so the search never ends at "nothing found".
        <EmptyState icon="search-outline" text={s.institutions.noneFound} action={{ label: s.institutions.add, icon: 'add-circle-outline', onPress: addOne }} />
      )}
      {shown.map((i) => {
        const membership = mine.get(i.id);
        return (
          <Card key={i.id}>
            <View style={styles.head}>
              <Ionicons name={institutionIcon(i.kind)} size={22} color={colors.primary} />
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{i.name}</Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  {s.institutions.kinds[i.kind]}
                </Txt>
              </View>
            </View>
            {membership ? (
              <Badge
                label={membership.status === 'pending' ? s.institutions.asked : s.institutions.belong}
                color={membership.status === 'pending' ? colors.warning : colors.success}
                icon={membership.status === 'pending' ? 'hourglass-outline' : 'checkmark-circle'}
              />
            ) : (
              <Button variant="secondary" icon="hand-right-outline" label={s.institutions.ask} disabled={busy} onPress={() => run((b) => b.joinInstitution(i.id))} />
            )}
          </Card>
        );
      })}
      {shown.length > 0 && <Button variant="quiet" icon="add-circle-outline" label={s.institutions.add} onPress={addOne} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, gap: 2 },
});
