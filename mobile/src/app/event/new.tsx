import { router, useLocalSearchParams } from 'expo-router';

import { EventForm } from '@/components/EventForm';
import { Screen } from '@/components/Screen';
import { QueryState } from '@/components/ui';
import { useEvent, useEventForm } from '@/data/queries';
import { useApp } from '@/state/app';

// Proposing an event in the app (level 5, or a supervisor). The form is src/components/EventForm.tsx.
// `?copy=<id>`: the form starts from that earlier event (the form's CopyEvent, or
// "repeat this event" on its page). Choosing another, or a blank form, changes
// the parameter, and the form, keyed by it, starts again.

export default function NewEventScreen() {
  const { s } = useApp();
  const { copy } = useLocalSearchParams<{ copy?: string }>();
  const form = useEventForm();
  // Read only when there is one to copy (an empty id is never fetched).
  const earlier = useEvent(copy ?? '');
  const copying = !!copy;
  if (!form.data || (copying && !earlier.data)) {
    return (
      <Screen back title={s.newEvent.title}>
        <QueryState query={form.data ? earlier : form} />
      </Screen>
    );
  }
  const copyFrom = copying ? (earlier.data ?? null) : null;
  return (
    <EventForm
      key={copy || 'blank'}
      meta={form.data}
      copyFrom={copyFrom}
      onCopy={(id) => router.setParams({ copy: id ?? '' })}
    />
  );
}
