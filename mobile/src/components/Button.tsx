import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, space, touch } from '@/theme/tokens';
import { Txt } from './Txt';

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'quiet';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const look: Record<Variant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.surface, border: colors.primary },
  accent: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.accentInk, border: colors.accent },
  secondary: { bg: colors.surface, pressed: colors.primarySoft, fg: colors.primary, border: colors.surface },
  danger: { bg: colors.surface, pressed: colors.surfaceAlt, fg: colors.danger, border: colors.surface },
  quiet: { bg: 'transparent', pressed: colors.primarySoft, fg: colors.primary, border: 'transparent' },
};

export function Button({ label, onPress, variant = 'primary', disabled, icon }: Props) {
  const l = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? l.pressed : l.bg, borderColor: l.border },
        disabled && styles.disabled,
      ]}>
      <View style={styles.row}>
        {icon && <Ionicons name={icon} size={20} color={disabled ? colors.inkMuted : l.fg} />}
        <Txt variant="bodyStrong" color={disabled ? colors.inkMuted : l.fg} align="center">
          {label}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch + 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  disabled: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
});
