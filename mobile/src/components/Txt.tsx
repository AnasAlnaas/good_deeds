import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

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
// On a phone, text under an RTL `direction` already reads left as start and
// right as end (React Native mirrors them); the web takes them literally.
const MIRRORED = Platform.OS !== 'web';

export function Txt({ variant = 'body', color = colors.ink, align = 'start', tabular, style, ...rest }: Props) {
  const { isRTL } = useApp();
  const onRight = (align === 'start') === isRTL;
  const textAlign: TextStyle['textAlign'] =
    align === 'center' ? 'center' : onRight !== (MIRRORED && isRTL) ? 'right' : 'left';
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
