import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { count, fmt, num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';
import { HIDDEN_LEVELS_SHOWN } from '../../../shared/placeholders';
import type { Level } from '../../../shared/types';

// The road of levels on the profile (owner's decision, 2026-11-18): every
// level with the points that reach it, the ones reached ticked, the next one
// with what is left, and after the tenth a few more that are not set yet,
// dark and flickering, so people look forward to them.

/** A level's name: the one chosen for it (strings.ts levelNames), or its number until then. */
export function useLevelName() {
  const { s } = useApp();
  return (n: number) => s.levelNames[n] ?? fmt(s.profile.level, { n });
}

export function LevelRoad({ levels, total }: { levels: Level[]; total: number }) {
  const { s } = useApp();
  const name = useLevelName();
  const road = [...levels].sort((a, b) => a.min_points - b.min_points).filter((l) => l.min_points > 0);
  const next = road.find((l) => l.min_points > total);
  return (
    <View style={styles.road} accessibilityRole="list">
      {road.map((l) => {
        const reached = total >= l.min_points;
        const isNext = l === next;
        return (
          <View key={l.level} style={[styles.step, reached && styles.reached, isNext && styles.next]}>
            <View style={[styles.dot, reached && styles.dotReached]}>
              {reached ? (
                <Ionicons name="checkmark" size={16} color={colors.accentInk} />
              ) : (
                <Txt variant="caption" color={colors.inkMuted} tabular>
                  {num(l.level)}
                </Txt>
              )}
            </View>
            <View style={styles.flex}>
              <Txt variant="bodyStrong" color={reached || isNext ? colors.ink : colors.inkMuted}>
                {name(l.level)}
              </Txt>
              <Txt variant="caption" color={colors.inkMuted}>
                {isNext ? fmt(s.levelRoad.left, { n: count(l.min_points - total, s.units.point) }) : count(l.min_points, s.units.point)}
                {l.can_create_events && !levels.some((x) => x.can_create_events && x.min_points < l.min_points) ? ` · ${s.levelRoad.unlocksEvents}` : ''}
              </Txt>
            </View>
          </View>
        );
      })}
      {Array.from({ length: HIDDEN_LEVELS_SHOWN }, (_, i) => (
        <HiddenLevel key={i} />
      ))}
    </View>
  );
}

const GLYPHS = '؟٭✦◆▓▒░#%&@٪*';

/** A level still to come: dark, with a name that keeps flickering. */
function HiddenLevel() {
  const { s } = useApp();
  const [text, setText] = useState('؟؟؟؟؟');
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      timer = setInterval(() => {
        setText(Array.from({ length: 5 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''));
      }, 140 + Math.floor(Math.random() * 80));
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);
  return (
    <View style={[styles.step, styles.hidden]} accessible accessibilityLabel={s.levelRoad.hidden}>
      <View style={[styles.dot, styles.dotHidden]}>
        <Ionicons name="lock-closed" size={14} color={colors.surface} />
      </View>
      <View style={styles.flex}>
        <Txt variant="bodyStrong" color={colors.surface}>
          {text}
        </Txt>
        <Txt variant="caption" color={colors.surface} style={styles.dim}>
          {s.levelRoad.hidden}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  road: { gap: space.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.card },
  reached: { backgroundColor: colors.surfaceAlt },
  next: { borderWidth: 1, borderColor: colors.accent },
  hidden: { backgroundColor: colors.ink, opacity: 0.85 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.inkMuted,
  },
  dotReached: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotHidden: { borderColor: colors.surface },
  flex: { flex: 1, gap: 2 },
  dim: { opacity: 0.7 },
});
