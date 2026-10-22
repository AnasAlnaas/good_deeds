import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors, pillarColor } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';
import { Plus } from './shapes';

// Onboarding slide 3 — "Three pillars, built in you".
// Spiritual, mental and physical columns rise one after another, each topped
// with its symbol; afterwards "+" points keep floating up out of them.
// The row follows RTL, so spiritual is always on the start side.

const W = 240;
const H = 200;
const DURATION = 1700;
const IDLE = 2200;

const COL_W = 40;
const AREA = { x: 44, w: 152, base: 172, h: 150 };
const PILLARS = [
  { key: 'spiritual', icon: 'moon', height: 80, at: 150 },
  { key: 'mental', icon: 'bulb', height: 104, at: 350 },
  { key: 'physical', icon: 'barbell', height: 126, at: 550 },
] as const;

export function PillarsMotion({ size = 280, play = true, onDone }: MotionProps) {
  const u = size / W;
  const { t, idle, still } = useTimeline(play, DURATION, IDLE, onDone);

  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.abs,
          styles.round,
          { width: 184 * u, height: 184 * u, left: 28 * u, top: 8 * u, backgroundColor: colors.primarySoft },
        ]}
      />
      <View
        style={[
          styles.abs,
          styles.round,
          { left: (AREA.x - 12) * u, width: (AREA.w + 24) * u, top: AREA.base * u, height: 4 * u },
          { backgroundColor: colors.primary, opacity: 0.18 },
        ]}
      />
      <View
        style={[
          styles.abs,
          styles.row,
          { left: AREA.x * u, width: AREA.w * u, top: (AREA.base - AREA.h) * u, height: AREA.h * u },
        ]}>
        {PILLARS.map((p, k) => (
          <Column key={p.key} pillar={p} index={k} u={u} t={t} idle={idle} still={still} />
        ))}
      </View>
    </View>
  );
}

interface ColumnProps {
  pillar: (typeof PILLARS)[number];
  index: number;
  u: number;
  t: SharedValue<number>;
  idle: SharedValue<number>;
  still: boolean;
}

function Column({ pillar, index, u, t, idle, still }: ColumnProps) {
  const { at, height } = pillar;
  const color = pillarColor[pillar.key];

  const grow = useAnimatedStyle(() => ({ height: Math.max(0, lerp(0, height * u, seg(t.get(), at, at + 700, ease.soft))) }));
  const icon = useAnimatedStyle(() => ({
    opacity: seg(t.get(), at + 450, at + 650),
    transform: [{ scale: Math.max(0.001, seg(t.get(), at + 450, at + 800, ease.pop)) }],
  }));

  return (
    <View style={{ width: COL_W * u, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
      {[0, 0.5].map((phase) => (
        <Point key={phase} phase={phase + index / 3} bottom={(height + 4) * u} color={color} u={u} t={t} idle={idle} still={still} />
      ))}
      <Animated.View
        style={[
          styles.center,
          {
            width: COL_W * u,
            backgroundColor: color,
            borderTopLeftRadius: 14 * u,
            borderTopRightRadius: 14 * u,
            borderBottomLeftRadius: 4 * u,
            borderBottomRightRadius: 4 * u,
            overflow: 'hidden',
            justifyContent: 'flex-start',
            paddingTop: 10 * u,
          },
          grow,
        ]}>
        <Animated.View style={icon}>
          <Ionicons name={pillar.icon} size={20 * u} color={colors.surface} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

interface PointProps {
  phase: number;
  bottom: number;
  color: string;
  u: number;
  t: SharedValue<number>;
  idle: SharedValue<number>;
  still: boolean;
}

// A small "+" that floats up from the top of its column and fades.
function Point({ phase, bottom, color, u, t, idle, still }: PointProps) {
  const style = useAnimatedStyle(() => {
    const p = (idle.get() + phase) % 1;
    const on = still ? 0 : seg(t.get(), DURATION - 200, DURATION);
    return { opacity: on * Math.sin(Math.PI * p), transform: [{ translateY: -lerp(0, 30 * u, p) }] };
  });
  return (
    <Animated.View style={[styles.abs, { bottom }, style]}>
      <Plus size={11 * u} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
});
