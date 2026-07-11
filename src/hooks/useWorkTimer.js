import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workTimerService } from '../services/workTimerService.js';

const SYNC_KEY = 'lifemap.workTimer.sync.v1';
const CHANNEL_NAME = 'lifemap.workTimer.v1';

function elapsed(startedAt, now = Date.now()) {
  const start = new Date(startedAt).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

function broadcast(channel) {
  channel?.postMessage({ type: 'changed', at: Date.now() });
  try { window.localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {}
}

export function useWorkTimer({ onSessionChange } = {}) {
  const [status, setStatus] = useState('idle');
  const [activeSession, setActiveSession] = useState(null);
  const [stats, setStats] = useState({ totalSeconds: 0, asOf: null });
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState(null);
  const [lastSessionSeconds, setLastSessionSeconds] = useState(0);
  const channelRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [active, today] = await Promise.all([workTimerService.active(), workTimerService.today()]);
      setActiveSession(active.session || null);
      setStats(today.stats || { totalSeconds: 0, asOf: null });
      setStatus(active.session ? 'active' : 'idle');
      setError(null);
    } catch (nextError) {
      setStatus((current) => current === 'active' ? 'active' : 'sync-error');
      setError('Не удалось синхронизировать рабочее время. Повторим автоматически.');
      console.warn('work_session_sync_failed', nextError);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    channelRef.current = channel;
    const sync = () => refresh();
    if (channel) channel.addEventListener('message', sync);
    const storage = (event) => { if (event.key === SYNC_KEY) sync(); };
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
    if (['starting', 'pausing'].includes(status)) return;
    setStatus('starting');
    setError(null);
    try {
      const response = await workTimerService.start(input);
      setActiveSession(response.session || null);
      setLastSessionSeconds(0);
      setTick(Date.now());
      setStatus('active');
      await refresh();
      broadcast(channelRef.current);
      onSessionChange?.();
    } catch (nextError) {
      setStatus('sync-error');
      setError('Старт не сохранён. Проверьте соединение и попробуйте ещё раз.');
      console.warn('work_session_sync_failed', nextError);
    }
  }, [onSessionChange, refresh, status]);

  const pause = useCallback(async () => {
    if (!activeSession || ['starting', 'pausing'].includes(status)) return;
    setStatus('pausing');
    setError(null);
    try {
      const response = await workTimerService.pause(activeSession.id);
      setLastSessionSeconds(response.session?.durationSeconds ?? elapsed(activeSession.startedAt));
      setActiveSession(null);
      setStatus('idle');
      await refresh();
      broadcast(channelRef.current);
      onSessionChange?.();
    } catch (nextError) {
      setStatus('active');
      setError('Пауза не сохранилась. Таймер продолжает считаться; попробуйте ещё раз.');
      console.warn('work_session_sync_failed', nextError);
    }
  }, [activeSession, onSessionChange, refresh, status]);

  const currentSessionSeconds = activeSession ? elapsed(activeSession.startedAt, tick) : lastSessionSeconds;
  const todayTotalSeconds = useMemo(() => {
    const base = Number(stats.totalSeconds) || 0;
    if (!activeSession || !stats.asOf) return base;
    return base + elapsed(stats.asOf, tick);
  }, [activeSession, stats, tick]);

  return { status, activeSession, currentSessionSeconds, todayTotalSeconds, start, pause, refresh, error };
}

