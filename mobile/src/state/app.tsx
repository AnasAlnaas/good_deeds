import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Db, User } from '@/data/types';
import { buildSeed, SEED_VERSION } from '@/demo/seed';
import * as server from '@/demo/server';
import { STRINGS, type Lang, type Strings } from '@/i18n/strings';

const KEYS = { lang: 'gd.lang', onboarded: 'gd.onboarded', session: 'gd.session', db: 'gd.db' };

// Storage can fail (private mode, full disk). The demo still works in memory.
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

interface AppState {
  ready: boolean;
  lang: Lang;
  s: Strings;
  isRTL: boolean;
  onboarded: boolean;
  db: Db;
  now: number;
  me: User | null;
  /** The last signed-in user, kept for the one render in which screens unmount after sign-out. */
  lastMe: User | null;
  setLang(lang: Lang): void;
  finishOnboarding(): void;
  signIn(userId: string): void;
  signOut(): void;
  resetDemo(): void;
  /** Runs a demo-server mutation. Throws server.ApiError on a rule violation. */
  run(mutation: (db: Db, now: number) => Db): void;
}

const Ctx = createContext<AppState | null>(null);

function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('ar');
  const [onboarded, setOnboarded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Kept after sign-out so screens still mounted for one render have a user (see useMe).
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [db, setDb] = useState<Db>(() => buildSeed(Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const dbRef = useRef(db);

  const commit = useCallback((next: Db) => {
    dbRef.current = next;
    setDb(next);
    save(KEYS.db, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      const [l, o, sess, raw] = await Promise.all([load(KEYS.lang), load(KEYS.onboarded), load(KEYS.session), load(KEYS.db)]);
      setLangState(l === 'ar' || l === 'en' ? l : deviceLang());
      setOnboarded(o === '1');
      setSessionId(sess);
      setLastSessionId(sess);
      let stored: Db | null = null;
      try {
        stored = raw ? (JSON.parse(raw) as Db) : null;
      } catch {
        stored = null;
      }
      commit(server.tick(stored?.version === SEED_VERSION ? stored : buildSeed(Date.now()), Date.now()));
      setReady(true);
    })();
  }, [commit]);

  // The clock drives "happening now" and the scheduled auto-close job.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const ticked = server.tick(dbRef.current, t);
      if (ticked !== dbRef.current) commit(ticked);
    }, 30_000);
    return () => clearInterval(id);
  }, [commit]);

  const value = useMemo<AppState>(() => {
    const me = sessionId ? db.users.find((u) => u.id === sessionId && !u.deleted_at) ?? null : null;
    const lastMe = db.users.find((u) => u.id === lastSessionId) ?? null;
    return {
      ready,
      lang,
      s: STRINGS[lang],
      isRTL: lang === 'ar',
      onboarded,
      db,
      now,
      me,
      lastMe,
      setLang(l) {
        setLangState(l);
        save(KEYS.lang, l);
      },
      finishOnboarding() {
        setOnboarded(true);
        save(KEYS.onboarded, '1');
      },
      signIn(userId) {
        setSessionId(userId);
        setLastSessionId(userId);
        save(KEYS.session, userId);
      },
      signOut() {
        setSessionId(null);
        save(KEYS.session, null);
      },
      resetDemo() {
        commit(buildSeed(Date.now()));
      },
      run(mutation) {
        const t = Date.now();
        setNow(t);
        commit(mutation(server.tick(dbRef.current, t), t));
      },
    };
  }, [ready, lang, onboarded, db, now, sessionId, lastSessionId, commit]);

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
