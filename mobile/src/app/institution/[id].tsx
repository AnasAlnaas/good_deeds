import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FollowButton } from '@/components/FollowButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, QueryState } from '@/components/ui';
import { useInstitutionPublic } from '@/data/queries';
import { institutionIcon } from '@/lib/institutions';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// An approved institution as anyone sees it, to follow its new events (owner's decisions, 2026-11-21).
export default function InstitutionPublicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const query = useInstitutionPublic(id);
  if (!query.data) {
    return (
      <Screen back title={s.follows.institutionTitle}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { institution, following } = query.data;
  return (
    <Screen back title={s.follows.institutionTitle}>
      <Card>
        <View style={styles.head}>
          <Ionicons name={institutionIcon(institution.kind)} size={28} color={colors.primary} />
          <View style={styles.flex}>
            <Txt variant="sectionTitle">{institution.name}</Txt>
            <Txt variant="caption" color={colors.inkMuted}>
              {s.institutions.kinds[institution.kind]}
            </Txt>
          </View>
        </View>
        <Txt color={colors.inkMuted}>{s.follows.institutionNote}</Txt>
        <FollowButton kind="institution" id={institution.id} following={following} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
