import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBack } from '@/lib/goBack';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';
import { Txt } from './Txt';
import { IconButton } from './ui';

interface Props {
  title?: string;
  back?: boolean;
  scroll?: boolean;
  /** false pauses scrolling, e.g. while a finger moves a map inside the page. */
  scrollEnabled?: boolean;
  background?: string;
  footer?: ReactNode;
  children: ReactNode;
}

// Our own header instead of the native one: Expo Go keeps native headers LTR,
// so the back arrow and title would sit on the wrong side in Arabic.
// Every section opens over the map, so a screen with nothing behind it (opened
// from a notification) goes back to the map.
export function Screen({ title, back, scroll = true, scrollEnabled, background = colors.surfaceAlt, footer, children }: Props) {
  const insets = useSafeAreaInsets();
  const { isRTL, s } = useApp();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={[styles.root, { backgroundColor: background, paddingTop: insets.top }]}>
      {(title || back) && (
        <View style={styles.header}>
          {back && (
            <IconButton icon={isRTL ? 'arrow-forward' : 'arrow-back'} label={s.back} look="dark" onPress={() => goBack('/map')} />
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
        {...(scroll ? { scrollEnabled } : null)}
        contentContainerStyle={scroll ? { padding: space.md, paddingBottom: space.xl, gap: space.md } : undefined}>
        {children}
      </Body>
      {footer && <View style={[styles.footer, { backgroundColor: background, paddingBottom: insets.bottom + space.md }]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  title: { flex: 1 },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
  },
});
