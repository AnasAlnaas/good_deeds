import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

import type { EventStatus } from '../../shared/types';
import { failureCode } from './api';
import { t, type ErrorCode } from './strings';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`btn btn-${variant} ${className ?? ''}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const STATUS_TONE: Record<EventStatus, Tone> = {
  draft: 'neutral',
  published: 'primary',
  running: 'danger',
  finished: 'success',
  cancelled: 'warning',
  rejected: 'warning',
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{t.status[status]}</Badge>;
}

export function PageHeader({ title, body, actions }: { title: string; body?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {body && <p className="muted">{body}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function ErrorNote({ code }: { code: ErrorCode | null }) {
  return code ? <Notice tone="danger">{t.errors[code]}</Notice> : null;
}

/** What a page shows before its data arrives: a spinner, or why it failed and a way to try again. */
export function QueryState({ query }: { query: UseQueryResult<unknown> }) {
  if (query.isError) {
    const code = failureCode(query.error);
    return (
      <div className="state">
        <Notice tone="danger">{t.errors[code]}</Notice>
        {(code === 'network' || code === 'internal_error') && (
          <Button variant="secondary" onClick={() => query.refetch()}>
            {t.retry}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="state" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{t.loading}</span>
    </div>
  );
}

/**
 * Runs a change through the server. A refusal comes back as `error` (shown
 * with ErrorNote). Either way every list on screen is fetched again, since
 * someone else may have changed it too. Resolves to `{ value }` or `null`.
 */
export function useAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const run = async <T,>(change: () => Promise<T>): Promise<{ value: T } | null> => {
    setBusy(true);
    setError(null);
    try {
      return { value: await change() };
    } catch (e) {
      setError(failureCode(e));
      return null;
    } finally {
      await client.invalidateQueries();
      setBusy(false);
    }
  };
  return { run, busy, error, setError };
}
