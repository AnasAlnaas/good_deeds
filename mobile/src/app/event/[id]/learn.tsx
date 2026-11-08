import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { LessonPicture } from '@/components/LessonPicture';
import { LessonVideo } from '@/components/LessonVideo';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, QueryState } from '@/components/ui';
import { useEvent } from '@/data/queries';
import { fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';
import { isHidden } from '../../../../../shared/rules';

// The event's learning corner (ركن التعلم), one lesson per screen like the
// terms. `lesson` opens that one (from the event's page or "What I learned");
// otherwise the first not yet learned. Learning one moves on to the next not
// learned; once all are, someone on their way to joining goes on to the terms.
//
// Owner's decision (2026-11-08): marking a lesson learned is a pledge. The
// person ticks that they read and understood it and take responsibility for
// any shortcoming from not following it; only then can they confirm. The
// lesson's completion (lesson_completions) is the record of that pledge.

export default function LearnScreen() {
  const { id, lesson: lessonParam } = useLocalSearchParams<{ id: string; lesson?: string }>();
  const { s } = useApp();
  const { run, busy } = useAction();
  const query = useEvent(id);
  const [chosen, setChosen] = useState<string | null>(lessonParam ?? null);
  // The lesson whose pledge is ticked; moving to another lesson unticks it.
  const [pledgedId, setPledgedId] = useState<string | null>(null);

  const lessons = query.data?.lessons ?? [];
  const current = lessons.find((l) => l.id === chosen) ?? lessons.find((l) => !l.learned_at);

  if (!query.data) {
    return (
      <Screen back title={s.learn.title} background={colors.surfaceAlt}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const event = query.data;
  // A draft's lessons are its creator's preview: nothing is learned before an admin approves it.
  const preview = isHidden(event);
  const onTheWay = event.my_registration?.status === 'pending_terms';
  const index = current ? lessons.indexOf(current) : lessons.length;
  const nextUnlearned = lessons.find((l) => !l.learned_at && l.id !== current?.id);
  // Reading on: the next not learned (in a preview, simply the next one).
  const more = preview ? lessons[index + 1] : (nextUnlearned ?? lessons[index + 1]);
  // Nothing chosen and nothing left to learn shows the end.
  const DONE = '';

  let footer;
  if (!current) {
    footer = onTheWay ? (
      <Button icon="shield-checkmark-outline" label={s.learn.toTerms} onPress={() => router.replace(`/event/${id}/terms`)} />
    ) : (
      <Button label={s.back} onPress={() => router.back()} />
    );
  } else if (current.learned_at || preview) {
    footer = more ? (
      <Button variant="secondary" icon="arrow-forward" label={s.learn.next} onPress={() => setChosen(more.id)} />
    ) : (
      <Button label={s.back} onPress={() => (onTheWay && !preview ? setChosen(DONE) : router.back())} />
    );
  } else {
    const canLearn = pledgedId === current.id;
    footer = (
      <Button
        label={s.learn.learn}
        icon="shield-checkmark-outline"
        disabled={!canLearn || busy}
        onPress={async () => {
          if (await run((b) => b.learnLesson(id, current.id))) setChosen(nextUnlearned?.id ?? DONE);
        }}
      />
    );
  }

  return (
    <Screen back title={s.learn.title} background={colors.surfaceAlt} footer={footer}>
      <Txt variant="caption" color={colors.inkMuted} numberOfLines={2}>
        {event.title}
      </Txt>
      {current ? (
        <>
          <Txt variant="bodyStrong" color={colors.primary} tabular>
            {fmt(s.learn.progress, { n: index + 1, total: lessons.length })}
          </Txt>
          <View style={styles.track}>
            {lessons.map((l) => (
              <View key={l.id} style={[styles.step, (l.learned_at || l.id === current.id) && styles.stepOn, l.id === current.id && styles.stepHere]} />
            ))}
          </View>
          {preview && (
            <Card style={styles.preview}>
              <Txt variant="caption">{s.learn.preview}</Txt>
            </Card>
          )}
          <View key={current.id} style={styles.lesson}>
            <Txt variant="sectionTitle">{current.title}</Txt>
            {current.image && <LessonPicture image={current.image} label={fmt(s.learn.picture, { title: current.title })} />}
            {current.video_id && <LessonVideo videoId={current.video_id} title={current.title} />}
            {current.body.length > 0 && <Txt>{current.body}</Txt>}
            {current.learned_at && <Badge label={s.learn.learned} color={colors.success} icon="checkmark-circle" />}
          </View>
          {!current.learned_at && !preview && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: pledgedId === current.id }}
              onPress={() => setPledgedId(pledgedId === current.id ? null : current.id)}
              style={[styles.pledge, pledgedId === current.id && styles.pledgeOn]}>
              <Ionicons
                name={pledgedId === current.id ? 'checkbox' : 'square-outline'}
                size={26}
                color={pledgedId === current.id ? colors.primary : colors.inkMuted}
              />
              <Txt style={styles.flex}>{s.learn.pledge}</Txt>
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.done}>
          <Ionicons name="school" size={64} color={colors.primary} />
          <Txt variant="sectionTitle" align="center">
            {s.learn.allLearned}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {s.learn.allLearnedBody}
          </Txt>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: space.xs },
  step: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  stepOn: { backgroundColor: colors.primary },
  stepHere: { opacity: 0.55 },
  preview: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  lesson: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    minHeight: 220,
  },
  pledge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pledgeOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xxl },
});
