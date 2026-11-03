import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Field, QueryState } from '@/components/ui';
import { useEvent } from '@/data/queries';
import { fmt } from '@/i18n/format';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors } from '@/theme/tokens';
import { NOTICE_MAX } from '../../../../../shared/rules';

// A supervisor of the event (or an admin) writes a notice to its people: a
// change, a reminder, a detail that came up. Everyone who joined is notified,
// and the notice stays on the event's page.
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const { run, busy } = useAction();
  const query = useEvent(id);
  const [body, setBody] = useState('');

  if (!query.data) {
    return (
      <Screen back title={s.notice.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const send = async () => {
    if (await run((b) => b.postNotice(id, body.trim()))) goBack(`/event/${id}`);
  };

  return (
    <Screen
      back
      title={s.notice.title}
      footer={<Button icon="megaphone-outline" label={s.notice.send} disabled={busy || !body.trim()} onPress={send} />}>
      <Txt variant="bodyStrong">{query.data.title}</Txt>
      <Txt color={colors.inkMuted}>{s.notice.intro}</Txt>
      <Field label={s.notice.label} placeholder={s.notice.placeholder} value={body} maxLength={NOTICE_MAX} multiline onChangeText={setBody} />
      <Txt variant="caption" color={colors.inkMuted} align="end">
        {fmt(s.notice.count, { n: body.length, max: NOTICE_MAX })}
      </Txt>
    </Screen>
  );
}
