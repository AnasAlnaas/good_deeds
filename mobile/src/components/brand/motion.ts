import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Every motion graphic runs on one clock instead of a pile of separate
// animations: `t` counts milliseconds of the intro (0 → duration, once), then
// `idle` loops 0 → 1 forever for the quiet after-motion. Each part reads its own
// window of the clock with `seg`, so timing lives in one readable list.
//
// play=false rewinds to the empty first frame (use it for slides that are not
// on screen yet, so they play when they arrive). With the system's reduce-motion
// setting on, it jumps straight to the finished frame and stays still.

export interface MotionProps {
  // Width in points; height follows the graphic's own ratio.
  size?: number;
  play?: boolean;
  onDone?: () => void;
}

export function useTimeline(play: boolean, duration: number, idleMs: number, onDone?: () => void) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const idle = useSharedValue(0);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const done = () => doneRef.current?.();
    cancelAnimation(t);
    cancelAnimation(idle);
    idle.set(0);
    if (!play) {
      t.set(0);
      return;
    }
    if (reduced) {
      t.set(duration);
      done();
      return;
    }
    t.set(0);
    t.set(
      withTiming(duration, { duration, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
    idle.set(withDelay(duration, withRepeat(withTiming(1, { duration: idleMs, easing: Easing.linear }), -1, false)));
  }, [play, reduced, duration, idleMs, t, idle]);

  return { t, idle, still: reduced };
}

export const ease = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  in: Easing.in(Easing.quad),
  pop: Easing.out(Easing.back(1.8)),
  soft: Easing.out(Easing.back(1.2)),
  linear: Easing.linear,
};

// 0 → 1 across [from, to] ms of the clock, eased, clamped outside it.
// Without `fn` it is ease.out, written out here: a release build does not carry
// what a worklet's default parameter refers to (`ease`) to the UI thread, and
// the app crashed on its first animation ("Property 'ease' doesn't exist").
export const seg = (t: number, from: number, to: number, fn?: (x: number) => number) => {
  'worklet';
  const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return fn ? fn(x) : 1 - Math.pow(1 - x, 3);
};

export function lerp(a: number, b: number, x: number) {
  'worklet';
  return a + (b - a) * x;
}

// A smooth 0 → 1 → 0 wave over one idle loop, offset by `phase` (0–1).
export function wave(idle: number, phase = 0) {
  'worklet';
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * ((idle + phase) % 1));
}
