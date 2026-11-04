import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import type { EventNoticeItem } from '@/data/api';
import type { NoticeReactionKind } from '@/data/types';
import { num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

const EMOJI: Record<NoticeReactionKind, string> = { noted: '✅', agree: '👍', disagree: '👎', undecided: '🤔', sad: '😢' };

/** The notice as it is once the person's reaction is `reaction` (null: taken back), to show before the server answers. */
export function withReaction(notice: EventNoticeItem, reaction: NoticeReactionKind | null): EventNoticeItem {
  const before = notice.my_reaction;
  return {
    ...notice,
    my_reaction: reaction,
    reactions: notice.reactions.map((r) => ({
      ...r,
      count: r.count - (r.reaction === before ? 1 : 0) + (r.reaction === reaction ? 1 : 0),
    })),
  };
}

/**
 * The reactions under a notice (an announcement's, or a question's answers),
 * each with its word and how many chose it. Tapping one is the person's
 * reaction (replacing an earlier one); tapping it again takes it back.
 */
export function NoticeReactions({ notice, disabled, onReact }: { notice: EventNoticeItem; disabled?: boolean; onReact: (reaction: NoticeReactionKind | null) => void }) {
  const { s } = useApp();
  return (
    <View style={styles.row}>
      {notice.reactions.map(({ reaction, count }) => {
        const mine = notice.my_reaction === reaction;
        return (
          <Pill
            key={reaction}
            mine={mine}
            disabled={disabled}
            label={`${s.reactions[reaction]}: ${num(count)}`}
            onPress={() => onReact(mine ? null : reaction)}>
            <Txt>{EMOJI[reaction]}</Txt>
            <Txt variant="caption" color={mine ? colors.accentInk : colors.ink} label>
              {s.reactions[reaction]}
            </Txt>
            {count > 0 && (
              <Txt variant="caption" color={mine ? colors.accentInk : colors.inkMuted} tabular>
                {num(count)}
              </Txt>
            )}
          </Pill>
        );
      })}
    </View>
  );
}

// A pill gives a small bounce when it becomes the person's reaction.
function Pill({ mine, disabled, label, onPress, children }: { mine: boolean; disabled?: boolean; label: string; onPress(): void; children: ReactNode }) {
  const scale = useSharedValue(1);
  const was = useRef(mine);
  useEffect(() => {
    if (mine && !was.current) scale.set(withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { damping: 12, stiffness: 260 })));
    was.current = mine;
  }, [mine, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: mine, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.pill, mine && styles.mine, pressed && styles.pressed]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: {
    minHeight: 36,
    minWidth: 48,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  mine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pressed: { opacity: 0.7 },
});
