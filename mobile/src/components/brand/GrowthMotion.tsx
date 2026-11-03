import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';
import { Plus } from './shapes';

// Onboarding slide 3 — "Your good works grow".
// Three columns rise one after another like levels, each a deeper green and
// topped with its symbol; afterwards "+" points keep floating up out of them.
// The row follows RTL, so the smallest is always on the start side.

const W = 240;
const H = 200;
const DURATION = 1700;
const IDLE = 2200;

const COL_W = 40;
const AREA = { x: 44, w: 152, base: 172, h: 150 };
const COLUMNS = [
  { key: 'seed', icon: 'leaf', color: colors.accent, height: 80, at: 150 },
  { key: 'grow', icon: 'star', color: colors.brandGreen, height: 104, at: 350 },
  { key: 'rise', icon: 'trophy', color: colors.primary, height: 126, at: 550 },
] as const;

export function GrowthMotion({ size = 280, play = true, onDone }: MotionProps) {
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
        {COLUMNS.map((c, k) => (
          <Column key={c.key} column={c} index={k} u={u} t={t} idle={idle} still={still} />
        ))}
      </View>
    </View>
  );
}

interface ColumnProps {
  column: (typeof COLUMNS)[number];
  index: number;
  u: number;
  t: SharedValue<number>;
  idle: SharedValue<number>;
  still: boolean;
}

function Column({ column, index, u, t, idle, still }: ColumnProps) {
  const { at, height, color } = column;

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
          <Ionicons name={column.icon} size={20 * u} color={column.key === 'seed' ? colors.accentInk : colors.surface} />
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
