import { Ionicons } from '@expo/vector-icons';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { errorCode } from '@/data/backend';
import { useOnline } from '@/data/network';
import { useApp } from '@/state/app';
import { classIcon, className, EVENT_CLASSES, type EventClassId } from '@/theme/classes';
import { cardShadow, colors, fonts, radius, shadow, space, touch } from '@/theme/tokens';
import { Button } from './Button';
import { Txt } from './Txt';

/** `onPressIn`: a finger touched it; enough time to start fetching what it opens. */
export function Card({
  children,
  onPress,
  onPressIn,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
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
  const fg = selected ? colors.surface : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, floating && styles.chipFloating, selected && styles.chipSelected]}>
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Txt variant="caption" color={fg} style={styles.chipText} label>
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
      <Txt variant="caption" color={color} label>
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

/**
 * The shape of a page while its data is on its way: grey blocks where the text
 * and cards will be, gently pulsing. It appears only if the wait is long enough
 * to notice, so a quick answer never flashes it.
 */
export function Skeleton() {
  const { s } = useApp();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View entering={FadeIn.delay(150).duration(200)} accessible accessibilityRole="progressbar" accessibilityLabel={s.loading}>
      <Animated.View style={[styles.skeleton, style]}>
        <View style={[styles.bone, styles.boneTitle]} />
        <View style={[styles.bone, styles.boneCard]} />
        <View style={[styles.bone, styles.boneCardSmall]} />
        <View style={[styles.bone, styles.boneLine]} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A strip saying the phone is offline and what is shown instead, while signed
 * in to the server (the demo needs no internet). It slides in and out.
 */
export function OfflineBanner({ floating }: { floating?: boolean }) {
  const online = useOnline();
  const { s, mode, me } = useApp();
  if (online || mode === 'demo' || !me) return null;
  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.offline, floating && shadow]}
      accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={18} color={colors.surface} />
      <Txt variant="caption" color={colors.surface} style={styles.flex}>
        {s.offline.banner}
      </Txt>
    </Animated.View>
  );
}

/**
 * What a screen shows before its data arrives: the page's shape (Skeleton), or
 * why it failed and a way to try again. Offline, with nothing saved for it yet,
 * it says so; the page then loads by itself when the connection comes back.
 */
export function QueryState({ query }: { query: UseQueryResult<unknown> }) {
  const { s } = useApp();
  const online = useOnline();
  if (!online && !query.data && (query.fetchStatus === 'paused' || errorCode(query.error) === 'network')) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.inkMuted} />
        <Txt align="center" color={colors.inkMuted}>
          {s.offline.nothingSaved}
        </Txt>
      </Animated.View>
    );
  }
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
  return <Skeleton />;
}

/** A labelled text input. `ltr` keeps numbers (phone, code) left-to-right inside Arabic. */
/** `error`: what is wrong with what was typed, shown under the field (null = nothing). */
export function Field({ label, ltr, error, ...input }: { label: string; ltr?: boolean; error?: string | null } & TextInputProps) {
  const { isRTL } = useApp();
  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.inkMuted}
        aria-invalid={!!error}
        {...input}
        style={[
          styles.input,
          input.multiline && styles.multiline,
          !!error && styles.inputError,
          { textAlign: ltr ? 'left' : isRTL ? 'right' : 'left', writingDirection: ltr ? 'ltr' : undefined },
        ]}
      />
      {!!error && (
        <Txt variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}
    </View>
  );
}

/**
 * A password input with a button that shows what was typed (people typing on a
 * phone often want to check). `isNew`: choosing one, so the phone may offer a
 * strong one and remember it.
 */
export function PasswordField({ label, error, isNew, ...input }: { label: string; error?: string | null; isNew?: boolean } & TextInputProps) {
  const { s, isRTL } = useApp();
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <View style={[styles.input, styles.passwordRow, !!error && styles.inputError]}>
        <TextInput
          placeholderTextColor={colors.inkMuted}
          aria-invalid={!!error}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          textContentType={isNew ? 'newPassword' : 'password'}
          {...input}
          style={[styles.passwordInput, { textAlign: isRTL ? 'right' : 'left' }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? s.login.hidePassword : s.login.showPassword}
          onPress={() => setShown(!shown)}
          hitSlop={8}
          style={styles.eye}>
          <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.inkMuted} />
        </Pressable>
      </View>
      {!!error && (
        <Txt variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md + space.xs,
    gap: space.sm,
    ...cardShadow,
  },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipFloating: { backgroundColor: colors.glass },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
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
  skeleton: { gap: space.md },
  bone: { backgroundColor: colors.surface, borderRadius: radius.input },
  boneTitle: { width: '55%', height: 22 },
  boneCard: { height: 132, borderRadius: radius.card },
  boneCardSmall: { height: 84, borderRadius: radius.card },
  boneLine: { width: '80%', height: 16 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    backgroundColor: colors.slate,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  field: { gap: space.xs },
  inputError: { borderColor: colors.danger },
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
  passwordRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 },
  passwordInput: { flex: 1, minHeight: touch, paddingHorizontal: space.md, fontFamily: fonts.plex400, fontSize: 16, color: colors.ink },
  eye: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  multiline: { minHeight: 96, paddingVertical: space.sm, textAlignVertical: 'top' },
});
