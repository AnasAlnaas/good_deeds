import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import type { Pillar } from '@/data/types';
import { PILLARS } from '@/data/types';
import { useApp } from '@/state/app';
import { colors, pillarColor, radius } from '@/theme/tokens';

interface Props {
  /** Share of each pillar; any scale, normalised here. */
  values: Record<Pillar, number>;
  /** How much of the bar is filled, 0–1. The rest stays empty. */
  fill?: number;
  /** Animate from this fill to `fill` over 600ms — the app's one reward moment (DESIGN.md). */
  animateFrom?: number;
  height?: number;
}

// The signature element: one horizontal bar split by the pillar colours.
// No numbers and no legend on purpose (DESIGN.md).
export function PillarBar({ values, fill = 1, animateFrom, height = 10 }: Props) {
  const { s } = useApp();
  const [progress] = useState(() => new Animated.Value(animateFrom ?? fill));

  useEffect(() => {
    if (animateFrom === undefined) {
      progress.setValue(fill);
      return;
    }
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) progress.setValue(fill);
      else
        Animated.timing(progress, {
          toValue: fill,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [fill, animateFrom, progress]);

  const sum = PILLARS.reduce((a, p) => a + values[p], 0) || 1;
  const label = PILLARS.filter((p) => values[p] > 0)
    .map((p) => `${s.pillar[p]} ${Math.round((values[p] / sum) * 100)}%`)
    .join('، ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}>
        {PILLARS.map((p) =>
          values[p] > 0 ? <View key={p} style={{ flex: values[p] / sum, backgroundColor: pillarColor[p] }} /> : null,
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.surfaceAlt, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  fill: { flexDirection: 'row', height: '100%' },
});
