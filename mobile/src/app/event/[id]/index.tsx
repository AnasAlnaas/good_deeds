import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { NoticeReactions } from '@/components/NoticeReactions';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState, Row, SectionTitle } from '@/components/ui';
import { useEvent, useMeSummary } from '@/data/queries';
import { day, dayTimeRange, fmt, time } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { openDirections } from '@/lib/directions';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { classIcon, className } from '@/theme/classes';
import { colors, space } from '@/theme/tokens';
import { NOTICE_DAYS_AFTER_EVENT } from '../../../../../shared/rules';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s, lang, now } = useApp();
  const { run, busy } = useAction();
  const query = useEvent(id);
  const summary = useMeSummary();
  if (!query.data) {
    return (
      <Screen back>
        <QueryState query={query} />
      </Screen>
    );
  }

  const event = query.data;
  const status = event.status;
  const participants = event.participants;
  const full = event.joined_count >= event.capacity;
  const reg = event.my_registration;
  const attendance = event.my_attendance;
  const organizer = event.i_organize;
  const forMe = event.can_join_category;
  const open = status === 'published' || status === 'running';
  // Someone who was at the event may report a problem there (a report about anything else starts from the profile).
  const canReport =
    !!summary.data?.can_report && (organizer || reg?.status === 'joined') && status !== 'draft' && status !== 'rejected';

  const join = async () => {
    if (await run((b) => b.startJoin(event.id))) router.push(`/event/${event.id}/terms`);
  };
  const cancel = () =>
    dialog.confirm({
      title: s.event.cancelJoinTitle,
      message: s.event.cancelJoinBody,
      cancel: s.cancel,
      action: s.event.cancelJoin,
      destructive: true,
      onConfirm: () => run((b) => b.cancelJoin(event.id)),
    });
  // The proposer's own event, while it waits for an admin: deleted, so there is nothing left to show.
  const deleteNotice = (noticeId: string) =>
    dialog.confirm({
      title: s.event.deleteNoticeTitle,
      message: s.event.deleteNoticeBody,
      cancel: s.cancel,
      action: s.event.deleteNotice,
      destructive: true,
      onConfirm: () => run((b) => b.deleteNotice(event.id, noticeId)),
    });
  // The same window as rules.assertCanPostNotice; the server decides.
  const canPost =
    event.can_manage &&
    (open || status === 'finished') &&
    now <= new Date(event.ends_at).getTime() + NOTICE_DAYS_AFTER_EVENT * 24 * 3_600_000;
  const withdraw = () =>
    dialog.confirm({
      title: s.event.withdrawTitle,
      message: s.event.withdrawBody,
      cancel: s.cancel,
      action: s.event.withdraw,
      destructive: true,
      onConfirm: async () => {
        if (await run((b) => b.withdrawProposal(event.id))) goBack('/events');
      },
    });

  let footer;
  if (status === 'draft') {
    // Only its creator sees an event that is not published, and may change it until an admin decides.
    footer = (
      <>
        <Txt color={colors.inkMuted} align="center">
          {s.event.waiting}
        </Txt>
        {event.i_created && (
          <>
            <Button variant="secondary" icon="create-outline" label={s.event.edit} disabled={busy} onPress={() => router.push(`/event/${event.id}/edit`)} />
            <Button variant="danger" icon="trash-outline" label={s.event.withdraw} disabled={busy} onPress={withdraw} />
          </>
        )}
      </>
    );
  } else if (status === 'rejected') {
    footer = (
      <Txt color={colors.danger} align="center">
        {s.event.rejected}
      </Txt>
    );
  } else if (organizer) {
    footer = (
      <>
        <Txt variant="caption" color={colors.inkMuted} align="center">
          {s.event.supervisor}
        </Txt>
        <Button icon="clipboard-outline" label={s.event.roster} onPress={() => router.push(`/event/${event.id}/roster`)} />
      </>
    );
  } else if (reg?.status === 'joined') {
    footer = (
      <>
        <Badge label={s.event.joined} color={colors.success} icon="checkmark-circle" />
        {open && !attendance && <Button variant="danger" label={s.event.cancelJoin} disabled={busy} onPress={cancel} />}
      </>
    );
  } else if (!open) {
    footer = <Txt color={colors.inkMuted} align="center">{s.event.finished}</Txt>;
  } else if (!forMe) {
    footer = (
      <Txt color={colors.inkMuted} align="center">
        {fmt(s.event.notForYou, { category: s.category[event.gender_category] })}
      </Txt>
    );
  } else if (full) {
    footer = <Button disabled label={s.event.full} />;
  } else {
    footer = (
      <Button
        icon="hand-left-outline"
        label={reg?.status === 'pending_terms' ? s.event.continueTerms : s.event.join}
        disabled={busy}
        onPress={join}
      />
    );
  }

  return (
    <Screen back footer={footer}>
      <Row>
        <Badge
          label={s.status[status]}
          color={status === 'running' ? colors.danger : status === 'draft' ? colors.warning : status === 'rejected' ? colors.inkMuted : colors.primary}
          icon={status === 'running' ? 'radio-button-on' : status === 'draft' ? 'hourglass-outline' : undefined}
        />
        <Badge label={className(event.event_class, lang)} color={colors.primary} icon={classIcon(event.event_class)} />
        <Badge label={s.category[event.gender_category]} color={colors.inkMuted} />
      </Row>
      <Txt variant="screenTitle">{event.title}</Txt>
      <Txt>{event.description}</Txt>

      <Card>
        <InfoRow icon="time-outline" label={s.event.when} value={dayTimeRange(event.starts_at, event.ends_at, s, now)} />
        <InfoRow icon="location-outline" label={s.event.where} value={event.address_text} />
        <InfoRow
          icon="people-outline"
          label={s.event.participants}
          value={full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
        />
        <Button variant="accent" icon="navigate" label={s.event.directions} onPress={() => openDirections(event)} />
      </Card>

      {event.notices && (
        <>
          <SectionTitle>{s.event.notices}</SectionTitle>
          {event.notices.length === 0 && <Txt color={colors.inkMuted}>{event.can_manage ? s.event.noNoticesYet : s.event.noNotices}</Txt>}
          {event.notices.map((n) => (
            <Card key={n.id} style={[styles.notice, n.kind === 'question' && styles.question]}>
              {n.kind === 'question' && <Badge label={s.event.questionBadge} color={colors.primary} icon="help-circle-outline" />}
              <Txt>{n.body}</Txt>
              <Txt variant="caption" color={colors.inkMuted}>
                {fmt(s.event.noticeBy, { name: n.author?.full_name ?? s.event.deletedAuthor, time: `${day(n.created_at, s, now)} ${time(n.created_at, s)}` })}
              </Txt>
              <NoticeReactions notice={n} disabled={busy} onReact={(reaction) => run((b) => b.reactToNotice(event.id, n.id, reaction))} />
              {n.can_delete && <Button variant="quiet" icon="trash-outline" label={s.event.deleteNotice} disabled={busy} onPress={() => deleteNotice(n.id)} />}
            </Card>
          ))}
          {canPost && (
            <Button variant="secondary" icon="megaphone-outline" label={s.event.postNotice} onPress={() => router.push(`/event/${event.id}/notice`)} />
          )}
        </>
      )}

      {event.supervisors.length > 0 && (
        <>
          <SectionTitle>{s.event.supervisors}</SectionTitle>
          <View style={styles.people}>
            {event.supervisors.map((u) => (
              <View key={u.id} style={styles.person}>
                <Avatar user={u} size={32} />
                <Txt variant="caption" label>{u.full_name}</Txt>
              </View>
            ))}
          </View>
        </>
      )}
      {event.can_manage && open && (
        <Button variant="secondary" icon="people-outline" label={s.event.manageSupervisors} onPress={() => router.push(`/event/${event.id}/team`)} />
      )}

      <SectionTitle>{s.event.participants}</SectionTitle>
      {participants.length === 0 ? (
        <Txt color={colors.inkMuted}>{s.event.noParticipants}</Txt>
      ) : (
        <View style={styles.people}>
          {participants.map((u) => (
            <View key={u.id} style={styles.person}>
              <Avatar user={u} size={32} />
              <Txt variant="caption" label>{u.full_name}</Txt>
            </View>
          ))}
        </View>
      )}

      {canReport && (
        <Button
          variant="quiet"
          icon="flag-outline"
          label={s.event.report}
          onPress={() => router.push({ pathname: '/reports/new', params: { eventId: event.id } })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingEnd: space.sm },
  notice: { borderStartWidth: 4, borderStartColor: colors.accent },
  question: { borderStartColor: colors.primary },
});
