import { Pressable, StyleSheet, View } from 'react-native';

import type { EventNoticeItem } from '@/data/api';
import type { NoticeReactionKind } from '@/data/types';
import { num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

const EMOJI: Record<NoticeReactionKind, string> = { like: '👍', noted: '✅', love: '❤️', ameen: '🤲' };

/**
 * The reactions under a notice: each with how many chose it. Tapping one is
 * the person's reaction (replacing an earlier one); tapping it again takes it back.
 */
export function NoticeReactions({ notice, disabled, onReact }: { notice: EventNoticeItem; disabled?: boolean; onReact: (reaction: NoticeReactionKind | null) => void }) {
  const { s } = useApp();
  return (
    <View style={styles.row}>
      {notice.reactions.map(({ reaction, count }) => {
        const mine = notice.my_reaction === reaction;
        return (
          <Pressable
            key={reaction}
            accessibilityRole="button"
            accessibilityLabel={`${s.reactions[reaction]}: ${num(count)}`}
            accessibilityState={{ selected: mine, disabled }}
            disabled={disabled}
            onPress={() => onReact(mine ? null : reaction)}
            style={({ pressed }) => [styles.pill, mine && styles.mine, pressed && styles.pressed]}>
            <Txt>{EMOJI[reaction]}</Txt>
            {count > 0 && (
              <Txt variant="caption" color={mine ? colors.accentInk : colors.inkMuted} tabular>
                {num(count)}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
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
