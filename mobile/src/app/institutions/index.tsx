import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, EmptyState, QueryState } from '@/components/ui';
import type { MyInstitution } from '@/data/api';
import { useInstitutions } from '@/data/queries';
import { fmt } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { institutionIcon } from '@/lib/institutions';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors, space } from '@/theme/tokens';

// "Your institutions" (owner's decisions, 2026-11-17; shared/types.ts Institution):
// those the person belongs to, represents, asked to belong to or asked to add.
// From here they ask to belong to another, or ask for a new one; a
// representative opens who belongs to theirs and confirms the requests.
export default function InstitutionsScreen() {
  const { s } = useApp();
  const query = useInstitutions();
  const { run, busy } = useAction();

  const footer = (
    <>
      <Button icon="people-outline" label={s.institutions.join} onPress={() => router.push('/institutions/join')} />
      <Button variant="secondary" icon="add-circle-outline" label={s.institutions.add} onPress={() => router.push('/institutions/new')} />
    </>
  );

  if (!query.data) {
    return (
      <Screen back title={s.institutions.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const leave = (x: MyInstitution) => {
    const name = x.institution.name;
    // A request not confirmed yet, or a turned-down institution: taken back at once. Leaving one asks first.
    if (x.status === 'pending' || x.institution.status === 'rejected') return run((b) => b.leaveInstitution(x.institution.id));
    dialog.confirm({
      title: fmt(s.institutions.leaveTitle, { name }),
      message: s.institutions.leaveBody,
      cancel: s.cancel,
      action: s.institutions.leave,
      destructive: true,
      onConfirm: () => run((b) => b.leaveInstitution(x.institution.id)),
    });
  };

  return (
    <Screen back title={s.institutions.title} footer={footer}>
      <Card style={styles.intro}>
        <Txt>{s.institutions.intro}</Txt>
      </Card>
      {query.data.mine.length === 0 && <EmptyState icon="business-outline" text={s.institutions.empty} />}
      {query.data.mine.map((x) => {
        const { institution: i } = x;
        const representative = x.role === 'representative';
        return (
          <Card key={i.id}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name={institutionIcon(i.kind)} size={22} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{i.name}</Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  {s.institutions.kinds[i.kind]}
                </Txt>
              </View>
              <Badge label={representative ? s.institutions.representative : s.institutions.member} color={representative ? colors.primary : colors.inkMuted} />
            </View>

            {i.status === 'pending' && <Badge label={s.institutions.waitingAdmin} color={colors.warning} icon="hourglass-outline" />}
            {i.status === 'rejected' && (
              <>
                <Badge label={s.institutions.rejected} color={colors.danger} />
                {i.decision_note && <Txt color={colors.inkMuted}>{fmt(s.institutions.reason, { note: i.decision_note })}</Txt>}
              </>
            )}
            {i.status === 'approved' && x.status === 'pending' && (
              <Badge label={s.institutions.waitingRepresentative} color={colors.warning} icon="hourglass-outline" />
            )}

            {representative && i.status === 'approved' && (
              <Button
                variant={x.pending_members > 0 ? 'primary' : 'secondary'}
                icon="people-outline"
                label={x.pending_members > 0 ? fmt(s.institutions.requests, { n: x.pending_members }) : s.institutions.manage}
                onPress={() => router.push(`/institutions/${i.id}`)}
              />
            )}
            {representative && i.status === 'approved' && (
              <View style={styles.repActions}>
                <View style={styles.flex}>
                  <Button
                    variant={(x.pending_hours ?? 0) > 0 ? 'primary' : 'secondary'}
                    icon="time-outline"
                    label={(x.pending_hours ?? 0) > 0 ? fmt(s.outsideHours.review, { n: x.pending_hours ?? 0 }) : s.outsideHours.manageHours}
                    onPress={() => router.push(`/institutions/${i.id}/hours`)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button variant="secondary" icon="document-text-outline" label={s.institutionReport.open} onPress={() => router.push(`/institutions/${i.id}/report`)} />
                </View>
              </View>
            )}
            {(!representative || i.status === 'rejected') && (
              <Button
                variant="quiet"
                icon={i.status === 'rejected' ? 'trash-outline' : 'exit-outline'}
                label={i.status === 'rejected' ? s.institutions.dismiss : x.status === 'pending' ? s.institutions.cancelRequest : s.institutions.leave}
                disabled={busy}
                onPress={() => leave(x)}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  repActions: { flexDirection: 'row', gap: space.sm },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
});
