import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { BADGE_BOX, RING, TREE_BODY, TREE_BOX, TREE_LEAVES, viewBoxOf } from './geometry';

export type MarkVariant = 'color' | 'reverse' | 'mono';

interface Props {
  size?: number;
  // color: forest tree in a sage ring: the default, on cream or white.
  // reverse: cream tree and a soft ring, on forest green or photos.
  // mono: one colour, ring and all: tinted icons, stamps.
  variant?: MarkVariant;
  color?: string;
  // The ring around the tree. Leave it off where the mark is small (under ~32) or already sits in a circle.
  ring?: boolean;
  accessibilityLabel?: string;
}

export function LogoMark({ size = 64, variant = 'color', color = colors.primary, ring = true, accessibilityLabel }: Props) {
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  const tree = variant === 'color' ? colors.brandGreen : variant === 'reverse' ? colors.surface : color;
  const circle = variant === 'color' ? colors.brandSage : tree;
  return (
    <Svg width={size} height={size} viewBox={viewBoxOf(ring ? BADGE_BOX : TREE_BOX)} {...a11y}>
      {ring && (
        <Circle
          cx={RING.cx}
          cy={RING.cy}
          r={RING.r}
          fill="none"
          stroke={circle}
          strokeWidth={RING.width}
          strokeOpacity={variant === 'reverse' ? 0.55 : 1}
        />
      )}
      <TreePaths color={tree} />
    </Svg>
  );
}

/** The whole tree, in one colour, for use inside an Svg in the logo's coordinates. */
export function TreePaths({ color }: { color: string }) {
  return (
    <>
      <Path d={TREE_BODY} fill={color} fillRule="evenodd" />
      {TREE_LEAVES.map((l, i) => (
        <Path key={i} d={l.d} fill={color} fillRule="evenodd" />
      ))}
    </>
  );
}
