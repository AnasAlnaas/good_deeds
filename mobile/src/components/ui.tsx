import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { errorCode } from '@/data/backend';
import { useApp } from '@/state/app';
import { classIcon, className, EVENT_CLASSES, type EventClassId } from '@/theme/classes';
import { colors, fonts, radius, shadow, space, touch } from '@/theme/tokens';
import { Button } from './Button';
import { Txt } from './Txt';

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceAlt }, style]}>
      {children}
    </Pressable>
  );
}

/** A choice among a few. The chosen one is green. `floating` gives it a frosted background for over the map. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  floating,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  floating?: boolean;
}) {
  const fg = selected ? colors.accentInk : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, floating && styles.chipFloating, selected && styles.chipSelected]}>
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Txt variant="caption" color={fg} style={styles.chipText}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** The general filter: all events, or one class of good works. */
export function ClassFilter({
  value,
  onChange,
  floating,
}: {
  value: EventClassId | null;
  onChange(next: EventClassId | null): void;
  floating?: boolean;
}) {
  const { s, lang } = useApp();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filter, floating && styles.filterFloating]}>
      <Chip label={s.map.all} selected={!value} onPress={() => onChange(null)} floating={floating} />
      {EVENT_CLASSES.map((c) => (
        <Chip
          key={c.id}
          label={className(c.id, lang)}
          icon={classIcon(c.id)}
          selected={value === c.id}
          onPress={() => onChange(c.id)}
          floating={floating}
        />
      ))}
    </ScrollView>
  );
}

type IconButtonLook = 'light' | 'dark' | 'accent';
const iconLook: Record<IconButtonLook, { bg: string; fg: string }> = {
  light: { bg: colors.glass, fg: colors.primary },
  dark: { bg: colors.primary, fg: colors.surface },
  accent: { bg: colors.accent, fg: colors.accentInk },
};

/** A round button with only an icon; `label` is what a screen reader says. */
export function IconButton({
  icon,
  label,
  onPress,
  look = 'light',
  size = touch,
  lifted,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  look?: IconButtonLook;
  size?: number;
  lifted?: boolean;
}) {
  const l = iconLook[look];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={size < touch ? (touch - size) / 2 : 0}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: l.bg, opacity: pressed ? 0.75 : 1 },
        lifted && shadow,
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={l.fg} />
    </Pressable>
  );
}

export function Badge({ label, color = colors.primary, icon }: { label: string; color?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      {icon && <Ionicons name={icon} size={14} color={color} />}
      <Txt variant="caption" color={color}>
        {label}
      </Txt>
    </View>
  );
}

export function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.primary} style={styles.infoIcon} />
      <View style={styles.flex}>
        <Txt variant="caption" color={colors.inkMuted}>
          {label}
        </Txt>
        <Txt variant="body">{value}</Txt>
      </View>
    </View>
  );
}

export function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.inkMuted} />
      <Txt align="center" color={colors.inkMuted}>
        {text}
      </Txt>
    </View>
  );
}

/** What a screen shows before its data arrives: a spinner, or why it failed and a way to try again. */
export function QueryState({ query }: { query: UseQueryResult<unknown> }) {
  const { s } = useApp();
  if (query.isError) {
    const code = errorCode(query.error);
    // Trying again helps only when the connection or the server failed, not when a rule refused.
    const retryable = code === 'network' || code === 'internal_error';
    return (
      <View style={styles.empty}>
        <Ionicons name={code === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline'} size={40} color={colors.inkMuted} />
        <Txt align="center" color={colors.inkMuted}>
          {s.errors[code]}
        </Txt>
        {retryable && <Button variant="secondary" icon="refresh" label={s.retry} onPress={() => query.refetch()} />}
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={s.loading} />
    </View>
  );
}

/** A labelled text input. `ltr` keeps numbers (phone, code) left-to-right inside Arabic. */
export function Field({ label, ltr, ...input }: { label: string; ltr?: boolean } & TextInputProps) {
  const { isRTL } = useApp();
  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.inkMuted}
        {...input}
        style={[
          styles.input,
          input.multiline && styles.multiline,
          { textAlign: ltr ? 'left' : isRTL ? 'right' : 'left', writingDirection: ltr ? 'ltr' : undefined },
        ]}
      />
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Txt variant="sectionTitle">{children}</Txt>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md + space.xs,
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipFloating: { backgroundColor: colors.glass },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { lineHeight: 20 },
  filter: { gap: space.sm },
  filterFloating: { paddingHorizontal: space.md },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  infoRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: touch },
  infoIcon: { marginTop: 2 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  field: { gap: space.xs },
  input: {
    minHeight: touch,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.surface,
    paddingHorizontal: space.md,
    fontFamily: fonts.plex400,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 96, paddingVertical: space.sm, textAlignVertical: 'top' },
});
