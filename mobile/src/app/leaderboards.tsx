import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Chip, EmptyState, QueryState } from '@/components/ui';
import { useInstitutions, useLeaderboard } from '@/data/queries';
import { count, fmt, num } from '@/i18n/format';
import { useApp, useMe } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';

// Leaderboards (owner's decisions, 2026-11-20): this month's confirmed hours,
// the whole association's or within one of the person's institutions. Only
// those who chose to are listed; anyone may look.
export default function LeaderboardsScreen() {
  const { s } = useApp();
  const me = useMe();
  const { run, busy } = useAction();
  const institutions = useInstitutions();
  const [scope, setScope] = useState<string | null>(null);
  const query = useLeaderboard(scope);
  const mine = (institutions.data?.mine ?? []).filter((x) => x.status === 'confirmed' && x.institution.status === 'approved');
  const setShown = (show: boolean) => run((b) => b.updateProfile({ show_on_leaderboards: show }));

  const chips =
    mine.length > 0 ? (
      <View style={styles.chips}>
        <Chip label={s.leaderboards.association} selected={!scope} onPress={() => setScope(null)} />
        {mine.map((x) => (
          <Chip key={x.institution.id} label={x.institution.name} selected={scope === x.institution.id} onPress={() => setScope(x.institution.id)} />
        ))}
      </View>
    ) : null;

  if (!query.data) {
    return (
      <Screen back title={s.leaderboards.title}>
        {chips}
        <QueryState query={query} />
      </Screen>
    );
  }

  const board = query.data;
  const shown = board.me.shown;
  return (
    <Screen back title={s.leaderboards.title}>
      {chips}
      <Txt variant="caption" color={colors.inkMuted}>
        {s.leaderboards.month}
      </Txt>

      <Card style={styles.mine}>
        <Txt variant="bodyStrong">{fmt(s.leaderboards.yourHours, { hours: count(board.me.hours, s.units.hour) })}</Txt>
        {shown && board.me.rank && <Txt color={colors.primary}>{fmt(s.leaderboards.yourRank, { rank: num(board.me.rank) })}</Txt>}
        {!shown && <Txt color={colors.inkMuted}>{s.leaderboards.hidden}</Txt>}
        <Button
          variant={shown ? 'quiet' : 'secondary'}
          icon={shown ? 'eye-off-outline' : 'eye-outline'}
          label={shown ? s.leaderboards.hideMe : s.leaderboards.showMe}
          disabled={busy}
          onPress={() => setShown(!shown)}
        />
      </Card>

      {board.rows.length === 0 && <EmptyState icon="trophy-outline" text={s.leaderboards.empty} />}
      {board.rows.map((r) => (
        <Pressable
          key={r.user.id}
          accessibilityRole="button"
          onPress={() => router.push(`/person/${r.user.id}`)}
          style={[styles.row, r.user.id === me.id && styles.rowMine]}>
          <Txt variant="bodyStrong" color={r.rank <= 3 ? colors.accent : colors.inkMuted} tabular style={styles.rank}>
            {num(r.rank)}
          </Txt>
          <Avatar user={r.user} size={36} />
          <Txt variant="bodyStrong" style={styles.flex} numberOfLines={1}>
            {r.user.id === me.id ? `${r.user.full_name} (${s.leaderboards.you})` : r.user.full_name}
          </Txt>
          <Txt variant="bodyStrong" color={colors.primary} tabular>
            {count(r.hours, s.units.hour)}
          </Txt>
        </Pressable>
      ))}
      <Txt variant="caption" align="center" color={colors.inkMuted}>
        {s.leaderboards.note}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  mine: { gap: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMine: { borderColor: colors.accent, borderWidth: 2 },
  rank: { width: 28, textAlign: 'center' },
  flex: { flex: 1 },
});
