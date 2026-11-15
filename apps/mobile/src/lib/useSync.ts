import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from './api';
import { useAuth } from './auth';
import { getLastSyncAt, runSyncShared } from './sync';

export type SyncState = {
  running: boolean;
  error: string | null;
  offline: boolean;
  lastAt: number | null;
  pushed: number;
  pulled: number;
  attempts: number;
};

/** Evita que várias telas disparem sync ao mesmo tempo quando o app volta. */
let lastAutoSyncAt = 0;
const RESUME_MIN_INTERVAL_MS = 60_000;

export function useSync({ auto = true }: { auto?: boolean } = {}) {
  const { token } = useAuth();
  const [state, setState] = useState<SyncState>({
    running: false,
    error: null,
    offline: false,
    lastAt: getLastSyncAt(),
    pushed: 0,
    pulled: 0,
    attempts: 0,
  });

  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (!token || runningRef.current) return;

    runningRef.current = true;
    lastAutoSyncAt = Date.now();
    setState((current) => ({ ...current, running: true, error: null }));

    try {
      const result = await runSyncShared(token);
      setState({
        running: false,
        error: null,
        offline: false,
        lastAt: result.at,
        pushed: result.pushed,
        pulled: result.pulled,
        attempts: result.attempts,
      });
    } catch (error) {
      const apiError = error as ApiError;
      setState((current) => ({
        ...current,
        running: false,
        offline: apiError.isOffline,
        error: apiError.isOffline ? null : apiError.message,
      }));
    } finally {
      runningRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (auto) void run();
  }, [auto, run]);

  // voltar ao app é o momento natural de sincronizar
  useEffect(() => {
    if (!auto || !token) return;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (Date.now() - lastAutoSyncAt < RESUME_MIN_INTERVAL_MS) return;
      void run();
    });

    return () => subscription.remove();
  }, [auto, run, token]);

  return { ...state, run };
}
