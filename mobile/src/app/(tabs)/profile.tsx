import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PillarBar } from '@/components/PillarBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState, SectionTitle } from '@/components/ui';
import { useMeSummary } from '@/data/queries';
import { count, fmt, num } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';

// Keeps a phone number left-to-right inside Arabic text (DESIGN.md: isolate Latin and digits).
const ltr = (text: string) => `⁦${text}⁩`;

export default function ProfileScreen() {
  const { s } = useApp();
  const summary = useMeSummary();
  if (!summary.data) {
    return (
      <Screen title={s.tabs.profile}>
        <QueryState query={summary} />
      </Screen>
    );
  }
  const { user: me, total_points: total, level, next_level: next, points_by_pillar } = summary.data;
  const progress = next ? (total - level.min_points) / (next.min_points - level.min_points) : 1;

  return (
    <Screen title={s.tabs.profile}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Txt variant="screenTitle" color={colors.primary} align="center">
            {me.full_name.charAt(0)}
          </Txt>
        </View>
        <View style={styles.flex}>
          <Txt variant="sectionTitle">{me.full_name}</Txt>
          <View style={styles.badges}>
            <Badge label={s.role[me.role]} />
            {me.is_association_member && <Badge label={s.profile.member} color={colors.inkMuted} />}
          </View>
        </View>
      </View>

      <Card>
        <View style={styles.levelRow}>
          <Txt variant="sectionTitle">{fmt(s.profile.level, { n: level.level })}</Txt>
          <Txt variant="metric" tabular>
            {num(total)}
          </Txt>
        </View>
        <View style={styles.track}>
          <View style={[styles.progress, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Txt variant="caption" color={colors.inkMuted}>
          {next
            ? fmt(s.profile.toNext, { n: count(next.min_points - total, s.units.point), level: next.level })
            : s.profile.maxLevel}
        </Txt>
      </Card>

      <SectionTitle>{s.profile.distribution}</SectionTitle>
      {total > 0 ? (
        <PillarBar values={points_by_pillar} height={18} />
      ) : (
        <Txt color={colors.inkMuted}>{s.profile.noPoints}</Txt>
      )}

      <Card>
        <InfoRow icon="call-outline" label={s.profile.phone} value={ltr(me.phone)} />
        <InfoRow icon="business-outline" label={s.profile.city} value={me.city} />
      </Card>

      <Button variant="secondary" icon="settings-outline" label={s.profile.settings} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: space.xs },
  badges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Level progress uses navy, never a pillar colour (DESIGN.md: pillar colours are for pillars only).
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: colors.primary },
});
