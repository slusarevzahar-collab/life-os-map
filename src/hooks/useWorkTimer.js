import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workTimerService } from '../services/workTimerService.js';

const SYNC_KEY = 'lifemap.workTimer.sync.v1';
const CHANNEL_NAME = 'lifemap.workTimer.v1';
const PAUSED_KEY = 'lifemap.workTimer.paused.v1';

function readPaused() {
  try { return window.localStorage.getItem(PAUSED_KEY) === '1'; } catch { return false; }
}

function writePaused(value) {
  try {
    if (value) window.localStorage.setItem(PAUSED_KEY, '1');
    else window.localStorage.removeItem(PAUSED_KEY);
  } catch {}
}

function elapsed(startedAt, now = Date.now()) {
  const start = new Date(startedAt).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

function broadcast(channel) {
  channel?.postMessage({ type: 'changed', at: Date.now() });
  try { window.localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {}
}

function friendlySyncError(error, fallback) {
  if (['vercel-preview-login', 'unexpected-html', 'access-key-rejected', 'preview-environment-missing'].includes(error?.code)) return error.message;
  return fallback;
}

export function useWorkTimer({ onSessionChange } = {}) {
  const [status, setStatus] = useState('idle');
  const [activeSession, setActiveSession] = useState(null);
  const [stats, setStats] = useState({ totalSeconds: 0, asOf: null });
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState(null);
  const [lastSessionSeconds, setLastSessionSeconds] = useState(0);
  const [paused, setPaused] = useState(() => readPaused());
  const channelRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [active, today] = await Promise.all([workTimerService.active(), workTimerService.today()]);
      const nextActive = active.session || null;
      const nextPaused = nextActive ? false : readPaused();
      if (nextActive) writePaused(false);
      setActiveSession(nextActive);
      setPaused(nextPaused);
      setStats(today.stats || { totalSeconds: 0, asOf: null });
      setStatus(nextActive ? 'active' : nextPaused ? 'paused' : 'idle');
      setError(null);
    } catch (nextError) {
      setStatus((current) => current === 'active' ? 'active' : 'sync-error');
      setError(friendlySyncError(nextError, 'Не удалось синхронизировать рабочее время. Повторим автоматически.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    channelRef.current = channel;
    const sync = () => refresh();
    if (channel) channel.addEventListener('message', sync);
    const storage = (event) => { if ([SYNC_KEY, PAUSED_KEY].includes(event.key)) sync(); };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      channel?.close();
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!activeSession) return undefined;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  const start = useCallback(async (input = {}) => {
    if (['starting', 'pausing', 'stopping'].includes(status)) return;
    const wasPaused = paused;
    setStatus('starting');
    setError(null);
    try {
      const response = await workTimerService.start(input);
      writePaused(false);
      setPaused(false);
      setActiveSession(response.session || null);
      setLastSessionSeconds(0);
      setTick(Date.now());
      setStatus('active');
      await refresh();
      broadcast(channelRef.current);
      onSessionChange?.();
    } catch (nextError) {
      setStatus(wasPaused ? 'paused' : 'sync-error');
      setError(friendlySyncError(nextError, 'Старт не сохранён. Проверьте соединение и попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [onSessionChange, paused, refresh, status]);

  const pause = useCallback(async () => {
    if (!activeSession || ['starting', 'pausing', 'stopping'].includes(status)) return;
    setStatus('pausing');
    setError(null);
    try {
      const response = await workTimerService.pause(activeSession.id);
      setLastSessionSeconds(response.session?.durationSeconds ?? elapsed(activeSession.startedAt));
      setActiveSession(null);
      writePaused(true);
      setPaused(true);
      setStatus('paused');
      await refresh();
      broadcast(channelRef.current);
      onSessionChange?.();
    } catch (nextError) {
      setStatus('active');
      setError(friendlySyncError(nextError, 'Пауза не сохранилась. Таймер продолжает считаться; попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [activeSession, onSessionChange, refresh, status]);

  const stop = useCallback(async () => {
    if (['starting', 'pausing', 'stopping'].includes(status)) return;
    setError(null);
    if (!activeSession) {
      writePaused(false);
      setPaused(false);
      setLastSessionSeconds(0);
      setStatus('idle');
      broadcast(channelRef.current);
      return;
    }
    setStatus('stopping');
    try {
      await workTimerService.pause(activeSession.id);
      writePaused(false);
      setPaused(false);
      setLastSessionSeconds(0);
      setActiveSession(null);
      setStatus('idle');
      await refresh();
      broadcast(channelRef.current);
      onSessionChange?.();
    } catch (nextError) {
      setStatus('active');
      setError(friendlySyncError(nextError, 'Остановка не сохранилась. Таймер продолжает считаться; попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [activeSession, onSessionChange, refresh, status]);

  const currentSessionSeconds = activeSession ? elapsed(activeSession.startedAt, tick) : paused ? lastSessionSeconds : 0;
  const todayTotalSeconds = useMemo(() => {
    const base = Number(stats.totalSeconds) || 0;
    if (!activeSession || !stats.asOf) return base;
    return base + elapsed(stats.asOf, tick);
  }, [activeSession, stats, tick]);

  return { status, activeSession, paused, currentSessionSeconds, todayTotalSeconds, start, pause, stop, refresh, error };
}
