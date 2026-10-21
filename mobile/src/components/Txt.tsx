import { Text, type TextProps, type TextStyle } from 'react-native';

import { useApp } from '@/state/app';
import { colors, type as typeTokens, type TypeVariant } from '@/theme/tokens';

type Align = 'start' | 'center' | 'end';

interface Props extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: Align;
  tabular?: boolean;
}

// Expo Go resets the native RTL flag, so direction is handled by the app:
// layout flips through the root View's `direction`, and text alignment is
// resolved here from the app language. Screens only ever say start/end.
export function Txt({ variant = 'body', color = colors.ink, align = 'start', tabular, style, ...rest }: Props) {
  const { isRTL } = useApp();
  const textAlign: TextStyle['textAlign'] =
    align === 'center' ? 'center' : (align === 'start') === isRTL ? 'right' : 'left';
  return (
    <Text
      {...rest}
      style={[
        typeTokens[variant],
        { color, textAlign, writingDirection: isRTL ? 'rtl' : 'ltr' },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
