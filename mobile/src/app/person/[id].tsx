import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BadgeGrid } from '@/components/Badges';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, QueryState } from '@/components/ui';
import { usePerson } from '@/data/queries';
import { fmt, num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

// Someone as everyone signed in sees them (owner's decision, 2026-11-20:
// badges are seen by everyone): their name, photo, level and badges.
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const query = usePerson(id);
  if (!query.data) {
    return (
      <Screen back title={s.person.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { user, level, badges } = query.data;
  return (
    <Screen back title={s.person.title}>
      <View style={styles.head}>
        <Avatar user={user} size={64} />
        <View style={styles.flex}>
          <Txt variant="sectionTitle">{user.full_name}</Txt>
          <Txt color={colors.primary}>{fmt(s.person.level, { n: num(level) })}</Txt>
        </View>
      </View>
      <Card>
        <Txt variant="sectionTitle">{s.badges.title}</Txt>
        <BadgeGrid badges={badges} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
