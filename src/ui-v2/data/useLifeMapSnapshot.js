// LifeMap UI V2 — useLifeMapSnapshot (Stage 4)
// Loads and refreshes the real snapshot through the existing runtime contract.
// The hook keeps one request in flight, one cancellable recursive timeout,
// preserves the last good snapshot after transient failures, and ignores work
// that completes after unmount.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSnapshot, emptySnapshot, dataState } from '../../lib/lifeMapRuntime.js';

const REFRESH_MS = 15000;

export function useLifeMapSnapshot() {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot('loading'));
  const [apiState, setApiState] = useState('loading');
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const hasLoadedRef = useRef(false);
  const requestIdRef = useRef(0);
  const timerRef = useRef(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(null);

  const load = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;

    const requestId = (requestIdRef.current += 1);
    if (!hasLoadedRef.current) setApiState('loading');

    const request = fetchSnapshot()
      .then((data) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return data;
        hasLoadedRef.current = true;
        setHasLoadedOnce(true);
        setSnapshot(data);
        setApiState(data.meta?.source?.includes('mock') ? 'mock data' : 'connected');
        setError('');
        return data;
      })
      .catch((err) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) throw err;
        const message = err?.message || 'Unknown error';
        setError(message);
        if (hasLoadedRef.current) {
          // Keep the last good snapshot visible; only the status changes.
          setApiState('api offline');
        } else {
          setSnapshot(emptySnapshot('api-offline', message));
          setApiState('api offline');
        }
        throw err;
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const clearTimer = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    };

    const scheduleNext = () => {
      clearTimer();
      if (!mountedRef.current || document.visibilityState !== 'visible') return;
      timerRef.current = window.setTimeout(() => {
        load()
          .catch(() => {})
          .finally(() => {
            if (mountedRef.current) scheduleNext();
          });
      }, REFRESH_MS);
    };

    const refreshNow = () => {
      clearTimer();
      load()
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) scheduleNext();
        });
    };

    refreshNow();

    const onVisibilityChange = () => {
      clearTimer();
      if (document.visibilityState === 'visible') refreshNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const status = dataState(snapshot, apiState);
  return { snapshot, status, error, hasLoadedOnce, refresh: load };
}
