import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { useAuth } from './auth';
import { getLastSyncAt, runSync } from './sync';

export type SyncState = {
  running: boolean;
  error: string | null;
  offline: boolean;
  lastAt: number | null;
  pushed: number;
  pulled: number;
};

export function useSync({ auto = true }: { auto?: boolean } = {}) {
  const { token } = useAuth();
  const [state, setState] = useState<SyncState>({
    running: false,
    error: null,
    offline: false,
    lastAt: getLastSyncAt(),
    pushed: 0,
    pulled: 0,
  });

  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (!token || runningRef.current) return;

    runningRef.current = true;
    setState((current) => ({ ...current, running: true, error: null }));

    try {
      const result = await runSync(token);
      setState({
        running: false,
        error: null,
        offline: false,
        lastAt: result.at,
        pushed: result.pushed,
        pulled: result.pulled,
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

  return { ...state, run };
}
