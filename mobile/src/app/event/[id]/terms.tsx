import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import * as server from '@/demo/server';
import { fmt } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';

// DESIGN.md "terms carousel": one item per screen, a visible "3 of 7" counter,
// accept disabled for ~2 seconds, no going back after accepting, and the final
// join button does not exist at all until every item is accepted.
const READ_DELAY_MS = 2000;

export default function TermsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, s } = useApp();
  const me = useMe();
  const act = useAction();
  const [joined, setJoined] = useState(false);
  // The term whose reading delay has passed; accepting is enabled only for that term.
  const [readTermId, setReadTermId] = useState<string | null>(null);

  const terms = server.eventTerms(db, id);
  const reg = server.registrationOf(db, id, me.id);
  const accepted = reg ? server.acceptedTermIds(db, reg.id) : [];
  const current = terms.find((x) => !accepted.includes(x.id));
  const index = current ? terms.indexOf(current) : terms.length;

  const currentId = current?.id ?? null;
  useEffect(() => {
    const timer = setTimeout(() => setReadTermId(currentId), READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [currentId]);
  const canAccept = !!current && readTermId === current.id;

  if (joined) {
    return (
      <Screen background={colors.surfaceAlt} footer={<Button label={s.back} onPress={() => router.back()} />}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Txt variant="screenTitle" align="center">
            {s.terms.joinedTitle}
          </Txt>
          <Txt align="center" color={colors.inkMuted}>
            {s.terms.joinedBody}
          </Txt>
        </View>
      </Screen>
    );
  }

  const footer = current ? (
    <Button
      label={canAccept ? s.terms.accept : s.terms.reading}
      icon={canAccept ? 'checkmark' : 'hourglass-outline'}
      disabled={!canAccept}
      onPress={() => act((d, t) => server.acceptTerm(d, me.id, id, current.id, t))}
    />
  ) : (
    <Button
      label={s.terms.join}
      icon="hand-left-outline"
      onPress={() => {
        if (act((d, t) => server.completeJoin(d, me.id, id, t))) setJoined(true);
      }}
    />
  );

  return (
    <Screen back title={s.terms.title} background={colors.surfaceAlt} footer={footer}>
      <Txt variant="bodyStrong" color={colors.primary} tabular>
        {fmt(s.terms.progress, { n: Math.min(index + 1, terms.length), total: terms.length })}
      </Txt>
      <View style={styles.track}>
        <View style={[styles.progress, { width: `${(index / Math.max(terms.length, 1)) * 100}%` }]} />
      </View>
      {index === 0 && (
        <Txt variant="caption" color={colors.inkMuted}>
          {s.terms.intro}
        </Txt>
      )}
      {current ? (
        <View key={current.id} style={styles.term}>
          <Txt variant="sectionTitle">{current.text}</Txt>
        </View>
      ) : (
        <View style={styles.done}>
          <Ionicons name="shield-checkmark" size={64} color={colors.primary} />
          <Txt variant="sectionTitle" align="center">
            {s.terms.allAccepted}
          </Txt>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: colors.primary },
  term: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    minHeight: 220,
    justifyContent: 'center',
  },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xxl },
});
