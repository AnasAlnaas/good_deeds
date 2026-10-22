import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { User } from '../../shared/types';
import { ApiFailure, configure, failureCode } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Only a lost connection is worth retrying; a refusal stays a refusal.
      retry: (failures, error) => failureCode(error) === 'network' && failures < 2,
    },
  },
});

interface Session {
  token: string;
  user: User;
}

interface Auth {
  session: Session | null;
  signIn(session: Session): void;
  signOut(): void;
}

// The panel is a browser page, so the session lives in browser storage. It
// only ever holds an admin's session (see Login).
const KEY = 'gd.admin.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    configure({ token: s?.token ?? null, onUnauthorized: () => {} });
    return s;
  });

  const signOut = useCallback(() => {
    configure({ token: null, onUnauthorized: () => {} });
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored.
    }
    setSession(null);
    client.clear();
  }, [client]);

  // The server refused the token (expired, or no longer an admin): back to sign-in.
  configure({ token: session?.token ?? null, onUnauthorized: signOut });

  const value = useMemo<Auth>(
    () => ({
      session,
      signIn(next) {
        if (next.user.role !== 'admin') throw new ApiFailure('forbidden');
        configure({ token: next.token, onUnauthorized: signOut });
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // The session still works until the page is closed.
        }
        setSession(next);
      },
      signOut,
    }),
    [session, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
