import { useLocalSearchParams } from 'expo-router';

import { EventForm } from '@/components/EventForm';
import { Screen } from '@/components/Screen';
import { QueryState } from '@/components/ui';
import { useEvent, useEventForm } from '@/data/queries';
import { useApp } from '@/state/app';

// The proposer edits their event while it waits for an admin, with the form
// they proposed it with. The server refuses it once an admin has decided.

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useApp();
  const form = useEventForm();
  const event = useEvent(id);
  if (!form.data || !event.data) {
    return (
      <Screen back title={s.newEvent.editTitle}>
        <QueryState query={form.data ? event : form} />
      </Screen>
    );
  }
  return <EventForm meta={form.data} editing={event.data} />;
}
