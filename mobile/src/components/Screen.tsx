import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/app';
import { colors, space, touch } from '@/theme/tokens';
import { Txt } from './Txt';

interface Props {
  title?: string;
  back?: boolean;
  scroll?: boolean;
  background?: string;
  footer?: ReactNode;
  children: ReactNode;
}

// Our own header instead of the native one: Expo Go keeps native headers LTR,
// so the back arrow and title would sit on the wrong side in Arabic.
export function Screen({ title, back, scroll = true, background = colors.surface, footer, children }: Props) {
  const insets = useSafeAreaInsets();
  const { isRTL, s } = useApp();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: insets.top }]}>
      {(title || back) && (
        <View style={styles.header}>
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.back}
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={8}>
              <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.primary} />
            </Pressable>
          )}
          {title && (
            <Txt variant={back ? 'sectionTitle' : 'screenTitle'} style={styles.title} numberOfLines={2}>
              {title}
            </Txt>
          )}
        </View>
      )}
      <Body
        style={styles.body}
        contentContainerStyle={scroll ? { padding: space.md, paddingBottom: space.xl, gap: space.md } : undefined}>
        {children}
      </Body>
      {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center', marginStart: -space.sm },
  title: { flex: 1 },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
