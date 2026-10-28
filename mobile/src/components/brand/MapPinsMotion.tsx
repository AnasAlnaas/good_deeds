import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { PIN, PIN_BOX } from './geometry';
import { ease, lerp, seg, useTimeline, wave, type MotionProps } from './motion';

// Onboarding slide 1 — "Volunteer events near you".
// A map card; event pins drop in one by one (all green, like the map), the
// nearest one lifts, a route dashes in from "you", and a joined-chip pops
// above it. Afterwards "you" pulses and the chosen pin bobs.

const W = 240;
const H = 200;
const DURATION = 2000;
const IDLE = 2400;

const YOU = { x: 104, y: 140 };
const PINS = [
  { x: 58, y: 86, color: colors.accent, at: 200 },
  { x: 196, y: 46, color: colors.accent, at: 400 },
  { x: 168, y: 136, color: colors.brandGreen, at: 600, chosen: true },
];
const CHOSEN = PINS[2];

export function MapPinsMotion({ size = 280, play = true, onDone }: MotionProps) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const halo = useAnimatedStyle(() => {
    const p = idle.get();
    const on = seg(t.get(), 0, 300);
    return { opacity: on * 0.45 * (1 - p), transform: [{ scale: lerp(0.5, 1.8, p) }] };
  });
  const you = useAnimatedStyle(() => ({
    opacity: seg(t.get(), 0, 300),
    transform: [{ scale: Math.max(0.001, seg(t.get(), 0, 400, ease.pop)) }],
  }));
  const route = useAnimatedStyle(() => ({ opacity: seg(t.get(), 1250, 1600) }));
  const chip = useAnimatedStyle(() => {
    const x = seg(t.get(), 1450, 1850, ease.pop);
    return {
      opacity: seg(t.get(), 1450, 1650),
      transform: [{ translateY: -3 * u * wave(idle.get()) }, { scale: Math.max(0.001, lerp(0.6, 1, x)) }],
    };
  });

  const chipW = 104 * u;
  const chipH = 32 * u;
  const chipBottom = CHOSEN.y - 46; // above the lifted pin

  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, { borderRadius: 22 * u, overflow: 'hidden' }]}>
        <Svg width={size} height={H * u} viewBox={`0 0 ${W} ${H}`}>
          <Path d={`M0 0H${W}V${H}H0Z`} fill={colors.primarySoft} />
          <Path
            d="M20 114C8 98 18 80 38 82C52 72 74 82 72 100C80 118 60 130 44 124C32 134 18 128 20 114Z"
            fill={colors.brandGreen}
            opacity={0.1}
          />
          <Path d="M-10 52C60 70 120 30 250 60" stroke={colors.surface} strokeWidth={6} fill="none" />
          <Path d="M60 -10C70 60 40 140 70 210" stroke={colors.surface} strokeWidth={6} fill="none" />
          <Path d="M-10 152C50 132 110 177 250 130" stroke={colors.surface} strokeWidth={12} fill="none" />
          <Path d="M150 -10C138 60 178 120 162 210" stroke={colors.surface} strokeWidth={12} fill="none" />
        </Svg>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, route]}>
        <Svg width={size} height={H * u} viewBox={`0 0 ${W} ${H}`}>
          <Path
            d={`M${YOU.x} ${YOU.y}C124 160 148 156 ${CHOSEN.x} ${CHOSEN.y}`}
            stroke={colors.primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="0.1 7"
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.abs,
          styles.round,
          { width: 40 * u, height: 40 * u, left: (YOU.x - 20) * u, top: (YOU.y - 20) * u, backgroundColor: colors.link },
          halo,
        ]}
      />
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          {
            width: 16 * u,
            height: 16 * u,
            left: (YOU.x - 8) * u,
            top: (YOU.y - 8) * u,
            backgroundColor: colors.link,
            borderWidth: 3 * u,
            borderColor: colors.surface,
          },
          you,
        ]}
      />

      {PINS.map((p) => (
        <DropPin key={p.at} pin={p} u={u} t={t} idle={idle} />
      ))}

      <Animated.View
        style={[
          styles.abs,
          styles.chip,
          {
            width: chipW,
            height: chipH,
            left: CHOSEN.x * u - chipW / 2,
            top: (chipBottom - 32) * u,
            borderRadius: chipH / 2,
            paddingHorizontal: 6 * u,
            gap: 7 * u,
            transformOrigin: '50% 100%',
          },
          chip,
        ]}>
        <View style={[styles.round, styles.center, { width: 22 * u, height: 22 * u, backgroundColor: colors.success }]}>
          <Ionicons name="checkmark" size={15 * u} color={colors.surface} />
        </View>
        <View style={{ gap: 5 * u }}>
          <View style={[styles.bar, { width: 52 * u, height: 7 * u, backgroundColor: colors.primary }]} />
          <View style={[styles.bar, { width: 34 * u, height: 5 * u, backgroundColor: colors.border }]} />
        </View>
      </Animated.View>
    </View>
  );
}

interface PinProps {
  pin: (typeof PINS)[number];
  u: number;
  t: SharedValue<number>;
  idle: SharedValue<number>;
}

function DropPin({ pin, u, t, idle }: PinProps) {
  const w = 26 * u;
  const h = w * PIN_BOX.ratio;
  const { at, chosen } = pin;

  const body = useAnimatedStyle(() => {
    const v = t.get();
    const drop = seg(v, at, at + 450, ease.pop);
    const lift = chosen ? seg(v, 1200, 1500, ease.soft) : 0;
    const bob = chosen ? -2 * u * wave(idle.get()) : 0;
    return {
      opacity: seg(v, at, at + 150),
      transform: [{ translateY: lerp(-36 * u, 0, drop) + bob }, { scale: 1 + 0.2 * lift }],
    };
  });
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.18 * seg(t.get(), at, at + 450),
    transform: [{ scaleX: Math.max(0.001, seg(t.get(), at, at + 450)) }],
  }));

  return (
    <>
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          { width: 16 * u, height: 5 * u, left: pin.x * u - 8 * u, top: pin.y * u - 2.5 * u, backgroundColor: colors.primary },
          shadow,
        ]}
      />
      <Animated.View
        style={[styles.abs, { width: w, height: h, left: pin.x * u - w / 2, top: pin.y * u - h, transformOrigin: '50% 100%' }, body]}>
        <Svg width={w} height={h} viewBox={PIN_BOX.viewBox}>
          <Path d={PIN} fill={pin.color} />
          <Circle {...PIN_BOX.dot} fill={colors.surface} />
        </Svg>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { borderRadius: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    boxShadow: '0 4px 14px rgba(16, 48, 72, 0.16)',
  },
});
