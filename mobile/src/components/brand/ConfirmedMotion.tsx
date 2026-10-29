import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';
import { Plus } from './shapes';

// Success — the participant confirmed their hours: the app's one reward moment
// (DESIGN.md). A seal pops, then points burst out of it in greens and navy.
// Timed to land with the 600 ms level bar fill under it on the confirm screen.
// Afterwards the seal sends out a slow glow.

const W = 160;
const H = 140;
const DURATION = 1100;
const IDLE = 2800;
const COUNT = 14;

const C = { x: W / 2, y: H / 2 };
const SEAL = 76;

export function ConfirmedMotion({ size = 150, play = true, onDone }: MotionProps) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const seal = useAnimatedStyle(() => ({
    opacity: seg(t.get(), 0, 100),
    transform: [{ scale: Math.max(0.001, seg(t.get(), 0, 380, ease.pop)) }],
  }));
  const halo = useAnimatedStyle(() => {
    const v = t.get();
    const p = v < DURATION ? seg(v, 120, 700) : idle.get();
    const on = v < 120 ? 0 : v < DURATION ? 0.45 : 0.3;
    return { opacity: on * (1 - p), transform: [{ scale: lerp(0.9, 1.6, p) }] };
  });

  const d = SEAL * u;
  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          { width: d, height: d, left: C.x * u - d / 2, top: C.y * u - d / 2, backgroundColor: colors.success },
          halo,
        ]}
      />
      {Array.from({ length: COUNT }, (_, i) => PARTICLE_COLORS[i % PARTICLE_COLORS.length]).map((color, i) => (
        <Particle key={i} index={i} color={color} u={u} t={t} />
      ))}
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          styles.center,
          { width: d, height: d, left: C.x * u - d / 2, top: C.y * u - d / 2, backgroundColor: colors.success },
          seal,
        ]}>
        <Ionicons name="checkmark" size={42 * u} color={colors.surface} />
      </Animated.View>
    </View>
  );
}

// The burst's colours, mixed around the circle.
const PARTICLE_COLORS = [colors.accent, colors.brandGreen, colors.primary];

function Particle({ index, color, u, t }: { index: number; color: string; u: number; t: SharedValue<number> }) {
  // Fixed per index, so the burst looks scattered but plays the same every time.
  const deg = -90 + (index * 360) / COUNT + (index % 2 ? 7 : -4);
  const rad = (deg * Math.PI) / 180;
  const reach = 58 + (index % 3) * 5;
  const at = 220 + (index % 4) * 35;
  const isPlus = index % 2 === 1;

  const style = useAnimatedStyle(() => {
    const v = t.get();
    const p = seg(v, at, at + 560);
    const r = lerp(SEAL / 2 - 4, reach, p) * u;
    return {
      opacity: seg(v, at, at + 80) * (1 - seg(v, at + 320, at + 640, ease.linear)),
      transform: [
        { translateX: r * Math.cos(rad) },
        { translateY: r * Math.sin(rad) },
        { scale: lerp(0.6, 1, seg(v, at, at + 200)) },
        { rotate: `${isPlus ? 90 * p : 0}deg` },
      ],
    };
  });

  const s = (isPlus ? 10 : 7) * u;
  return (
    <Animated.View style={[styles.abs, { width: s, height: s, left: C.x * u - s / 2, top: C.y * u - s / 2 }, style]}>
      {isPlus ? <Plus size={s} color={color} /> : <View style={[styles.round, { flex: 1, backgroundColor: color }]} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
