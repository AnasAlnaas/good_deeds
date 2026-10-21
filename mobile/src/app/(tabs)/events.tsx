import { useState } from 'react';

import { EventCard } from '@/components/EventCard';
import { Screen } from '@/components/Screen';
import { Chip, EmptyState, Row } from '@/components/ui';
import * as server from '@/demo/server';
import { useApp, useMe } from '@/state/app';

const t = (iso: string) => new Date(iso).getTime();

export default function EventsScreen() {
  const { db, s, now } = useApp();
  const me = useMe();
  const [tab, setTab] = useState<'upcoming' | 'mine'>('upcoming');

  const upcoming = db.events
    .filter((e) => ['published', 'running'].includes(server.effectiveStatus(e, now)))
    .sort((a, b) => t(a.starts_at) - t(b.starts_at));

  const mineIds = db.registrations.filter((r) => r.user_id === me.id && r.status === 'joined').map((r) => r.event_id);
  const mine = db.events
    .filter((e) => mineIds.includes(e.id))
    .sort((a, b) => {
      // Still to come first (soonest first), then finished (most recent first).
      const fa = server.effectiveStatus(a, now) === 'finished';
      const fb = server.effectiveStatus(b, now) === 'finished';
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
      {list.length === 0 ? (
        <EmptyState icon="calendar-outline" text={tab === 'upcoming' ? s.events.emptyUpcoming : s.events.emptyMine} />
      ) : (
        list.map((e) => <EventCard key={e.id} event={e} />)
      )}
    </Screen>
  );
}
