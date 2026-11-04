import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Chip, Field, QueryState, Row } from '@/components/ui';
import type { NoticeKind } from '@/data/types';
import { useEvent } from '@/data/queries';
import { fmt } from '@/i18n/format';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { colors } from '@/theme/tokens';
import { NOTICE_MAX } from '../../../../../shared/rules';

// A supervisor of the event (or an admin) writes to its people: an announcement
// (a change, a reminder, a detail that came up) or a question they answer with
// a reaction (agree, disagree, not sure yet). Everyone who joined is notified,
// and it stays on the event's page.
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const { run, busy } = useAction();
  const query = useEvent(id);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<NoticeKind>('announcement');

  if (!query.data) {
    return (
      <Screen back title={s.notice.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const send = async () => {
    if (await run((b) => b.postNotice(id, body.trim(), kind))) goBack(`/event/${id}`);
  };

  return (
    <Screen
      back
      title={s.notice.title}
      footer={
        <Button
          icon={kind === 'question' ? 'help-circle-outline' : 'megaphone-outline'}
          label={kind === 'question' ? s.notice.ask : s.notice.send}
          disabled={busy || !body.trim()}
          onPress={send}
        />
      }>
      <Txt variant="bodyStrong">{query.data.title}</Txt>
      <Txt color={colors.inkMuted}>{s.notice.intro}</Txt>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.notice.kind}
      </Txt>
      <Row>
        <Chip label={s.notice.announcement} icon="megaphone-outline" selected={kind === 'announcement'} onPress={() => setKind('announcement')} />
        <Chip label={s.notice.question} icon="help-circle-outline" selected={kind === 'question'} onPress={() => setKind('question')} />
      </Row>
      <Txt variant="caption" color={colors.inkMuted}>
        {kind === 'question' ? s.notice.questionHint : s.notice.announcementHint}
      </Txt>
      <Field
        label={s.notice.label}
        placeholder={kind === 'question' ? s.notice.questionPlaceholder : s.notice.placeholder}
        value={body}
        maxLength={NOTICE_MAX}
        multiline
        onChangeText={setBody}
      />
      <Txt variant="caption" color={colors.inkMuted} align="end">
        {fmt(s.notice.count, { n: body.length, max: NOTICE_MAX })}
      </Txt>
    </Screen>
  );
}
