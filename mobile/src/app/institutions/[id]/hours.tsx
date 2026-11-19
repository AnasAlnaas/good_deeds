import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ClaimStatus } from '@/components/ClaimStatus';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Field, QueryState, SectionTitle } from '@/components/ui';
import type { OutsideHoursItem } from '@/data/api';
import { useInstitutionOutsideHours } from '@/data/queries';
import { date, fmt } from '@/i18n/format';
import { durationText } from '@/lib/duration';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, radius, space } from '@/theme/tokens';
import { OUTSIDE_HOURS_NOTE_MAX } from '../../../../../shared/rules';

// An institution's representative: hours its members did for it outside the
// app's events (owner's decisions, 2026-11-19). Approved, they earn points.
export default function InstitutionOutsideHoursScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, photoSource } = useApp();
  const query = useInstitutionOutsideHours(id);
  const { run, busy } = useAction();
  // The claim being turned down, and its reason (owner's decision: a reason is required).
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (!query.data) {
    return (
      <Screen back title={s.outsideHours.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const waiting = query.data.filter((x) => x.claim.status === 'pending');
  const decided = query.data.filter((x) => x.claim.status !== 'pending');
  const reject = async (x: OutsideHoursItem) => {
    if (await run((b) => b.decideOutsideHours(id, x.claim.id, { decision: 'rejected', note: reason.trim() }))) {
      setRejecting(null);
      setReason('');
    }
  };

  const claimCard = (x: OutsideHoursItem, actions: boolean) => (
    <Card key={x.claim.id}>
      <View style={styles.row}>
        <Avatar user={x.user} size={40} />
        <View style={styles.flex}>
          <Txt variant="bodyStrong">{x.user.full_name}</Txt>
          <Txt variant="caption" color={colors.inkMuted}>
            {date(`${x.claim.done_on}T12:00:00`, s)}
            {x.claim.place ? ` · ${x.claim.place}` : ''}
          </Txt>
        </View>
        {actions ? (
          <Txt variant="bodyStrong" color={colors.primary}>
            {durationText(x.claim.minutes, s)}
          </Txt>
        ) : (
          <ClaimStatus item={x} s={s} />
        )}
      </View>
      <Txt>{x.claim.description}</Txt>
      {!actions && (
        <Txt variant="caption" color={colors.inkMuted}>
          {durationText(x.claim.minutes, s)}
          {x.decided_by ? ` · ${fmt(s.outsideHours.decidedBy, { name: x.decided_by.full_name })}` : ''}
        </Txt>
      )}
      {x.image && <Image source={photoSource(x.image.url)} style={[styles.photo, { aspectRatio: x.image.width / x.image.height }]} contentFit="cover" />}
      {!actions && x.claim.decision_note && <Txt color={colors.inkMuted}>{fmt(s.outsideHours.reason, { note: x.claim.decision_note })}</Txt>}
      {actions && rejecting === x.claim.id && (
        <>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.outsideHours.rejectBody}
          </Txt>
          <Field label={s.outsideHours.rejectReason} value={reason} onChangeText={setReason} maxLength={OUTSIDE_HOURS_NOTE_MAX} multiline />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button variant="danger" icon="close" label={s.outsideHours.reject} disabled={busy || !reason.trim()} onPress={() => reject(x)} />
            </View>
            <View style={styles.flex}>
              <Button variant="quiet" label={s.cancel} onPress={() => setRejecting(null)} />
            </View>
          </View>
        </>
      )}
      {actions && rejecting !== x.claim.id && (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button icon="checkmark" label={s.outsideHours.approve} disabled={busy} onPress={() => run((b) => b.decideOutsideHours(id, x.claim.id, { decision: 'approved' }))} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" icon="close" label={s.outsideHours.reject} disabled={busy} onPress={() => { setReason(''); setRejecting(x.claim.id); }} />
          </View>
        </View>
      )}
    </Card>
  );

  return (
    <Screen back title={s.outsideHours.title}>
      <SectionTitle>{s.outsideHours.waitingTitle}</SectionTitle>
      {waiting.length === 0 && <Txt color={colors.inkMuted}>{s.outsideHours.noneWaiting}</Txt>}
      {waiting.map((x) => claimCard(x, true))}
      {decided.length > 0 && <SectionTitle>{s.outsideHours.decidedTitle}</SectionTitle>}
      {decided.map((x) => claimCard(x, false))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  photo: { width: '100%', borderRadius: radius.input },
});
