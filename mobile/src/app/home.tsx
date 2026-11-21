import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BadgeCelebration } from '@/components/Badges';
import { Button } from '@/components/Button';
import { EventCard } from '@/components/EventCard';
import { MapPreview } from '@/components/MapPreview';
import { useLevelName } from '@/components/LevelRoad';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Card, QueryState, SectionTitle } from '@/components/ui';
import type { EventSummary } from '@/data/api';
import { useEvents, useFollows, useMeSummary, useMyAttendance, useSkillMatches } from '@/data/queries';
import { day, fmt, num, time } from '@/i18n/format';
import { useMyLocation } from '@/lib/myLocation';
import { useApp, useMe } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';
import { distanceKm } from '../../../shared/geocode';
import { greetingFor } from '../../../shared/greeting';
import { hijriMonths } from '../../../shared/hijri';
import { ASSOCIATION_TIME_ZONE } from '../../../shared/rules';

/** "Events near you": within this of the phone (or the person's city). */
const NEAR_KM = 10;
/** How many events each card shows. */
const SHOWN = 3;
/** How many events "near you" lists under its map. */
const NEAR_SHOWN = 4;

// The home screen (owner's decisions, 2026-11-21, prototype A «اليوم»): a
// greeting by the time of day or the occasion, the next event, the level card
// with the person's photo, what fits their skills, what is near them, what is
// new from those they follow, and hours waiting for them. The map stays in the
// bottom bar.
export default function HomeScreen() {
  const { s, now } = useApp();
  const me = useMe();
  const summary = useMeSummary();
  const events = useEvents();
  const attendance = useMyAttendance();
  const matches = useSkillMatches();
  const follows = useFollows();
  const where = useMyLocation(me.city);
  const levelName = useLevelName();

  if (!summary.data || !events.data) {
    return (
      <Screen island>
        <QueryState query={summary.data ? events : summary} />
      </Screen>
    );
  }

  const greeting = greetingFor(now, ASSOCIATION_TIME_ZONE, hijriMonths(summary.data.hijri_adjustments ?? []));
  const firstName = me.full_name.split(' ')[0];
  const all = events.data;
  const byId = new Map(all.map((e) => [e.id, e]));
  const upcoming = all
    .filter((e) => (e.status === 'published' || e.status === 'running') && Date.parse(e.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const open = upcoming.filter((e) => e.my_registration_status !== 'joined' && e.can_join_category && !e.i_organize);
  const next = upcoming.find((e) => e.my_registration_status === 'joined' || e.i_organize);

  const fits = (matches.data ?? []).flatMap((m) => byId.get(m.event_id) ?? []).slice(0, SHOWN);
  // Nearest first, each with its distance (owner's decision, 2026-11-21: a map preview and the few in range).
  const near = where
    ? open
        .flatMap((e) => (e.location_type === 'in_person' && e.lat != null && e.lng != null ? [{ e, km: distanceKm(where, { lat: e.lat, lng: e.lng }) }] : []))
        .filter((x) => x.km <= NEAR_KM)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_SHOWN)
    : [];
  const followed = follows.data
    ? open
        .filter((e) => (e.institution && follows.data.institutions.some((i) => i.id === e.institution!.id)) || follows.data.classes.includes(e.event_class))
        .slice(0, SHOWN)
    : [];
  const waiting = (attendance.data ?? []).filter((x) => x.attendance.ended_at && x.attendance.participant_status === 'pending');

  const total = summary.data.total_points;
  const nextLevel = summary.data.next_level;
  const from = summary.data.level.min_points;
  const progress = nextLevel ? (total - from) / Math.max(1, nextLevel.min_points - from) : 1;

  const row = (list: EventSummary[], empty: string, more?: { label: string; to: string }) => (
    <>
      {list.length === 0 ? (
        <Txt color={colors.inkMuted}>{empty}</Txt>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {list.map((e) => (
            <View key={e.id} style={styles.cardSlot}>
              <EventCard event={e} />
            </View>
          ))}
        </ScrollView>
      )}
      {more && <Button variant="quiet" icon="chevron-back" label={more.label} onPress={() => router.push(more.to as never)} />}
    </>
  );

  return (
    <Screen island>
      <Txt variant="screenTitle">{fmt(s.home.greetings[greeting], { name: firstName })}</Txt>

      {/* The next event: what they joined or supervise. */}
      {next ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/event/${next.id}`)} style={styles.next}>
          <Txt variant="caption" color={colors.primarySoft}>
            {fmt(s.home.nextAt, { when: `${day(next.starts_at, s, now)} ${time(next.starts_at, s)}` })}
          </Txt>
          <Txt variant="bodyStrong" color={colors.surface} numberOfLines={2}>
            {next.title}
          </Txt>
          <Txt variant="caption" color={colors.primarySoft} numberOfLines={1}>
            {next.location_type === 'online' ? s.event.online : (next.address_text ?? '')}
          </Txt>
        </Pressable>
      ) : (
        <Card>
          <Txt color={colors.inkMuted}>{s.home.noNext}</Txt>
          <Button variant="secondary" icon="search-outline" label={s.next.findEvent} onPress={() => router.push('/events')} />
        </Card>
      )}

      {/* The level and points, with their photo. */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')}>
        <Card style={styles.level}>
          <Avatar user={me} size={52} />
          <View style={styles.flex}>
            <Txt variant="bodyStrong">{`${levelName(summary.data.level.level)} · ${fmt(s.home.points, { n: num(total) })}`}</Txt>
            <ProgressBar value={progress} />
            <Txt variant="caption" color={colors.inkMuted}>
              {nextLevel ? fmt(s.home.toNext, { n: num(nextLevel.min_points - total), level: levelName(nextLevel.level) }) : s.home.topLevel}
            </Txt>
          </View>
        </Card>
      </Pressable>

      {waiting.length > 0 && (
        <Card style={styles.waiting}>
          <Txt>{fmt(s.home.hoursWaiting, { n: num(waiting.length) })}</Txt>
          <Button icon="checkmark-circle-outline" label={s.next.confirmHours} onPress={() => router.push(`/attendance/${waiting[0].attendance.id}`)} />
        </Card>
      )}

      <SectionTitle>{s.home.fits}</SectionTitle>
      {row(fits, s.home.fitsEmpty, fits.length === 0 ? { label: s.skills.open, to: '/skills' } : undefined)}

      <View style={styles.titleRow}>
        <SectionTitle>{s.home.near}</SectionTitle>
        <Pressable accessibilityRole="button" onPress={() => router.push('/map')} style={styles.mapLink}>
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <Txt variant="caption" color={colors.primary}>
            {s.home.openMap}
          </Txt>
        </Pressable>
      </View>
      {where && (
        <Txt variant="caption" color={colors.inkMuted}>
          {where.from === 'phone' ? fmt(s.home.nearPhone, { km: num(NEAR_KM) }) : fmt(s.home.nearCity, { km: num(NEAR_KM), city: me.city })}
        </Txt>
      )}
      {where ? (
        <Card style={styles.nearCard}>
          <MapPreview
            center={where}
            showCenter={where.from === 'phone'}
            pins={near.map((x, i) => ({ lat: x.e.lat!, lng: x.e.lng!, label: num(i + 1) }))}
            onPress={() => router.push('/map')}
            label={s.home.openMap}
          />
          {near.length === 0 && <Txt color={colors.inkMuted}>{s.home.nearEmpty}</Txt>}
          {near.map((x, i) => (
            <Pressable key={x.e.id} accessibilityRole="button" onPress={() => router.push(`/event/${x.e.id}`)} style={styles.nearRow}>
              <View style={styles.nearNum}>
                <Txt variant="caption" color={colors.surface} tabular>
                  {num(i + 1)}
                </Txt>
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {x.e.title}
                </Txt>
                <Txt variant="caption" color={colors.inkMuted} numberOfLines={1}>
                  {`${day(x.e.starts_at, s, now)} ${time(x.e.starts_at, s)} · ${x.e.address_text ?? ''}`}
                </Txt>
              </View>
              <Txt variant="caption" color={colors.primary} tabular>
                {fmt(s.home.km, { km: num(Math.round(x.km * 10) / 10) })}
              </Txt>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Txt color={colors.inkMuted}>{s.home.locating}</Txt>
      )}

      <SectionTitle>{s.home.followed}</SectionTitle>
      {row(followed, s.home.followedEmpty, { label: s.follows.open, to: '/following' })}

      <BadgeCelebration ids={summary.data.new_badges ?? []} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  next: { backgroundColor: colors.primary, borderRadius: radius.card, padding: space.md, gap: space.xs },
  level: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  waiting: { borderColor: colors.accent, borderWidth: 3 },
  row: { gap: space.sm, paddingVertical: space.xs },
  cardSlot: { width: 260 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.xs },
  flex: { flex: 1, gap: space.xs },
  nearCard: { gap: space.sm, padding: space.sm },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  nearNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
