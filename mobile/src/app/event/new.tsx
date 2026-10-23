import { EventForm } from '@/components/EventForm';
import { Screen } from '@/components/Screen';
import { QueryState } from '@/components/ui';
import { useEventForm } from '@/data/queries';
import { useApp } from '@/state/app';

// Proposing an event in the app (level 5, or a supervisor). The form is src/components/EventForm.tsx.

export default function NewEventScreen() {
  const { s } = useApp();
  const form = useEventForm();
  if (!form.data) {
    return (
      <Screen back title={s.newEvent.title}>
        <QueryState query={form} />
      </Screen>
    );
  }
  return <EventForm meta={form.data} />;
}
