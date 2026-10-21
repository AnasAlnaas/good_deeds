import { Alert } from 'react-native';

import type { Db } from '@/data/types';
import { ApiError } from '@/demo/server';
import { useApp } from './app';

/**
 * Wraps a demo-server call: shows the server's rule violation as a plain
 * message and returns whether the call went through.
 */
export function useAction() {
  const { run, s } = useApp();
  return (mutation: (db: Db, now: number) => Db) => {
    try {
      run(mutation);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? s.errors[e.code] : String(e);
      Alert.alert(s.errorTitle, msg);
      return false;
    }
  };
}
