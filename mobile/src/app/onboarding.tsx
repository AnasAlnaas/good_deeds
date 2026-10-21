import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';

const ICONS = ['map', 'clipboard'] as const;

export default function Onboarding() {
  const { s, finishOnboarding } = useApp();
  const [i, setI] = useState(0);
  const slides = s.onboarding.slides;
  const last = i === slides.length - 1;

  const next = () => {
    if (!last) return setI(i + 1);
    finishOnboarding();
    router.replace('/login');
  };

  return (
    <Screen scroll={false} footer={<Button label={last ? s.onboarding.start : s.onboarding.next} onPress={next} />}>
      <View style={styles.center}>
        <View style={styles.art}>
          {i < ICONS.length ? (
            <Ionicons name={ICONS[i]} size={72} color={colors.primary} />
          ) : (
            <View style={styles.barWrap}>
              <PillarBar values={{ spiritual: 1, mental: 1.4, physical: 2 }} height={18} />
            </View>
          )}
        </View>
        <Txt variant="screenTitle" align="center">
          {slides[i].title}
        </Txt>
        <Txt align="center" color={colors.inkMuted}>
          {slides[i].body}
        </Txt>
        <View style={styles.dots}>
          {slides.map((_, k) => (
            <View key={k} style={[styles.dot, k === i && styles.dotActive]} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.md },
  art: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: radius.card,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  barWrap: { width: 120 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
});
