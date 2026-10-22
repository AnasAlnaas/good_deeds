import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { ease, lerp, seg, useTimeline, type MotionProps } from './motion';

// Success — the supervisor recorded a participant's start or finish.
// A stamp comes down onto the page, hits with a short shockwave and impact
// lines, then a small badge shows which one was recorded (play = start,
// stop = finish). Over in 650 ms: the record screen goes back after 900 ms.
// The badge stays bottom-right like a stamp's corner mark, in either direction.

const W = 160;
const H = 140;
const DURATION = 650;
const IDLE = 2400;
const HIT = 260; // the moment the stamp meets the page

const C = { x: W / 2, y: H / 2 };
const SEAL = 80;
const DASHES = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => k * 45 + 22.5);

interface Props extends MotionProps {
  mode?: 'start' | 'end';
}

export function RecordedMotion({ size = 150, play = true, onDone, mode = 'start' }: Props) {
  const u = size / W;
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const seal = useAnimatedStyle(() => {
    const v = t.get();
    const squash = Math.sin(Math.PI * seg(v, HIT, HIT + 160, ease.linear));
    return {
      opacity: seg(v, 0, 120),
      transform: [{ scale: lerp(1.7, 1, seg(v, 0, HIT, ease.in)) - 0.08 * squash }],
    };
  });
  const wave = useAnimatedStyle(() => {
    const v = t.get();
    const p = v < DURATION ? seg(v, HIT, DURATION) : idle.get();
    const on = v < HIT ? 0 : v < DURATION ? 0.5 : 0.25;
    return { opacity: on * (1 - p), transform: [{ scale: lerp(1, 1.6, p) }] };
  });
  const badge = useAnimatedStyle(() => ({
    opacity: seg(t.get(), 360, 440),
    transform: [{ scale: Math.max(0.001, seg(t.get(), 360, 620, ease.pop)) }],
  }));

  const d = SEAL * u;
  const badgeD = 32 * u;
  const corner = (SEAL / 2) * Math.SQRT1_2; // 45° on the seal's edge

  return (
    <View style={{ width: size, height: H * u }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          { width: d, height: d, left: C.x * u - d / 2, top: C.y * u - d / 2, borderWidth: 3 * u, borderColor: colors.success },
          wave,
        ]}
      />
      {DASHES.map((deg) => (
        <Dash key={deg} deg={deg} u={u} t={t} />
      ))}
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          styles.center,
          { width: d, height: d, left: C.x * u - d / 2, top: C.y * u - d / 2, backgroundColor: colors.success },
          seal,
        ]}>
        <Ionicons name="checkmark" size={44 * u} color={colors.surface} />
      </Animated.View>
      <Animated.View
        style={[
          styles.abs,
          styles.round,
          styles.center,
          {
            width: badgeD,
            height: badgeD,
            left: (C.x + corner) * u - badgeD / 2,
            top: (C.y + corner) * u - badgeD / 2,
            backgroundColor: colors.primary,
            borderWidth: 3 * u,
            borderColor: colors.surface,
          },
          badge,
        ]}>
        <Ionicons name={mode === 'start' ? 'play' : 'stop'} size={13 * u} color={colors.surface} />
      </Animated.View>
    </View>
  );
}

// One impact line, flying out along its angle and fading.
function Dash({ deg, u, t }: { deg: number; u: number; t: SharedValue<number> }) {
  const rad = (deg * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const p = seg(t.get(), HIT, HIT + 340);
    const r = lerp(46, 62, p) * u;
    return {
      opacity: t.get() < HIT ? 0 : 1 - p,
      transform: [{ translateX: r * Math.cos(rad) }, { translateY: r * Math.sin(rad) }, { rotate: `${deg + 90}deg` }],
    };
  });
  const w = 3 * u;
  const h = 10 * u;
  return (
    <Animated.View
      style={[
        styles.abs,
        styles.round,
        { width: w, height: h, left: C.x * u - w / 2, top: C.y * u - h / 2, backgroundColor: colors.success },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
