// LifeMap UI V2 — useLifeMapSnapshot (Stage 4)
// Loads and refreshes the real snapshot through the existing runtime contract.
// The hook keeps one request in flight, one cancellable recursive timeout,
// preserves the last good snapshot after transient failures, and ignores work
// that completes after unmount.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSnapshot, emptySnapshot, dataState } from '../../lib/lifeMapRuntime.js';

const REFRESH_MS = 15000;
export const SNAPSHOT_CACHE_KEY = 'lifemap.ui-v2.last-good-snapshot.v1';
export const SNAPSHOT_CACHE_VERSION = 1;
const SNAPSHOT_ARRAY_FIELDS = ['goals', 'tasks', 'sessions', 'projectAreas', 'dreams', 'signals'];

export function isValidLifeMapSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.meta || typeof snapshot.meta !== 'object') return false;
  if (!snapshot.currentFocus || typeof snapshot.currentFocus !== 'object') return false;
  return SNAPSHOT_ARRAY_FIELDS.every((field) => Array.isArray(snapshot[field]));
}

export function readCachedSnapshot(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!storage) return null;
  try {
    const cached = JSON.parse(storage.getItem(SNAPSHOT_CACHE_KEY) || 'null');
    if (cached?.version !== SNAPSHOT_CACHE_VERSION || !isValidLifeMapSnapshot(cached.snapshot)) return null;
    const source = String(cached.snapshot.meta?.source || '');
    if (!source || /mock|api-offline|loading/i.test(source)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!storage || !isValidLifeMapSnapshot(snapshot)) return;
  const source = String(snapshot.meta?.source || '');
  if (!source || /mock|api-offline|loading/i.test(source)) return;
  try {
    storage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify({
      version: SNAPSHOT_CACHE_VERSION,
      savedAt: new Date().toISOString(),
      snapshot,
    }));
  } catch {
    // A full or disabled storage area must never break the live snapshot path.
  }
}

export function useLifeMapSnapshot({ enabled = true } = {}) {
  const initialCacheRef = useRef(enabled ? readCachedSnapshot() : null);
  const [snapshot, setSnapshot] = useState(() => initialCacheRef.current?.snapshot || emptySnapshot('loading'));
  const [apiState, setApiState] = useState(() => initialCacheRef.current ? 'api offline' : 'loading');
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => Boolean(initialCacheRef.current));
  const [isStale, setIsStale] = useState(() => Boolean(initialCacheRef.current));

  const hasLoadedRef = useRef(Boolean(initialCacheRef.current));
  const requestIdRef = useRef(0);
  const timerRef = useRef(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(null);

  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null);
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
        setIsStale(false);
        setError('');
        writeCachedSnapshot(data);
        return data;
      })
      .catch((err) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) throw err;
        const message = err?.message || 'Unknown error';
        setError(message);
        if (hasLoadedRef.current) {
          // Keep the last good snapshot visible; only the status changes.
          setApiState('api offline');
          setIsStale(true);
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
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      return () => {
        mountedRef.current = false;
        requestIdRef.current += 1;
      };
    }

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
  }, [enabled, load]);

  const status = dataState(snapshot, apiState);
  return {
    snapshot,
    status,
    error,
    hasLoadedOnce,
    isStale,
    cachedAt: initialCacheRef.current?.savedAt || '',
    refresh: load,
  };
}
