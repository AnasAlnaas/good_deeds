import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { EventCard } from '@/components/EventCard';
import { Screen } from '@/components/Screen';
import { Chip, EmptyState, QueryState, Row } from '@/components/ui';
import { useEvents, useMeSummary } from '@/data/queries';
import { useApp } from '@/state/app';

const t = (iso: string) => new Date(iso).getTime();

type Tab = 'upcoming' | 'mine' | 'organize';

export default function EventsScreen() {
  const { s } = useApp();
  const query = useEvents();
  const canCreate = useMeSummary().data?.can_create_events ?? false;
  const [tab, setTab] = useState<Tab>('upcoming');
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

  const list = tab === 'upcoming' ? upcoming : tab === 'mine' ? mine : organized;
  const empty = tab === 'upcoming' ? s.events.emptyUpcoming : tab === 'mine' ? s.events.emptyMine : s.events.emptyOrganize;

  return (
    <Screen title={s.tabs.events}>
      {canCreate && <Button variant="secondary" icon="add-circle-outline" label={s.events.propose} onPress={() => router.push('/event/new')} />}
      <Row>
        <Chip label={s.events.upcoming} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label={s.events.mine} selected={tab === 'mine'} onPress={() => setTab('mine')} />
        {showOrganize && <Chip label={s.events.organize} selected={tab === 'organize'} onPress={() => setTab('organize')} />}
      </Row>
      {!query.data ? (
        <QueryState query={query} />
      ) : list.length === 0 ? (
        <EmptyState icon="calendar-outline" text={empty} />
      ) : (
        list.map((e) => <EventCard key={e.id} event={e} />)
      )}
    </Screen>
  );
}
