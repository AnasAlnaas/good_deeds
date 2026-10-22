import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { PILLARS, type Pillar } from '@/data/types';
import { colors, pillarColor } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';
import { Plus } from './shapes';

// Success — the participant confirmed their hours: the app's one reward moment
// (DESIGN.md). A seal pops, then points burst out of it in the pillar colours,
// shared out by what this attendance actually earned. Timed to land with the
// 600 ms PillarBar fill under it on the confirm screen. Afterwards the seal
// sends out a slow glow.

const W = 160;
const H = 140;
const DURATION = 1100;
const IDLE = 2800;
const COUNT = 14;

const C = { x: W / 2, y: H / 2 };
const SEAL = 76;

interface Props extends MotionProps {
  // Points per pillar for this attendance (any scale). Pillars at 0 get no
  // particles; leave it out for an even mix.
  values?: Record<Pillar, number>;
}

export function ConfirmedMotion({ size = 150, play = true, onDone, values }: Props) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);
  const colorsOut = particleColors(values);

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
      {colorsOut.map((color, i) => (
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

// Shares COUNT particles between the pillars in proportion to `values`,
// interleaved so the colours mix around the circle instead of clumping.
function particleColors(values?: Record<Pillar, number>) {
  const live = PILLARS.filter((p) => (values ? values[p] > 0 : true));
  const pillars = live.length ? live : PILLARS;
  const total = pillars.reduce((sum, p) => sum + (values?.[p] || 1), 0);
  const share = Object.fromEntries(pillars.map((p) => [p, (values?.[p] || 1) / total])) as Record<Pillar, number>;
  const used = Object.fromEntries(pillars.map((p) => [p, 0])) as Record<Pillar, number>;
  return Array.from({ length: COUNT }, (_, i) => {
    const next = pillars.reduce((best, p) =>
      share[p] * (i + 1) - used[p] > share[best] * (i + 1) - used[best] ? p : best,
    );
    used[next]++;
    return pillarColor[next];
  });
}

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
