import { Button } from '@/components/Button';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import type { FollowKind } from '../../../shared/follows';

/**
 * Follow or stop following an institution, a supervisor or a class (owner's
 * decisions, 2026-11-21): a new event from it is announced once it is published.
 * Private: nobody sees who follows whom.
 */
export function FollowButton({ kind, id, following, label }: { kind: FollowKind; id: string; following: boolean; label?: string }) {
  const { s } = useApp();
  const { run, busy } = useAction();
  return (
    <Button
      variant={following ? 'quiet' : 'secondary'}
      icon={following ? 'notifications' : 'notifications-outline'}
      label={following ? s.follows.following : (label ?? s.follows.follow)}
      disabled={busy}
      onPress={() => run((b) => (following ? b.unfollow(kind, id) : b.follow(kind, id)))}
    />
  );
}
