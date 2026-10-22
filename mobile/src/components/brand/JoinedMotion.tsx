import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { PIVOT } from './geometry';
import { LogoMark } from './LogoMark';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';

// Success — "You joined the event" (terms screen, after the last term).
// A calendar page settles in, the logo's pin drops onto one day and a ripple
// spreads from it; afterwards the ripple repeats slowly. Calm on purpose: the
// app's one big reward is ConfirmedMotion. The chosen day is the middle column,
// so the picture reads the same in RTL.

const W = 160;
const H = 140;
const DURATION = 1300;
const IDLE = 2800;

const CAL = { x: 28, y: 26, w: 104, h: 104, head: 26 };
const PITCH = 17;
const ROW0 = CAL.y + CAL.head + 18;
const DAY = { x: W / 2, y: ROW0 + 2 * PITCH };
const PIN = 44; // mark box; the tip sits on the day

export function JoinedMotion({ size = 150, play = true, onDone }: MotionProps) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const card = useAnimatedStyle(() => {
    const x = seg(t.get(), 0, 350);
    return { opacity: x, transform: [{ translateY: lerp(10 * u, 0, x) }] };
  });
  const pin = useAnimatedStyle(() => {
    const v = t.get();
    const squash = Math.sin(Math.PI * seg(v, 620, 860, ease.linear));
    return {
      opacity: seg(v, 300, 400),
      transform: [
        { translateY: lerp(-70 * u, 0, seg(v, 300, 620, ease.in)) },
        { scaleX: 1 + 0.1 * squash },
        { scaleY: 1 - 0.14 * squash },
      ],
    };
  });
  const day = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0.001, seg(t.get(), 620, 860, ease.pop)) }],
  }));
  const ripple = useAnimatedStyle(() => {
    const v = t.get();
    // First ripple on landing, then a slow one each idle loop.
    const p = v < DURATION ? seg(v, 620, 1300) : idle.get();
    const on = v < 620 ? 0 : v < DURATION ? 0.55 : 0.3;
    return { opacity: on * (1 - p), transform: [{ scale: lerp(0.4, 1.7, p) }] };
  });

  const rippleW = 48 * u;
  const dayD = 15 * u;

  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, card]}>
        <View
          style={[
            styles.abs,
            styles.card,
            { left: CAL.x * u, top: CAL.y * u, width: CAL.w * u, height: CAL.h * u, borderRadius: 14 * u },
          ]}>
          <View style={[styles.center, { height: CAL.head * u, backgroundColor: colors.primary }]}>
            <View style={{ width: 36 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.surface, opacity: 0.85 }} />
          </View>
        </View>
        {[52, 108].map((x) => (
          <View
            key={x}
            style={[
              styles.abs,
              {
                left: (x - 4) * u,
                top: (CAL.y - 7) * u,
                width: 8 * u,
                height: 15 * u,
                borderRadius: 4 * u,
                borderWidth: 2 * u,
                borderColor: colors.surface,
                backgroundColor: colors.primary,
              },
            ]}
          />
        ))}
        {[0, 1, 2].flatMap((r) =>
          [-2, -1, 0, 1, 2].map((c) => (
            <View
              key={`${r}${c}`}
              style={[
                styles.abs,
                styles.round,
                {
                  width: 7 * u,
                  height: 7 * u,
                  left: (W / 2 + c * PITCH - 3.5) * u,
                  top: (ROW0 + r * PITCH - 3.5) * u,
                  backgroundColor: colors.border,
                },
              ]}
            />
          )),
        )}
      </Animated.View>

      <Animated.View
        style={[
          styles.abs,
          {
            width: dayD,
            height: dayD,
            left: DAY.x * u - dayD / 2,
            top: DAY.y * u - dayD / 2,
            borderRadius: 4 * u,
            backgroundColor: `${colors.success}33`, // the chosen day, softly lit
          },
          day,
        ]}
      />
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          {
            width: rippleW,
            height: rippleW * 0.36,
            left: DAY.x * u - rippleW / 2,
            top: DAY.y * u - rippleW * 0.18,
            borderWidth: 2 * u,
            borderColor: colors.success,
          },
          ripple,
        ]}
      />
      <Animated.View
        style={[
          styles.abs,
          {
            left: DAY.x * u - (PIN * u) / 2,
            top: DAY.y * u - PIN * u * PIVOT.pinTip.y,
            transformOrigin: `50% ${PIVOT.pinTip.y * 100}%`,
          },
          pin,
        ]}>
        <LogoMark size={PIN * u} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0 8px 20px rgba(16, 48, 72, 0.10)',
  },
});
