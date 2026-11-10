import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { NoticeReactions, withReaction } from '@/components/NoticeReactions';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card, InfoRow, QueryState, Row, SectionTitle } from '@/components/ui';
import type { EventNoticeItem } from '@/data/api';
import type { NoticeReactionKind } from '@/data/types';
import { useEvent, useMeSummary, useUpdateEvent } from '@/data/queries';
import { day, dayTimeRange, fmt, time } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { openDirections } from '@/lib/directions';
import { placeLabel, withZone } from '@/lib/place';
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
  const updateEvent = useUpdateEvent(id);
  // An open page asks again when the meeting link opens, so it appears without a pull.
  const opensAt = query.data?.meeting_url ? null : query.data?.meeting_link_opens_at;
  const { refetch } = query;
  useEffect(() => {
    if (!opensAt) return;
    const wait = new Date(opensAt).getTime() - Date.now();
    if (wait <= 0 || wait > 24 * 3_600_000) return;
    const timer = setTimeout(() => void refetch(), wait + 1000);
    return () => clearTimeout(timer);
  }, [opensAt, refetch]);
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
  // An app from before the waiting list may meet a server without it.
  const waitlist = event.waitlist ?? { count: 0, held_for_others: 0, mine: null };
  const placeHeld = waitlist.mine?.offer_expires_at ?? null;
  // Places held for others on the list count as taken; one held for this person does not.
  const full = !placeHeld && event.joined_count + waitlist.held_for_others >= event.capacity;
  const reg = event.my_registration;
  const attendance = event.my_attendance;
  const organizer = event.i_organize;
  const forMe = event.can_join_category;
  const open = status === 'published' || status === 'running';
  const online = event.location_type === 'online';
  // Why there is no link yet (rules.canSeeMeetingLink): the server sends it once this person may see it.
  const linkNote =
    status === 'finished'
      ? s.event.linkOver
      : reg?.status === 'joined' && event.meeting_link_opens_at
        ? fmt(s.event.linkOpensAt, { when: `${day(event.meeting_link_opens_at, s, now)} ${time(event.meeting_link_opens_at, s)}` })
        : s.event.linkForJoined;
  const openMeeting = (url: string) =>
    Linking.openURL(url).catch(() => dialog.notify(s.event.openMeeting, fmt(s.event.linkCantOpen, { url })));
  // Someone who was at the event may report a problem there (a report about anything else starts from the profile).
  const canReport =
    !!summary.data?.can_report && (organizer || reg?.status === 'joined') && status !== 'draft' && status !== 'rejected';

  // The reaction shows at once; the server's answer follows. If it does not go
  // through (offline, say), the notice goes back to how it was.
  const react = async (notice: EventNoticeItem, reaction: NoticeReactionKind | null) => {
    const put = (next: EventNoticeItem) =>
      updateEvent((e) => ({ ...e, notices: e.notices?.map((n) => (n.id === notice.id ? next : n)) ?? null }));
    put(withReaction(notice, reaction));
    if (!(await run((b) => b.reactToNotice(event.id, notice.id, reaction)))) put(notice);
  };

  // An event from a server without the learning corner has no lessons.
  const lessons = event.lessons ?? [];
  const learnedCount = lessons.filter((l) => l.learned_at).length;
  const learnedAll = learnedCount === lessons.length;
  // The lessons come first, then the terms.
  const join = async () => {
    if (await run((b) => b.startJoin(event.id))) router.push(`/event/${event.id}/${learnedAll ? 'terms' : 'learn'}`);
  };
  const joinWaitlist = () => run((b) => b.joinWaitlist(event.id));
  const leaveWaitlist = () => run((b) => b.leaveWaitlist(event.id));
  const openLesson = (lessonId: string) => router.push({ pathname: '/event/[id]/learn', params: { id: event.id, lesson: lessonId } });
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
    footer = waitlist.mine ? (
      <>
        <Txt variant="caption" color={colors.inkMuted} align="center">
          {fmt(s.event.waitlistPosition, { n: waitlist.mine.position ?? 1 })}
        </Txt>
        <Button variant="quiet" icon="exit-outline" label={s.event.leaveWaitlist} disabled={busy} onPress={leaveWaitlist} />
      </>
    ) : (
      <>
        <Txt variant="caption" color={colors.inkMuted} align="center">
          {waitlist.count > 0 ? fmt(s.event.waitlistOthers, { n: waitlist.count }) : s.event.waitlistIntro}
        </Txt>
        <Button variant="secondary" icon="time-outline" label={s.event.joinWaitlist} disabled={busy} onPress={joinWaitlist} />
      </>
    );
  } else {
    footer = (
      <>
        {placeHeld && (
          <Txt variant="caption" color={colors.success} align="center">
            {fmt(s.event.placeHeld, { when: `${day(placeHeld, s, now)} ${time(placeHeld, s)}` })}
          </Txt>
        )}
        <Button
          icon="hand-left-outline"
          label={reg?.status === 'pending_terms' ? (learnedAll ? s.event.continueTerms : s.event.continueLessons) : s.event.join}
          disabled={busy}
          onPress={join}
        />
      </>
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
        {/* Its tag: a known type by its name, or as its proposer wrote it. */}
        <Badge label={s.subtype[event.subtype] ?? event.subtype} color={colors.inkMuted} />
        <Badge label={s.category[event.gender_category]} color={colors.inkMuted} />
      </Row>
      <Txt variant="screenTitle">{event.title}</Txt>
      <Txt>{event.description}</Txt>

      <Card>
        <InfoRow icon="time-outline" label={s.event.when} value={withZone(dayTimeRange(event.starts_at, event.ends_at, s, now), event, s)} />
        <InfoRow icon={online ? 'videocam-outline' : 'location-outline'} label={s.event.where} value={placeLabel(event, s)} />
        <InfoRow
          icon="people-outline"
          label={s.event.participants}
          value={full ? s.event.full : fmt(s.event.seats, { joined: event.joined_count, capacity: event.capacity })}
        />
        {!online ? (
          <Button variant="accent" icon="navigate" label={s.event.directions} onPress={() => openDirections(event)} />
        ) : event.meeting_url ? (
          <>
            <Button variant="accent" icon="videocam" label={s.event.openMeeting} onPress={() => openMeeting(event.meeting_url!)} />
            <Txt variant="caption" color={colors.inkMuted} selectable numberOfLines={2}>
              {event.meeting_url}
            </Txt>
          </>
        ) : (
          <Txt variant="caption" color={colors.inkMuted}>
            {linkNote}
          </Txt>
        )}
      </Card>

      {lessons.length > 0 && (
        <>
          <SectionTitle>{s.event.lessons}</SectionTitle>
          <Card style={styles.corner}>
            <View style={styles.cornerHead}>
              <Ionicons name="school" size={22} color={colors.primary} />
              <Txt variant="caption" style={styles.flex}>
                {s.event.lessonsIntro}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.primary} tabular>
              {fmt(s.event.lessonsProgress, { n: learnedCount, total: lessons.length })}
            </Txt>
          </Card>
          {lessons.map((l, i) => (
            <Card key={l.id} onPress={() => openLesson(l.id)} style={styles.lessonRow}>
              <View style={[styles.lessonNum, !!l.learned_at && styles.lessonNumDone]}>
                {l.learned_at ? (
                  <Ionicons name="checkmark" size={16} color={colors.surface} />
                ) : (
                  <Txt variant="caption" color={colors.primary} tabular>
                    {String(i + 1)}
                  </Txt>
                )}
              </View>
              <Txt variant="bodyStrong" style={styles.flex} numberOfLines={2}>
                {l.title}
              </Txt>
              {l.image && <Ionicons name="image-outline" size={18} color={colors.inkMuted} accessibilityLabel={s.event.lessonHasPicture} />}
              {l.video_id && <Ionicons name="logo-youtube" size={18} color={colors.inkMuted} accessibilityLabel={s.event.lessonHasVideo} />}
              {l.learned_at && (
                <Txt variant="caption" color={colors.success}>
                  {s.event.lessonLearned}
                </Txt>
              )}
            </Card>
          ))}
        </>
      )}

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
              <NoticeReactions notice={n} disabled={busy} onReact={(reaction) => react(n, reaction)} />
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
  corner: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, gap: space.xs },
  cornerHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lessonNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonNumDone: { backgroundColor: colors.success, borderColor: colors.success },
});
