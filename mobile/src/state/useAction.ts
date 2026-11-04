import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type Backend, errorCode } from '@/data/backend';
import * as dialog from '@/lib/dialog';
import { useApp } from './app';

/**
 * Runs a change (join, record, confirm…) through the backend. A refusal is
 * shown as a plain message. Either way the data on screen is fetched again,
 * since someone else may have changed it too (e.g. the last seat was taken).
 * Resolves to `{ value }` when it went through, `null` when it did not.
 * `busy` is true while a change is on its way, so buttons can't be tapped twice.
 * `offline`: what to do instead of the message when the server could not be
 * reached (e.g. keep the change on the phone, data/outbox.ts).
 */
export function useAction() {
  const { s, backend } = useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async <T>(change: (b: Backend) => Promise<T>, opts?: { offline?: () => void }): Promise<{ value: T } | null> => {
    if (!backend) return null;
    setBusy(true);
    try {
      return { value: await change(backend) };
    } catch (e) {
      const code = errorCode(e);
      if (code === 'network' && opts?.offline) opts.offline();
      else dialog.notify(s.errorTitle, s.errors[code]);
      return null;
    } finally {
      await queryClient.invalidateQueries();
      setBusy(false);
    }
  };

  return { run, busy };
}
