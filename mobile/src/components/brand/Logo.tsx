import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { useApp } from '@/state/app';
import { colors, fonts } from '@/theme/tokens';
import { LogoMark, type MarkVariant } from './LogoMark';

interface Props {
  // Height of the mark; the name scales with it.
  size?: number;
  layout?: 'row' | 'stack';
  variant?: MarkVariant;
  // Name colour; defaults to navy, or white for the reverse variant.
  color?: string;
}

// Mark + app name in the current language. In a row the mark sits on the
// start side, so Arabic reads mark → name from the right.
export function Logo({ size = 40, layout = 'row', variant = 'color', color }: Props) {
  const { s } = useApp();
  const ink = color ?? (variant === 'reverse' ? colors.surface : colors.primary);
  const fontSize = Math.round(size * (layout === 'row' ? 0.5 : 0.34));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={s.appName}
      style={[layout === 'row' ? styles.row : styles.stack, { gap: size * (layout === 'row' ? 0.22 : 0.16) }]}>
      <LogoMark size={size} variant={variant} color={ink} />
      <Txt
        align="center"
        color={ink}
        style={{ fontFamily: fonts.readex700, fontSize, lineHeight: Math.round(fontSize * 1.4) }}>
        {s.appName}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stack: { alignItems: 'center' },
});
