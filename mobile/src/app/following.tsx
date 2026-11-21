import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, QueryState, Row, SectionTitle } from '@/components/ui';
import { useFollows } from '@/data/queries';
import { institutionIcon } from '@/lib/institutions';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { classIcon, className, EVENT_CLASSES } from '@/theme/classes';
import { colors, space } from '@/theme/tokens';

// What the person follows (owner's decisions, 2026-11-21): classes of good
// works, institutions and supervisors. A new event from any of them is
// announced once it is published, if they may join it. Private.
export default function FollowingScreen() {
  const { s, lang } = useApp();
  const query = useFollows();
  const { run, busy } = useAction();
  if (!query.data) {
    return (
      <Screen back title={s.follows.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { institutions, people, classes } = query.data;
  return (
    <Screen back title={s.follows.title}>
      <Txt color={colors.inkMuted}>{s.follows.intro}</Txt>

      <SectionTitle>{s.follows.topics}</SectionTitle>
      <Row>
        {EVENT_CLASSES.map((c) => {
          const on = classes.includes(c.id);
          return (
            <Chip
              key={c.id}
              icon={on ? 'notifications' : classIcon(c.id)}
              label={className(c.id, lang)}
              selected={on}
              onPress={busy ? undefined : () => run((b) => (on ? b.unfollow('class', c.id) : b.follow('class', c.id)))}
            />
          );
        })}
      </Row>

      <SectionTitle>{s.follows.institutions}</SectionTitle>
      {institutions.length === 0 && <Txt color={colors.inkMuted}>{s.follows.noInstitutions}</Txt>}
      {institutions.map((i) => (
        <Card key={i.id}>
          <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push(`/institution/${i.id}`)}>
            <Ionicons name={institutionIcon(i.kind)} size={22} color={colors.primary} />
            <Txt variant="bodyStrong" style={styles.flex}>
              {i.name}
            </Txt>
          </Pressable>
          <Button variant="quiet" icon="notifications-off-outline" label={s.follows.unfollow} disabled={busy} onPress={() => run((b) => b.unfollow('institution', i.id))} />
        </Card>
      ))}

      <SectionTitle>{s.follows.people}</SectionTitle>
      {people.length === 0 && <Txt color={colors.inkMuted}>{s.follows.noPeople}</Txt>}
      {people.map((p) => (
        <Card key={p.id}>
          <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push(`/person/${p.id}`)}>
            <Avatar user={p} size={36} />
            <Txt variant="bodyStrong" style={styles.flex}>
              {p.full_name}
            </Txt>
          </Pressable>
          <Button variant="quiet" icon="notifications-off-outline" label={s.follows.unfollow} disabled={busy} onPress={() => run((b) => b.unfollow('person', p.id))} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
