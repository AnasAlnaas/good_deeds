import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMeSummary } from '@/data/queries';
import { useApp } from '@/state/app';
import { colors, fonts, radius, shadow, space } from '@/theme/tokens';

// The floating bar of the main screens: map, events and activity. It is drawn
// once, over the whole stack (app/_layout.tsx), so it stays put while the
// screens change under it: the chosen item grows into a forest pill with its
// name, the others shrink back to icons. It rises in on a main screen, sinks
// away on any other (an event, a form), and tucks itself away while a list is
// scrolled down, coming back as soon as it is scrolled up.

/** The island's height. Screens under it keep this much (plus the safe area) clear at the bottom. */
export const NAV_HEIGHT = 64;
/** The gap between the island and the bottom of the screen (above the safe area). */
export const NAV_GAP = space.md;

const MAIN = ['/map', '/events', '/activity'] as const;
type MainPath = (typeof MAIN)[number];
const ICONS: Record<MainPath, { off: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap }> = {
  '/map': { off: 'map-outline', on: 'map' },
  '/events': { off: 'list-outline', on: 'list' },
  '/activity': { off: 'pulse-outline', on: 'pulse' },
};
const SPRING = { damping: 18, stiffness: 220, mass: 0.9 };

export const isMainPath = (path: string): path is MainPath => (MAIN as readonly string[]).includes(path);

// ---------- scrolling tucks the island away ----------

const TuckContext = createContext<SharedValue<number> | null>(null);

export function NavIslandProvider({ children }: { children: ReactNode }) {
  const tucked = useSharedValue(0);
  return <TuckContext.Provider value={tucked}>{children}</TuckContext.Provider>;
}

/**
 * For a main screen's list: pass the result to the ScrollView's onScroll (with
 * scrollEventThrottle 16). Scrolling down tucks the island away, scrolling up
 * or reaching the top brings it back.
 */
export function useNavIslandScroll() {
  const tucked = useContext(TuckContext);
  const last = useRef(0);
  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!tucked) return;
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - last.current;
      last.current = y;
      const bottom = e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height - y;
      // At the top, or at the very end of the list (nothing more to read under it), it shows.
      if (y < 24 || bottom < 24) tucked.set(withTiming(0, { duration: 220 }));
      else if (dy > 6) tucked.set(withTiming(1, { duration: 260 }));
      else if (dy < -6) tucked.set(withTiming(0, { duration: 220 }));
    },
    [tucked],
  );
}

/** Space a main screen keeps clear at its bottom, under the island. */
export function useNavIslandInset() {
  const insets = useSafeAreaInsets();
  return useMemo(() => insets.bottom + NAV_GAP + NAV_HEIGHT + space.md, [insets.bottom]);
}

// ---------- the island ----------

export function NavIsland() {
  const { s, me } = useApp();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const tucked = useContext(TuckContext);
  const canPropose = (useMeSummary().data?.can_create_events ?? false) && !!me;

  const visible = !!me && isMainPath(pathname);
  // While it is hidden, the last main screen stays chosen, so it sinks and rises unchanged.
  const [current, setCurrent] = useState<MainPath>('/map');
  if (isMainPath(pathname) && pathname !== current) setCurrent(pathname);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(reduced ? (visible ? 1 : 0) : withSpring(visible ? 1 : 0, SPRING));
    // A new screen starts with the island out.
    tucked?.set(withTiming(0, { duration: 200 }));
  }, [visible, pathname, reduced, shown, tucked]);

  const away = NAV_HEIGHT + insets.bottom + NAV_GAP + 24;
  const island = useAnimatedStyle(() => {
    const out = Math.max(1 - shown.get(), tucked?.get() ?? 0);
    return {
      opacity: interpolate(out, [0, 0.8, 1], [1, 0.6, 0]),
      transform: [{ translateY: out * away }, { scale: interpolate(out, [0, 1], [1, 0.9]) }],
    };
  });

  // The map is the home: from it, the others open on top; between them, one replaces the other.
  const go = (to: MainPath) => {
    if (to === pathname) return;
    if (to === '/map') router.dismissTo('/map');
    else if (pathname === '/map') router.push(to);
    else router.replace(to);
  };

  const labels: Record<MainPath, string> = { '/map': s.tabs.map, '/events': s.tabs.events, '/activity': s.tabs.activity };

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.wrap, { bottom: insets.bottom + NAV_GAP }, island]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      <Animated.View
        layout={reduced ? undefined : LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)}
        style={[styles.island, shadow]}
        accessibilityRole="tablist"
        accessibilityLabel={s.map.nav}>
        {MAIN.map((path) => (
          <Item key={path} path={path} label={labels[path]} active={current === path} reduced={reduced} onPress={() => go(path)} />
        ))}
        {canPropose && (
          <Animated.View entering={reduced ? undefined : FadeIn.delay(150).duration(250)} exiting={FadeOut.duration(120)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.map.propose}
              onPress={() => router.push('/event/new')}
              style={({ pressed }) => [styles.propose, pressed && styles.pressed]}>
              <Ionicons name="add" size={26} color={colors.accentInk} />
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Item({ path, label, active, reduced, onPress }: { path: MainPath; label: string; active: boolean; reduced: boolean; onPress: () => void }) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.set(reduced ? (active ? 1 : 0) : withSpring(active ? 1 : 0, SPRING));
  }, [active, reduced, on]);

  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], ['rgba(30, 94, 59, 0)', colors.primary]),
  }));
  // The chosen icon gives a small hop as it is picked.
  const icon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(on.get(), [0, 0.6, 1], [1, 1.18, 1.04]) }, { translateY: interpolate(on.get(), [0, 0.6, 1], [0, -2, 0]) }],
  }));
  const offIcon = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const onIcon = useAnimatedStyle(() => ({ opacity: on.get() }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Animated.View layout={reduced ? undefined : LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)} style={[styles.item, pill]}>
        <Animated.View style={[styles.icon, icon]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, offIcon]}>
            <Ionicons name={ICONS[path].off} size={22} color={colors.primary} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, onIcon]}>
            <Ionicons name={ICONS[path].on} size={22} color={colors.surface} />
          </Animated.View>
        </Animated.View>
        {active && (
          <Animated.Text
            entering={reduced ? undefined : FadeIn.delay(90).duration(200)}
            exiting={reduced ? undefined : FadeOut.duration(90)}
            numberOfLines={1}
            style={styles.label}>
            {label}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
  island: {
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  item: {
    height: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  icon: { width: 22, height: 22 },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.plex600, fontSize: 15, lineHeight: 20, color: colors.surface, maxWidth: 140 },
  propose: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginStart: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  pressed: { transform: [{ scale: 0.92 }] },
});
