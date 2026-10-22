import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { LEAF_BIG, LEAF_SMALL, MARK_GRID, PIN, PIVOT, STEM, STEM_WIDTH, pct } from './geometry';
import { ease, lerp, seg, useTimeline, wave, type MotionProps } from './motion';

// Intro / splash: the pin drops onto the ground, a ripple spreads, and the
// seedling grows out of it — stem first, then each leaf unfurls. Afterwards the
// leaves sway gently. ~1.7 s; onDone fires when the seedling is fully grown.

const DURATION = 1700;
const IDLE = 3200;
const VB = `0 0 ${MARK_GRID} ${MARK_GRID}`;
const MIN = 0.001; // Android dislikes a scale of exactly 0

interface Props extends MotionProps {
  accessibilityLabel?: string;
}

export function AnimatedLogo({ size = 120, play = true, onDone, accessibilityLabel }: Props) {
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);

  const pin = useAnimatedStyle(() => {
    const v = t.get();
    const fall = seg(v, 0, 420, ease.in);
    const squash = Math.sin(Math.PI * seg(v, 420, 700, ease.linear));
    return {
      opacity: seg(v, 0, 160, ease.linear),
      transform: [
        { translateY: lerp(-0.5 * size, 0, fall) },
        { scaleX: 1 + 0.1 * squash },
        { scaleY: 1 - 0.14 * squash },
      ],
    };
  });

  const shadow = useAnimatedStyle(() => {
    const v = t.get();
    const x = seg(v, 0, 420, ease.in);
    const squash = Math.sin(Math.PI * seg(v, 420, 700, ease.linear));
    return { opacity: 0.14 * x, transform: [{ scaleX: lerp(0.4, 1, x) + 0.12 * squash }] };
  });

  const ripple = useAnimatedStyle(() => {
    const v = t.get();
    const r = seg(v, 420, 1300);
    return { opacity: v < 420 ? 0 : 0.5 * (1 - r), transform: [{ scale: lerp(0.3, 1.7, r) }] };
  });

  const stem = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(MIN, seg(t.get(), 600, 900)) }],
  }));

  const leafSmall = useAnimatedStyle(() => {
    const v = t.get();
    const sway = (wave(idle.get()) - 0.5) * 7;
    return {
      transform: [
        { rotate: `${45 * (1 - seg(v, 820, 1220)) + sway}deg` },
        { scale: Math.max(MIN, seg(v, 820, 1220, ease.pop)) },
      ],
    };
  });

  const leafBig = useAnimatedStyle(() => {
    const v = t.get();
    const sway = (wave(idle.get(), 0.3) - 0.5) * 6;
    return {
      transform: [
        { rotate: `${-45 * (1 - seg(v, 940, 1340)) + sway}deg` },
        { scale: Math.max(MIN, seg(v, 940, 1340, ease.pop)) },
      ],
    };
  });

  const tipY = size * PIVOT.pinTip.y;
  const rippleW = size * 0.8;
  const shadowW = size * 0.36;

  return (
    <View
      style={{ width: size, height: size * 1.06 }}
      {...(accessibilityLabel
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
      <Animated.View
        style={[
          styles.ellipse,
          { width: rippleW, height: rippleW * 0.3, left: (size - rippleW) / 2, top: tipY - rippleW * 0.15 },
          { borderWidth: Math.max(1.5, size / 60), borderColor: colors.brandGreen },
          ripple,
        ]}
      />
      <Animated.View
        style={[
          styles.ellipse,
          { width: shadowW, height: shadowW * 0.22, left: (size - shadowW) / 2, top: tipY - shadowW * 0.08 },
          { backgroundColor: colors.primary },
          shadow,
        ]}
      />
      <Animated.View style={[styles.layer, { transformOrigin: origin(PIVOT.pinTip) }, pin]}>
        <Svg width={size} height={size} viewBox={VB}>
          <Path d={PIN} fill={colors.brandGreen} />
        </Svg>
        <Animated.View style={[styles.layer, { transformOrigin: origin(PIVOT.stemBase) }, stem]}>
          <Svg width={size} height={size} viewBox={VB}>
            <Path d={STEM} stroke={colors.surface} strokeWidth={STEM_WIDTH} strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.layer, { transformOrigin: origin(PIVOT.leafSmallBase) }, leafSmall]}>
          <Svg width={size} height={size} viewBox={VB}>
            <Path d={LEAF_SMALL} fill={colors.surface} />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.layer, { transformOrigin: origin(PIVOT.leafBigBase) }, leafBig]}>
          <Svg width={size} height={size} viewBox={VB}>
            <Path d={LEAF_BIG} fill={colors.surface} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const origin = (p: { x: number; y: number }) => `${pct(p.x)} ${pct(p.y)}`;

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  ellipse: { position: 'absolute', borderRadius: 999 },
});
