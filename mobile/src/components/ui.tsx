import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { errorCode } from '@/data/backend';
import { useApp } from '@/state/app';
import { colors, fonts, radius, space, touch } from '@/theme/tokens';
import { Button } from './Button';
import { Txt } from './Txt';

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
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

export function Chip({ label, selected, onPress, dotColor }: { label: string; selected?: boolean; onPress?: () => void; dotColor?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Txt variant="caption" color={selected ? colors.surface : colors.ink} style={styles.chipText}>
        {label}
      </Txt>
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
        style={[styles.input, { textAlign: ltr ? 'left' : isRTL ? 'right' : 'left', writingDirection: ltr ? 'ltr' : undefined }]}
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { lineHeight: 20 },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
    borderColor: colors.border,
    paddingHorizontal: space.md,
    fontFamily: fonts.plex400,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
