import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, EmptyState, QueryState } from '@/components/ui';
import type { MyLesson } from '@/data/api';
import { useMyLessons } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { classIcon, classOf } from '@/theme/classes';
import { colors, space } from '@/theme/tokens';

// "What I learned": every lesson the person learned in the learning corners of
// events (ركن التعلم), grouped by event, the latest learned first.
export default function MyLessonsScreen() {
  const { s, now } = useApp();
  const query = useMyLessons();
  if (!query.data) {
    return (
      <Screen back title={s.myLessons.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  // The list comes latest first; each event appears where its latest lesson is.
  const groups: { event: MyLesson['event']; lessons: MyLesson['lesson'][] }[] = [];
  for (const { event, lesson } of query.data) {
    const group = groups.find((g) => g.event.id === event.id);
    if (group) group.lessons.push(lesson);
    else groups.push({ event, lessons: [lesson] });
  }
  for (const g of groups) g.lessons.sort((a, b) => a.order_index - b.order_index);

  return (
    <Screen back title={s.myLessons.title}>
      {groups.length === 0 && <EmptyState icon="school-outline" text={s.myLessons.empty} />}
      {groups.length > 0 && (
        <Txt variant="caption" color={colors.inkMuted}>
          {fmt(s.myLessons.count, { n: query.data.length })}
        </Txt>
      )}
      {groups.map(({ event, lessons }) => (
        <View key={event.id} style={styles.group}>
          <View style={styles.eventRow}>
            <Ionicons name={classIcon(classOf(event.subtype))} size={18} color={colors.primary} />
            <Txt variant="bodyStrong" style={styles.flex} numberOfLines={2}>
              {event.title}
            </Txt>
          </View>
          {lessons.map((l) => (
            <Card key={l.id} onPress={() => router.push({ pathname: '/event/[id]/learn', params: { id: event.id, lesson: l.id } })}>
              <Txt variant="bodyStrong">{l.title}</Txt>
              <Txt numberOfLines={2} color={colors.inkMuted}>
                {l.body}
              </Txt>
              {l.learned_at && (
                <Txt variant="caption" color={colors.success}>
                  {fmt(s.myLessons.learnedOn, { day: day(l.learned_at, s, now) })}
                </Txt>
              )}
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  flex: { flex: 1 },
});
