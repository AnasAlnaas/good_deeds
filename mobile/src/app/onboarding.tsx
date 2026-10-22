import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Logo, OnboardingArt } from '@/components/brand';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

export default function Onboarding() {
  const { s, finishOnboarding } = useApp();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const slides = s.onboarding.slides;
  const last = i === slides.length - 1;
  // The art is 6:5; keep it from crowding the text on short phones.
  const artSize = Math.min(280, width - space.lg * 2, height * 0.4);

  const next = () => {
    if (!last) return setI(i + 1);
    finishOnboarding();
    router.replace('/login');
  };

  return (
    <Screen scroll={false} footer={<Button label={last ? s.onboarding.start : s.onboarding.next} onPress={next} />}>
      <View style={styles.brand}>
        <Logo size={32} />
      </View>
      <View style={styles.center}>
        <View style={styles.art}>
          <OnboardingArt index={i} size={artSize} />
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
  brand: { alignItems: 'center', paddingTop: space.md },
  center: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.md },
  art: { alignSelf: 'center', marginBottom: space.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
});
