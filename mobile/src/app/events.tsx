import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { EventCard } from '@/components/EventCard';
import { Screen } from '@/components/Screen';
import { FollowButton } from '@/components/FollowButton';
import { fmt } from '@/i18n/format';
import { Chip, ClassFilter, EmptyState, Field, type NextStep, QueryState, Row } from '@/components/ui';
import { useEvents, useMeSummary, useFollows } from '@/data/queries';
import { useApp } from '@/state/app';
import { className, type EventClassId } from '@/theme/classes';
import type { LocationType } from '@/data/types';

const t = (iso: string) => new Date(iso).getTime();

type Tab = 'upcoming' | 'mine' | 'organize';
type Where = 'all' | LocationType;

export default function EventsScreen() {
  const { s, lang } = useApp();
  const follows = useFollows();
  // The map's search button opens this list with the search box ready; its online bar, with online events only.
  const params = useLocalSearchParams<{ search?: string; where?: string }>();
  const { search } = params;
  const query = useEvents();
  const canCreate = useMeSummary().data?.can_create_events ?? false;
  const [tab, setTab] = useState<Tab>('upcoming');
  const [kind, setKind] = useState<EventClassId | null>(null);
  const [text, setText] = useState('');
  const [where, setWhere] = useState<Where>(params.where === 'online' ? 'online' : 'all');
  const events = query.data ?? [];

  const upcoming = events
    .filter((e) => e.status === 'published' || e.status === 'running')
    .sort((a, b) => t(a.starts_at) - t(b.starts_at));

  // Still to come first (soonest first), then over (most recent first).
  const comingFirst = (a: (typeof events)[number], b: (typeof events)[number]) => {
    const over = (e: typeof a) => e.status === 'finished' || e.status === 'cancelled' || e.status === 'rejected';
    if (over(a) !== over(b)) return over(a) ? 1 : -1;
    return over(a) ? t(b.starts_at) - t(a.starts_at) : t(a.starts_at) - t(b.starts_at);
  };

  const mine = events.filter((e) => e.my_registration_status === 'joined').sort(comingFirst);

  // Events this person supervises or proposed (their proposals waiting for approval included).
  const organized = events.filter((e) => e.i_organize || e.i_created).sort(comingFirst);
  const showOrganize = canCreate || organized.length > 0;

  const words = text.trim().toLowerCase();
  const list = (tab === 'upcoming' ? upcoming : tab === 'mine' ? mine : organized).filter(
    (e) =>
      (!kind || e.event_class === kind) &&
      (where === 'all' || e.location_type === where) &&
      (!words || e.title.toLowerCase().includes(words) || (e.address_text ?? '').toLowerCase().includes(words)),
  );
  const filtered = !!kind || !!words || where !== 'all';
  const empty = filtered
    ? s.events.noMatch
    : tab === 'upcoming'
      ? s.events.emptyUpcoming
      : tab === 'mine'
        ? s.events.emptyMine
        : s.events.emptyOrganize;
  const clearFilters = () => {
    setText('');
    setKind(null);
    setWhere('all');
  };
  // Each empty list says where to go instead. (Organising has its propose button above.)
  const emptyAction: NextStep | null = filtered
    ? { label: s.next.clearFilters, icon: 'close-circle-outline', onPress: clearFilters }
    : tab === 'mine'
      ? { label: s.next.seeUpcoming, icon: 'calendar-outline', onPress: () => setTab('upcoming') }
      : tab === 'upcoming' && canCreate
        ? { label: s.events.propose, icon: 'add-circle-outline', onPress: () => router.push('/event/new') }
        : null;

  return (
    <Screen back title={s.tabs.events} island>
      <Field
        label={s.events.search}
        value={text}
        onChangeText={setText}
        autoFocus={search === '1'}
        returnKeyType="search"
        accessibilityLabel={s.events.search}
      />
      <Row>
        <Chip label={s.events.upcoming} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label={s.events.mine} selected={tab === 'mine'} onPress={() => setTab('mine')} />
        {showOrganize && <Chip label={s.events.organize} selected={tab === 'organize'} onPress={() => setTab('organize')} />}
      </Row>
      <ClassFilter value={kind} onChange={setKind} />
      {/* A class chosen: follow it, to hear of its new events (owner's decisions, 2026-11-21). */}
      {kind && follows.data && (
        <FollowButton kind="class" id={kind} following={follows.data.classes.includes(kind)} label={fmt(s.follows.followName, { name: className(kind, lang) })} />
      )}
      <Row>
        <Chip label={s.events.whereAll} selected={where === 'all'} onPress={() => setWhere('all')} />
        <Chip label={s.events.inPerson} icon="location-outline" selected={where === 'in_person'} onPress={() => setWhere('in_person')} />
        <Chip label={s.events.online} icon="videocam-outline" selected={where === 'online'} onPress={() => setWhere('online')} />
      </Row>
      {canCreate && tab === 'organize' && (
        <Button variant="secondary" icon="add-circle-outline" label={s.events.propose} onPress={() => router.push('/event/new')} />
      )}
      {!query.data ? (
        <QueryState query={query} />
      ) : list.length === 0 ? (
        <EmptyState icon={filtered ? 'search-outline' : 'calendar-outline'} text={empty} action={emptyAction} />
      ) : (
        list.map((e) => <EventCard key={e.id} event={e} />)
      )}
    </Screen>
  );
}
