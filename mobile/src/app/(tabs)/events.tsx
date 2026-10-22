import { useState } from 'react';

import { EventCard } from '@/components/EventCard';
import { Screen } from '@/components/Screen';
import { Chip, EmptyState, QueryState, Row } from '@/components/ui';
import { useEvents } from '@/data/queries';
import { useApp } from '@/state/app';

const t = (iso: string) => new Date(iso).getTime();

export default function EventsScreen() {
  const { s } = useApp();
  const query = useEvents();
  const [tab, setTab] = useState<'upcoming' | 'mine'>('upcoming');
  const events = query.data ?? [];

  const upcoming = events
    .filter((e) => e.status === 'published' || e.status === 'running')
    .sort((a, b) => t(a.starts_at) - t(b.starts_at));

  const mine = events
    .filter((e) => e.my_registration_status === 'joined')
    .sort((a, b) => {
      // Still to come first (soonest first), then finished (most recent first).
      const fa = a.status === 'finished';
      const fb = b.status === 'finished';
      if (fa !== fb) return fa ? 1 : -1;
      return fa ? t(b.starts_at) - t(a.starts_at) : t(a.starts_at) - t(b.starts_at);
    });

  const list = tab === 'upcoming' ? upcoming : mine;

  return (
    <Screen title={s.tabs.events}>
      <Row>
        <Chip label={s.events.upcoming} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label={s.events.mine} selected={tab === 'mine'} onPress={() => setTab('mine')} />
      </Row>
      {!query.data ? (
        <QueryState query={query} />
      ) : list.length === 0 ? (
        <EmptyState icon="calendar-outline" text={tab === 'upcoming' ? s.events.emptyUpcoming : s.events.emptyMine} />
      ) : (
        list.map((e) => <EventCard key={e.id} event={e} />)
      )}
    </Screen>
  );
}
