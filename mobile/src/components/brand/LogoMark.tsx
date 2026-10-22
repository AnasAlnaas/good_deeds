import { useId } from 'react';
import Svg, { Mask, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { LEAF_BIG, LEAF_SMALL, MARK_GRID, PIN, STEM, STEM_WIDTH } from './geometry';

export type MarkVariant = 'color' | 'reverse' | 'mono';

interface Props {
  size?: number;
  // color: green pin, white seedling — the default, on light or navy.
  // reverse: white pin, green seedling — on green or photos.
  // mono: one colour with the seedling cut out — tinted icons, stamps.
  variant?: MarkVariant;
  color?: string;
  accessibilityLabel?: string;
}

export function LogoMark({ size = 64, variant = 'color', color = colors.primary, accessibilityLabel }: Props) {
  const maskId = `gd-mark-${useId().replace(/[^\w-]/g, '')}`;
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  if (variant === 'mono') {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`} {...a11y}>
        <Mask id={maskId} x={0} y={0} width={MARK_GRID} height={MARK_GRID} maskUnits="userSpaceOnUse">
          <Rect width={MARK_GRID} height={MARK_GRID} fill="#fff" />
          <Seedling color="#000" />
        </Mask>
        <Path d={PIN} fill={color} mask={`url(#${maskId})`} />
      </Svg>
    );
  }

  const pin = variant === 'color' ? colors.brandGreen : colors.surface;
  const seed = variant === 'color' ? colors.surface : colors.brandGreen;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`} {...a11y}>
      <Path d={PIN} fill={pin} />
      <Seedling color={seed} />
    </Svg>
  );
}

function Seedling({ color }: { color: string }) {
  return (
    <>
      <Path d={STEM} stroke={color} strokeWidth={STEM_WIDTH} strokeLinecap="round" />
      <Path d={LEAF_SMALL} fill={color} />
      <Path d={LEAF_BIG} fill={color} />
    </>
  );
}
