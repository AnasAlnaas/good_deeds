import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';

// Onboarding slide 2 — "A supervisor records your attendance".
// A clipboard roster: names are ticked one by one while a start → finish time
// strip fills, then a seal stamps the corner (you confirm what was recorded).
// Afterwards the seal sends out a slow glow. Rows and the strip follow RTL;
// the seal stays top-right like a stamp.

const W = 240;
const H = 200;
const DURATION = 2000;
const IDLE = 2600;

const CARD = { x: 40, y: 28, w: 160, h: 164 };
const ROWS = [
  { name: 52, sub: 34, at: 300 },
  { name: 40, sub: 28, at: 620 },
  { name: 56, sub: 38, at: 940 },
];

export function AttendanceMotion({ size = 280, play = true, onDone }: MotionProps) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const fill = useAnimatedStyle(() => ({ width: `${100 * seg(t.get(), 250, 1300, ease.inOut)}%` }));
  const endDot = useAnimatedStyle(() => ({
    backgroundColor: t.get() >= 1300 ? colors.success : colors.border,
    transform: [{ scale: 1 + 0.4 * Math.sin(Math.PI * seg(t.get(), 1300, 1500, ease.linear)) }],
  }));
  const seal = useAnimatedStyle(() => {
    const x = seg(t.get(), 1450, 1850, ease.pop);
    return {
      opacity: seg(t.get(), 1450, 1600),
      transform: [{ rotate: `${-25 * (1 - seg(t.get(), 1450, 1850))}deg` }, { scale: Math.max(0.001, lerp(1.6, 1, x)) }],
    };
  });
  const glow = useAnimatedStyle(() => {
    const p = idle.get();
    return { opacity: t.get() < DURATION ? 0 : 0.35 * (1 - p), transform: [{ scale: lerp(1, 1.7, p) }] };
  });

  const sealD = 46 * u;
  const sealStyle = { width: sealD, height: sealD, top: (CARD.y - 22) * u, left: (CARD.x + CARD.w - 29) * u };

  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.abs,
          styles.round,
          { width: 184 * u, height: 184 * u, left: 28 * u, top: 10 * u, backgroundColor: colors.primarySoft },
        ]}
      />

      <View
        style={[
          styles.abs,
          styles.card,
          {
            left: CARD.x * u,
            top: CARD.y * u,
            width: CARD.w * u,
            height: CARD.h * u,
            borderRadius: 16 * u,
            padding: 14 * u,
            paddingTop: 22 * u,
            gap: 8 * u,
          },
        ]}>
        {ROWS.map((r) => (
          <Row key={r.at} row={r} u={u} t={t} />
        ))}
        <View style={[styles.row, { marginTop: 8 * u, gap: 6 * u }]}>
          <View style={[styles.round, { width: 10 * u, height: 10 * u, backgroundColor: colors.primary }]} />
          <View style={[styles.track, { height: 4 * u }]}>
            <Animated.View style={[styles.trackFill, fill]} />
          </View>
          <Animated.View style={[styles.round, { width: 10 * u, height: 10 * u }, endDot]} />
        </View>
      </View>

      <View
        style={[
          styles.abs,
          { width: 52 * u, height: 14 * u, left: (W / 2 - 26) * u, top: (CARD.y - 7) * u, borderRadius: 7 * u },
          { backgroundColor: colors.primary },
        ]}
      />

      <Animated.View style={[styles.abs, styles.round, sealStyle, { backgroundColor: colors.success }, glow]} />
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          styles.center,
          sealStyle,
          { backgroundColor: colors.success, borderWidth: 3 * u, borderColor: colors.surface },
          seal,
        ]}>
        <Ionicons name="checkmark-done" size={24 * u} color={colors.surface} />
      </Animated.View>
    </View>
  );
}

function Row({ row, u, t }: { row: (typeof ROWS)[number]; u: number; t: SharedValue<number> }) {
  const tick = useAnimatedStyle(() => ({
    opacity: seg(t.get(), row.at, row.at + 120),
    transform: [{ scale: Math.max(0.001, seg(t.get(), row.at, row.at + 320, ease.pop)) }],
  }));
  const box = 24 * u;
  return (
    <View style={[styles.row, { height: 28 * u, gap: 9 * u }]}>
      <View style={[styles.round, styles.center, { width: 26 * u, height: 26 * u, backgroundColor: colors.primarySoft }]}>
        <Ionicons name="person" size={13 * u} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 5 * u }}>
        <View style={[styles.bar, { width: row.name * u, height: 7 * u, backgroundColor: colors.primary }]} />
        <View style={[styles.bar, { width: row.sub * u, height: 5 * u, backgroundColor: colors.border }]} />
      </View>
      <View style={{ width: box, height: box, borderRadius: 7 * u, borderWidth: 2 * u, borderColor: colors.border }}>
        <Animated.View
          style={[styles.center, { position: 'absolute', inset: -2 * u, borderRadius: 7 * u, backgroundColor: colors.success }, tick]}>
          <Ionicons name="checkmark" size={16 * u} color={colors.surface} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  bar: { borderRadius: 4 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0 8px 20px rgba(16, 48, 72, 0.10)',
  },
  track: { flex: 1, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', alignItems: 'flex-start' },
  trackFill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
});
