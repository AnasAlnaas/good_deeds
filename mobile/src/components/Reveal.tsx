import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { space } from '@/theme/tokens';

// A part of a page that appears once it is needed and leaves when it is not: a
// form's next section, the fields of a choice. The page opens to make room and
// what is below slides down; the part itself fades in a moment later, rising a
// little into place. Leaving is the same backwards, and quicker.
//
// It stands directly in a column with a gap (a Screen's body): while closed it
// takes no room at all, not even the gap. What it holds is laid out at its full
// height the whole time, so it never reflows as it opens.
//
// With the system's reduce-motion setting on, it appears and leaves at once.

const OPEN_MS = 460;
const CLOSE_MS = 280;
const RESIZE_MS = 240;
/** A change of height smaller than this is followed at once: a text field growing by a line. */
const RESIZE_FROM = 30;
/** How far it rises into place. */
const RISE = 10;
// Room kept inside the clipped box, so a card's shadow or a field's outline is not cut at its edges.
const BLEED_X = space.md;
const BLEED_Y = space.sm;

const OPEN = Easing.bezier(0.22, 1, 0.36, 1);
const CLOSE = Easing.bezier(0.4, 0, 0.6, 1);

interface Props {
  show: boolean;
  /** Waits this long before opening, so parts that appear together follow one another. */
  delay?: number;
  /** The gap of the column it stands in. */
  gap?: number;
  style?: ViewStyle;
  children: ReactNode;
}

export function Reveal({ show, delay = 0, gap = space.md, style, children }: Props) {
  const reduced = useReducedMotion();
  // Kept on the page while it closes; off it afterwards.
  const [mounted, setMounted] = useState(show);
  const progress = useSharedValue(show ? 1 : 0);
  // The height of what it holds; -1 = not measured yet.
  const height = useSharedValue(-1);
  const wanted = useRef(show);

  if (show && !mounted) setMounted(true);

  useEffect(() => {
    wanted.current = show;
    if (!mounted) return;
    // Closed, unless it was asked back meanwhile.
    const closed = () => {
      if (!wanted.current) setMounted(false);
    };
    if (show) {
      progress.set(reduced ? 1 : withDelay(delay, withTiming(1, { duration: OPEN_MS, easing: OPEN })));
    } else if (reduced) {
      progress.set(0);
      closed();
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: CLOSE }, (finished) => {
          if (finished) scheduleOnRN(closed);
        }),
      );
    }
  }, [show, mounted, reduced, delay, progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    const now = height.get();
    if (now < 0 || reduced || Math.abs(next - now) < RESIZE_FROM) height.set(next);
    // What it holds grew or shrank (a list gained a row, other choices came): the page follows smoothly.
    else height.set(withTiming(next, { duration: RESIZE_MS, easing: OPEN }));
  };

  const box = useAnimatedStyle(() => {
    const p = progress.get();
    const h = height.get();
    return {
      // Before the first measure: closed, or, when it starts open, as tall as what it holds.
      height: h < 0 ? (p === 1 ? undefined : 0) : h * p,
      // Closed, it takes back the column's gap as well.
      marginBottom: -BLEED_Y - (gap - 2 * BLEED_Y) * (1 - p),
    };
  });
  const body = useAnimatedStyle(() => {
    const p = progress.get();
    // The room opens first; what it holds arrives over the rest of the way.
    const seen = Math.min(1, Math.max(0, (p - 0.3) / 0.7));
    return { opacity: seen, transform: [{ translateY: (1 - seen) * RISE }] };
  });

  if (!mounted) return null;
  return (
    <Animated.View style={[styles.box, !show && styles.leaving, box]}>
      <Animated.View style={[styles.body, { gap }, style, body]} onLayout={onLayout}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', marginHorizontal: -BLEED_X, marginTop: -BLEED_Y },
  // Nothing in it answers a touch while it leaves.
  leaving: { pointerEvents: 'none' },
  body: { paddingHorizontal: BLEED_X, paddingVertical: BLEED_Y },
});
