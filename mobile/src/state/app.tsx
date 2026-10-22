import AsyncStorage from '@react-native-async-storage/async-storage';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState as NativeAppState } from 'react-native';

import { createApiBackend } from '@/data/apiBackend';
import type { Backend, Mode } from '@/data/backend';
import { API_URL } from '@/data/config';
import { createDemoBackend, type DemoStore } from '@/data/demoBackend';
import * as tokenStore from '@/data/tokenStore';
import type { Db, User } from '@/data/types';
import { buildSeed, SEED_VERSION } from '@/demo/seed';
import * as server from '@/demo/server';
import { STRINGS, type Lang, type Strings } from '@/i18n/strings';

const KEYS = {
  lang: 'gd.lang',
  onboarded: 'gd.onboarded',
  mode: 'gd.mode',
  session: 'gd.session', // demo: the chosen demo account
  db: 'gd.db', // demo: the on-phone data
  apiUser: 'gd.apiUser', // server: the signed-in user (the token itself is in tokenStore)
};

// Storage can fail (private mode, full disk). The app still works in memory.
async function load(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string | null) {
  (value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(() => {});
}
function parse<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface ApiSession {
  token: string;
  user: User;
}

interface AppState {
  ready: boolean;
  lang: Lang;
  s: Strings;
  isRTL: boolean;
  onboarded: boolean;
  now: number;
  /** `demo`: offline demo accounts. `api`: phone sign-in against the server. */
  mode: Mode;
  /** The server's address, or null when this build has none (demo only). */
  apiUrl: string | null;
  me: User | null;
  /** The last signed-in user, kept for the one render in which screens unmount after sign-out. */
  lastMe: User | null;
  /** How the screens read and change data; null when nobody is signed in. */
  backend: Backend | null;
  /** Prefix of every cached query, so one account never sees another's data. */
  sessionKey: string;
  /** The demo's data, for the demo accounts on the login screen. */
  demoDb: Db;
  setLang(lang: Lang): void;
  setMode(mode: Mode): void;
  finishOnboarding(): void;
  signInDemo(userId: string): void;
  signInApi(token: string, user: User): void;
  /** Keeps the stored profile current when the server sends a fresh copy. */
  updateApiUser(user: User): void;
  signOut(): void;
  resetDemo(): void;
}

const Ctx = createContext<AppState | null>(null);

function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('ar');
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setModeState] = useState<Mode>('demo');
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Kept after sign-out so screens still mounted for one render have a user (see useMe).
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [apiSession, setApiSession] = useState<ApiSession | null>(null);
  const [lastApiUser, setLastApiUser] = useState<User | null>(null);
  // The demo's data. The demo backend reads and writes it outside rendering
  // (in queries and actions); `db` mirrors it for the screens that render it.
  const [data] = useState(() => {
    let current = buildSeed(Date.now());
    return { get: () => current, set: (next: Db) => void (current = next) };
  });
  const [db, setDb] = useState<Db>(data.get);
  const [now, setNow] = useState(() => Date.now());

  const commit = useCallback(
    (next: Db) => {
      data.set(next);
      setDb(next);
      save(KEYS.db, JSON.stringify(next));
    },
    [data],
  );

  const store = useMemo<DemoStore>(() => ({ get: data.get, commit }), [data, commit]);

  useEffect(() => {
    (async () => {
      const [l, o, m, sess, raw, apiUser, token] = await Promise.all([
        load(KEYS.lang),
        load(KEYS.onboarded),
        load(KEYS.mode),
        load(KEYS.session),
        load(KEYS.db),
        load(KEYS.apiUser),
        tokenStore.getToken(),
      ]);
      setLangState(l === 'ar' || l === 'en' ? l : deviceLang());
      setOnboarded(o === '1');
      setModeState(m === 'api' && API_URL ? 'api' : 'demo');
      setSessionId(sess);
      setLastSessionId(sess);
      const user = parse<User>(apiUser);
      if (token && user) {
        setApiSession({ token, user });
        setLastApiUser(user);
      }
      const stored = parse<Db>(raw);
      commit(server.tick(stored?.version === SEED_VERSION ? stored : buildSeed(Date.now()), Date.now()));
      setReady(true);
    })();
  }, [commit]);

  // The clock drives "happening now". Every 30 s the demo runs its auto-close
  // job and the screens on display fetch fresh data.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const ticked = server.tick(data.get(), t);
      if (ticked !== data.get()) commit(ticked);
      queryClient.invalidateQueries();
    }, 30_000);
    return () => clearInterval(id);
  }, [data, commit, queryClient]);

  // Coming back to the app refreshes what is on screen.
  useEffect(() => {
    const sub = NativeAppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => sub.remove();
  }, []);

  const signOut = useCallback(() => {
    if (mode === 'demo') {
      setSessionId(null);
      save(KEYS.session, null);
    } else {
      setApiSession(null);
      save(KEYS.apiUser, null);
      tokenStore.clearToken();
    }
    queryClient.clear();
  }, [mode, queryClient]);

  // The server refused the token (expired, or the account was deleted elsewhere).
  const onUnauthorized = useCallback(() => {
    signOut();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  }, [signOut]);

  const demoMe = sessionId ? db.users.find((u) => u.id === sessionId && !u.deleted_at) ?? null : null;
  const me = mode === 'demo' ? demoMe : apiSession?.user ?? null;
  const lastMe = mode === 'demo' ? db.users.find((u) => u.id === lastSessionId) ?? null : lastApiUser;
  const meId = me?.id ?? null;
  const token = apiSession?.token ?? null;

  const backend = useMemo<Backend | null>(() => {
    if (!meId) return null;
    if (mode === 'demo') return createDemoBackend(store, meId);
    return API_URL && token ? createApiBackend({ baseUrl: API_URL, token, onUnauthorized }) : null;
  }, [mode, meId, token, store, onUnauthorized]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      lang,
      s: STRINGS[lang],
      isRTL: lang === 'ar',
      onboarded,
      now,
      mode,
      apiUrl: API_URL,
      me,
      lastMe,
      backend,
      sessionKey: `${mode}:${meId ?? 'none'}`,
      demoDb: db,
      setLang(l) {
        setLangState(l);
        save(KEYS.lang, l);
      },
      setMode(m) {
        setModeState(m);
        save(KEYS.mode, m);
      },
      finishOnboarding() {
        setOnboarded(true);
        save(KEYS.onboarded, '1');
      },
      signInDemo(userId) {
        setSessionId(userId);
        setLastSessionId(userId);
        save(KEYS.session, userId);
      },
      signInApi(newToken, user) {
        setApiSession({ token: newToken, user });
        setLastApiUser(user);
        save(KEYS.apiUser, JSON.stringify(user));
        tokenStore.setToken(newToken);
      },
      updateApiUser(user) {
        if (!apiSession || JSON.stringify(apiSession.user) === JSON.stringify(user)) return;
        setApiSession({ ...apiSession, user });
        setLastApiUser(user);
        save(KEYS.apiUser, JSON.stringify(user));
      },
      signOut,
      resetDemo() {
        commit(buildSeed(Date.now()));
        queryClient.invalidateQueries();
      },
    }),
    [ready, lang, onboarded, now, mode, me, lastMe, backend, meId, db, apiSession, signOut, commit, queryClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** The signed-in user. Only call inside screens that require a session. */
export function useMe() {
  const { me, lastMe } = useApp();
  const user = me ?? lastMe;
  if (!user) throw new Error('useMe without a session');
  return user;
}
