import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { BADGE_BOX, RING, TREE_BODY, TREE_FOOT, TREE_LEAVES, viewBoxOf } from './geometry';
import { ease, lerp, seg, useTimeline, wave, type MotionProps } from './motion';

// Intro / splash: the ring draws itself, the trunk and its knotted branches
// rise out of the ground, then the free leaves open from the centre outwards.
// Afterwards the leaves breathe and sway, each a little out of step.
// ~1.9 s; onDone fires when the last leaf is open.

const DURATION = 1900;
const IDLE = 3600;
const VB = viewBoxOf(BADGE_BOX);
const MIN = 0.001; // Android dislikes a scale of exactly 0
const CIRCUMFERENCE = 2 * Math.PI * RING.r;
const LEAF_START = 1000;
const LEAF_STEP = 55;
const LEAF_LENGTH = 420;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props extends MotionProps {
  accessibilityLabel?: string;
}

export function AnimatedLogo({ size = 120, play = true, onDone, accessibilityLabel }: Props) {
  const { t, idle } = useTimeline(play, DURATION, IDLE, onDone);
  const k = size / BADGE_BOX.side;
  // The tree's foot, in points from the top of the box.
  const footY = (TREE_FOOT.y - BADGE_BOX.y) * k;

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - seg(t.get(), 0, 800, ease.inOut)),
  }));

  // The tree is revealed from the ground up: a window that grows from the foot.
  const rise = useAnimatedStyle(() => {
    const x = seg(t.get(), 300, 1150, ease.out);
    return { height: Math.max(MIN, footY * x), opacity: seg(t.get(), 300, 500, ease.linear) };
  });

  return (
    <View
      style={{ width: size, height: size }}
      {...(accessibilityLabel
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
      {/* Turned a quarter back, so the ring starts drawing at the top (the box is centred on the ring). */}
      <Svg width={size} height={size} viewBox={VB} style={[styles.layer, styles.fromTop]}>
        <AnimatedCircle
          cx={RING.cx}
          cy={RING.cy}
          r={RING.r}
          fill="none"
          stroke={colors.brandSage}
          strokeWidth={RING.width}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          animatedProps={ringProps}
        />
      </Svg>
      <Animated.View style={[styles.window, { bottom: size - footY - 2, width: size }, rise]}>
        <View style={[styles.anchor, { bottom: -(size - footY - 2) }]}>
          <Svg width={size} height={size} viewBox={VB}>
            <Path d={TREE_BODY} fill={colors.brandGreen} fillRule="evenodd" />
          </Svg>
        </View>
      </Animated.View>
      {TREE_LEAVES.map((leaf, i) => (
        <Leaf key={i} index={i} d={leaf.d} cx={leaf.cx} cy={leaf.cy} size={size} t={t} idle={idle} />
      ))}
    </View>
  );
}

function Leaf({
  index,
  d,
  cx,
  cy,
  size,
  t,
  idle,
}: {
  index: number;
  d: string;
  cx: number;
  cy: number;
  size: number;
  t: SharedValue<number>;
  idle: SharedValue<number>;
}) {
  const from = LEAF_START + index * LEAF_STEP;
  const phase = index / TREE_LEAVES.length;
  // Leaves on the left lean left as they open, those on the right lean right.
  const side = cx < TREE_FOOT.x ? -1 : 1;
  const style = useAnimatedStyle(() => {
    const v = t.get();
    const open = seg(v, from, from + LEAF_LENGTH, ease.pop);
    const breathe = wave(idle.get(), phase) - 0.5;
    return {
      opacity: seg(v, from, from + 120, ease.linear),
      transform: [{ rotate: `${lerp(side * 35, 0, seg(v, from, from + LEAF_LENGTH)) + breathe * 6 * side}deg` }, { scale: Math.max(MIN, open + breathe * 0.05) }],
    };
  });
  const origin = `${((cx - BADGE_BOX.x) / BADGE_BOX.side) * 100}% ${((cy - BADGE_BOX.y) / BADGE_BOX.side) * 100}%`;
  return (
    <Animated.View style={[styles.layer, { transformOrigin: origin }, style]}>
      <Svg width={size} height={size} viewBox={VB}>
        <Path d={d} fill={colors.brandGreen} fillRule="evenodd" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  window: { position: 'absolute', left: 0, overflow: 'hidden' },
  anchor: { position: 'absolute', left: 0 },
  fromTop: { transform: [{ rotate: '-90deg' }] },
});
