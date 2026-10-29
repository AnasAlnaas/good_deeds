import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

interface Props {
  /** How much of the bar is filled, 0–1. */
  value: number;
  /** Animate from this fill to `value` over 600ms — the app's one reward moment (DESIGN.md). */
  animateFrom?: number;
  height?: number;
  /** Read out instead of the bar, e.g. "120 of 150 points". */
  label?: string;
  /** On a green card: a navy fill on a light track. */
  onAccent?: boolean;
}

// Progress toward the next level, in the green accent.
export function ProgressBar({ value, animateFrom, height = 10, label, onAccent }: Props) {
  const [progress] = useState(() => new Animated.Value(animateFrom ?? value));

  useEffect(() => {
    if (animateFrom === undefined) {
      progress.setValue(value);
      return;
    }
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) progress.setValue(value);
      else
        Animated.timing(progress, {
          toValue: value,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [value, animateFrom, progress]);

  return (
    <View accessible={!!label} accessibilityLabel={label} style={[styles.track, onAccent && styles.trackOnAccent, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          onAccent && styles.fillOnAccent,
          { borderRadius: height / 2, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.primarySoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  trackOnAccent: { backgroundColor: 'rgba(255, 255, 255, 0.55)' },
  fillOnAccent: { backgroundColor: colors.primary },
});
