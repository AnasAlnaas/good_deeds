import { router } from 'expo-router';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState } from '@/components/ui';
import { useMeSummary } from '@/data/queries';
import { count, fmt, num } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { type PhotoSource, pickPhoto } from '@/lib/photo';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';

// Keeps a phone number left-to-right inside Arabic text (DESIGN.md: isolate Latin and digits).
const ltr = (text: string) => `⁦${text}⁩`;

export default function ProfileScreen() {
  const { s } = useApp();
  const summary = useMeSummary();
  const { run, busy } = useAction();

  const applyPhoto = async (source: PhotoSource) => {
    let photo: string | 'denied' | null;
    try {
      photo = await pickPhoto(source);
    } catch {
      photo = null; // the picker or the resizing failed: nothing changes
    }
    if (photo === 'denied') dialog.notify(s.profile.photoFrom, s.profile.cameraDenied);
    else if (photo) await run((b) => b.setPhoto(photo));
  };
  // Camera or photos is a choice of three buttons, which no browser dialog has (src/lib/dialog.web.ts).
  // In a browser the file picker opens at once; on a phone it offers the camera too.
  const choosePhoto = () =>
    Platform.OS === 'web'
      ? applyPhoto('library')
      : Alert.alert(s.profile.photoFrom, s.profile.photoWho, [
          { text: s.cancel, style: 'cancel' },
          { text: s.profile.camera, onPress: () => applyPhoto('camera') },
          { text: s.profile.library, onPress: () => applyPhoto('library') },
        ]);
  const removePhoto = () =>
    dialog.confirm({
      title: s.profile.removeTitle,
      message: s.profile.removeBody,
      cancel: s.cancel,
      action: s.profile.removePhoto,
      destructive: true,
      onConfirm: () => run((b) => b.removePhoto()),
    });
  if (!summary.data) {
    return (
      <Screen back title={s.tabs.profile}>
        <QueryState query={summary} />
      </Screen>
    );
  }
  const { user: me, total_points: total, level, next_level: next } = summary.data;
  const progress = next ? (total - level.min_points) / (next.min_points - level.min_points) : 1;
  const unlockLevel = summary.data.create_events_level;

  return (
    <Screen back title={s.tabs.profile}>
      <View style={styles.head}>
        <View>
          <Avatar user={me} size={72} />
          {busy && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} accessibilityLabel={s.loading} />}
        </View>
        <View style={styles.flex}>
          <Txt variant="sectionTitle">{me.full_name}</Txt>
          <View style={styles.badges}>
            <Badge label={s.role[me.role]} />
            {me.is_association_member && <Badge label={s.profile.member} color={colors.inkMuted} />}
          </View>
        </View>
      </View>
      <View style={styles.photoActions}>
        <Button
          variant="quiet"
          icon="camera-outline"
          label={me.avatar_url ? s.profile.changePhoto : s.profile.addPhoto}
          disabled={busy}
          onPress={choosePhoto}
        />
        {me.avatar_url && <Button variant="quiet" icon="trash-outline" label={s.profile.removePhoto} disabled={busy} onPress={removePhoto} />}
      </View>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.profile.photoWho}
      </Txt>

      <View style={styles.level}>
        <View style={styles.levelRow}>
          <Txt variant="sectionTitle" color={colors.accentInk}>
            {fmt(s.profile.level, { n: level.level })}
          </Txt>
          <Txt variant="hero" color={colors.accentInk} tabular>
            {num(total)}
          </Txt>
        </View>
        <ProgressBar value={progress} height={10} onAccent />
        <Txt variant="caption" color={colors.accentInk}>
          {next
            ? fmt(s.profile.toNext, { n: count(next.min_points - total, s.units.point), level: next.level })
            : s.profile.maxLevel}
        </Txt>
        {summary.data.can_create_events ? (
          <Button icon="add-circle-outline" label={s.events.propose} onPress={() => router.push('/event/new')} />
        ) : (
          unlockLevel !== null && (
            <Txt variant="caption" color={colors.accentInk}>
              {fmt(s.profile.createUnlock, { level: unlockLevel })}
            </Txt>
          )
        )}
      </View>

      <Card>
        <InfoRow icon="call-outline" label={s.profile.phone} value={ltr(me.phone)} />
        <InfoRow icon="business-outline" label={s.profile.city} value={me.city} />
      </Card>
      <Button variant="secondary" icon="create-outline" label={s.profile.edit} onPress={() => router.push('/edit-profile')} />

      {summary.data.warnings > 0 && (
        <Button
          variant="secondary"
          icon="alert-circle-outline"
          label={fmt(s.profile.warnings, { n: summary.data.warnings })}
          onPress={() => router.push('/warnings')}
        />
      )}
      {summary.data.can_report && (
        <Button variant="secondary" icon="flag-outline" label={s.profile.reports} onPress={() => router.push('/reports')} />
      )}
      <Button variant="secondary" icon="settings-outline" label={s.profile.settings} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: -space.sm },
  flex: { flex: 1, gap: space.xs },
  badges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  level: { backgroundColor: colors.accent, borderRadius: radius.card, padding: space.md + space.xs, gap: space.sm },
  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
