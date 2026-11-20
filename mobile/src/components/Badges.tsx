import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import type { BadgeItem } from '@/data/api';
import { day } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';
import { BADGES, badgeDef, badgeHow, badgeName, type BadgeKind } from '../../../shared/badges';

type IconName = keyof typeof Ionicons.glyphMap;

/** Each kind's picture; a class badge grows from a seed to a tree (owner's choice: Seed → Tree → Forest). */
function badgeIcon(id: string): IconName {
  const b = badgeDef(id);
  const icons: Record<BadgeKind, IconName> = {
    events: 'ribbon',
    class: 'leaf',
    variety: 'color-palette',
    streak: 'flame',
    lessons: 'school',
    ramadan: 'moon',
    dhul_hijjah: 'sunny',
  };
  if (b?.kind === 'class') return b.step === 1 ? 'ellipse' : b.step === 2 ? 'leaf-outline' : 'leaf';
  return b ? icons[b.kind] : 'ribbon';
}

export function BadgeMedal({ id, size = 48, locked }: { id: string; size?: number; locked?: boolean }) {
  return (
    <View style={[styles.medal, { width: size, height: size, borderRadius: size / 2 }, locked && styles.medalLocked]}>
      <Ionicons name={badgeIcon(id)} size={size * 0.5} color={locked ? colors.inkMuted : colors.accent} />
    </View>
  );
}

/** The badges earned, each with its name; tapping one says what earned it. `all` shows those not earned too, dimmed. */
export function BadgeGrid({ badges, all }: { badges: BadgeItem[]; all?: boolean }) {
  const { s, lang, now } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const earned = new Map(badges.map((b) => [b.badge_id, b]));
  const ids = all ? BADGES.map((b) => b.id) : badges.map((b) => b.badge_id);
  if (ids.length === 0) return <Txt color={colors.inkMuted}>{s.badges.none}</Txt>;
  const shown = open ? earned.get(open) : undefined;
  return (
    <>
      <View style={styles.grid}>
        {ids.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={badgeName(id, lang)}
            onPress={() => setOpen(open === id ? null : id)}
            style={[styles.cell, open === id && styles.cellOpen]}>
            <BadgeMedal id={id} locked={!earned.has(id)} />
            <Txt variant="caption" align="center" numberOfLines={2} color={earned.has(id) ? colors.ink : colors.inkMuted}>
              {badgeName(id, lang)}
            </Txt>
          </Pressable>
        ))}
      </View>
      {open && (
        <View style={styles.detail}>
          <Txt variant="bodyStrong">{badgeName(open, lang)}</Txt>
          <Txt color={colors.inkMuted}>{badgeHow(open, lang)}</Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {shown ? s.badges.earnedOn.replace('{day}', day(shown.earned_at, s, now)) : s.badges.locked}
          </Txt>
        </View>
      )}
    </>
  );
}

/**
 * Owner's decision (2026-11-20): a new badge is celebrated the next time the
 * app is opened (a push also tells them). Closing it marks them seen.
 */
export function BadgeCelebration({ ids }: { ids: string[] }) {
  const { s, lang } = useApp();
  const { run } = useAction();
  const [closed, setClosed] = useState(false);
  if (ids.length === 0 || closed) return null;
  const close = () => {
    setClosed(true);
    void run((b) => b.markBadgesSeen());
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.medals}>
            {ids.slice(0, 4).map((id) => (
              <BadgeMedal key={id} id={id} size={72} />
            ))}
          </View>
          <Txt variant="screenTitle" align="center">
            {ids.length > 1 ? s.badges.celebrateMany : s.badges.celebrateTitle}
          </Txt>
          {ids.map((id) => (
            <Txt key={id} variant="bodyStrong" align="center" color={colors.primary}>
              {badgeName(id, lang)}
            </Txt>
          ))}
          <Txt align="center" color={colors.inkMuted}>
            {s.badges.celebrateBody}
          </Txt>
          <Button icon="heart-outline" label={s.badges.celebrateOk} onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: 92, alignItems: 'center', gap: space.xs, padding: space.xs, borderRadius: radius.input },
  cellOpen: { backgroundColor: colors.primarySoft },
  medal: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.accent },
  medalLocked: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: 0.6 },
  detail: { gap: space.xs, paddingTop: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.sm, alignSelf: 'stretch', maxWidth: 420 },
  medals: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.sm },
});
