import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, Field, QueryState, SectionTitle } from '@/components/ui';
import { WarningBadge } from '@/components/WarningBadge';
import { useWarning } from '@/data/queries';
import { day, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors } from '@/theme/tokens';
import { REASON_MAX } from '../../../../shared/rules';

// One warning, as the member it was given to sees it. While it is in force the
// member may appeal it once; an admin then keeps it or withdraws it.
export default function WarningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, now } = useApp();
  const { run, busy } = useAction();
  const query = useWarning(id);
  const [reason, setReason] = useState('');

  if (!query.data) {
    return (
      <Screen back title={s.warnings.title}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { warning: w, event, issued_by } = query.data;
  const canAppeal = w.status === 'active';
  const appeal = () => run((b) => b.appealWarning(w.id, reason.trim()));

  return (
    <Screen
      back
      title={s.warnings.title}
      footer={
        canAppeal ? (
          <Button variant="secondary" icon="chatbubble-ellipses-outline" label={s.warnings.appeal} disabled={busy || !reason.trim()} onPress={appeal} />
        ) : undefined
      }>
      <WarningBadge status={w.status} />
      <Txt variant="sectionTitle">{event.title}</Txt>
      <Txt variant="caption" color={colors.inkMuted}>
        {[issued_by && fmt(issued_by.gender === 'female' ? s.warnings.fromFemale : s.warnings.from, { name: issued_by.full_name }), day(w.created_at, s, now)]
          .filter(Boolean)
          .join(' · ')}
      </Txt>

      <Card>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.warnings.reason}
        </Txt>
        <Txt>{w.reason}</Txt>
      </Card>
      {w.appeal_reason && (
        <Card>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.warnings.yourAppeal}
          </Txt>
          <Txt>{w.appeal_reason}</Txt>
        </Card>
      )}
      {w.status === 'appealed' && <Txt color={colors.inkMuted}>{s.warnings.waiting}</Txt>}
      {w.decision_note && (
        <Card>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.warnings.decision}
          </Txt>
          <Txt>{w.decision_note}</Txt>
        </Card>
      )}

      {canAppeal && (
        <>
          <SectionTitle>{s.warnings.appealTitle}</SectionTitle>
          <Txt variant="caption" color={colors.inkMuted}>
            {s.warnings.appealHint}
          </Txt>
          <Field
            label={s.warnings.yourAppeal}
            placeholder={s.warnings.appealPlaceholder}
            value={reason}
            maxLength={REASON_MAX}
            multiline
            onChangeText={setReason}
          />
        </>
      )}
    </Screen>
  );
}
