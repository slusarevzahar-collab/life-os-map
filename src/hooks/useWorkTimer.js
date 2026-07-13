import { useCallback, useEffect, useRef, useState } from 'react';
import { currentDateKey, workTimerService } from '../services/workTimerService.js';

const SYNC_KEY = 'lifemap.workTimer.sync.v1';
const CHANNEL_NAME = 'lifemap.workTimer.v1';
const PAUSED_KEY = 'lifemap.workTimer.paused.v1';
const ACTIVE_CACHE_KEY = 'lifemap.workTimer.active.v1';
const SYNC_MESSAGE_TYPE = 'timer-state';

function readActiveCache() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(ACTIVE_CACHE_KEY) || 'null');
    return value?.startedAt ? value : null;
  } catch { return null; }
}

function writeActiveCache(session) {
  try {
    if (session?.startedAt) window.sessionStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(ACTIVE_CACHE_KEY);
  } catch {}
}

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

export function createTimerSyncMessage(state, payload = {}, at = Date.now()) {
  return { type: SYNC_MESSAGE_TYPE, state, ...payload, at };
}

export function parseTimerSyncMessage(value) {
  try {
    const message = typeof value === 'string' ? JSON.parse(value) : value;
    return message?.type === SYNC_MESSAGE_TYPE && typeof message.state === 'string' ? message : null;
  } catch { return null; }
}

function broadcast(channel, state, payload = {}) {
  const message = createTimerSyncMessage(state, payload);
  channel?.postMessage(message);
  try { window.localStorage.setItem(SYNC_KEY, JSON.stringify(message)); } catch {}
}

function friendlySyncError(error, fallback) {
  if (error?.code === 'access-key-required') return 'Нужен ключ доступа LifeMap. Нажмите кнопку и введите ключ.';
  if (['vercel-preview-login', 'unexpected-html', 'access-key-rejected', 'preview-environment-missing'].includes(error?.code)) return error.message;
  return fallback;
}

function syncFailureStatus(error) {
  return error?.status === 403 ? 'auth-required' : 'sync-error';
}

export function useWorkTimer({ onSessionChange } = {}) {
  const [activeSession, setActiveSessionState] = useState(() => readActiveCache());
  const [status, setStatus] = useState(() => activeSession ? 'active' : 'idle');
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState(null);
  const [lastSessionSeconds, setLastSessionSeconds] = useState(0);
  const [paused, setPaused] = useState(() => readPaused());
  const [stopFlash, setStopFlash] = useState(false);
  const channelRef = useRef(null);
  const stopFlashTimerRef = useRef(null);
  const activeSessionRef = useRef(activeSession);
  const rolloverRef = useRef(false);

  const setActiveSession = useCallback((session) => {
    activeSessionRef.current = session;
    writeActiveCache(session);
    setActiveSessionState(session);
  }, []);

  const clearStopFlash = useCallback(() => {
    if (stopFlashTimerRef.current) window.clearTimeout(stopFlashTimerRef.current);
    stopFlashTimerRef.current = null;
    setStopFlash(false);
  }, []);

  const flashStopped = useCallback(() => {
    if (stopFlashTimerRef.current) window.clearTimeout(stopFlashTimerRef.current);
    setStopFlash(true);
    stopFlashTimerRef.current = window.setTimeout(() => {
      stopFlashTimerRef.current = null;
      setStopFlash(false);
    }, 2200);
  }, []);

  const refresh = useCallback(async ({ preserveActive = false } = {}) => {
    try {
      const active = await workTimerService.active();
      const nextActive = active.session || null;
      if (readPaused()) {
        const cached = activeSessionRef.current;
        const fallbackSeconds = cached ? (Number(cached.initialSeconds) || 0) + elapsed(cached.startedAt) : 0;
        setActiveSession(null);
        setPaused(true);
        setLastSessionSeconds(Number(active.lastSession?.timerSeconds ?? active.lastSession?.durationSeconds) || fallbackSeconds);
        setStatus('paused');
        setError(null);
        return;
      }
      if (!nextActive && preserveActive && activeSessionRef.current) {
        setStatus('active');
        setError(null);
        return;
      }
      const nextPaused = nextActive ? false : readPaused();
      if (nextActive) writePaused(false);
      setActiveSession(nextActive);
      setPaused(nextPaused);
      setLastSessionSeconds(Number(active.lastSession?.timerSeconds ?? active.lastSession?.durationSeconds) || 0);
      setStatus(nextActive ? 'active' : nextPaused ? 'paused' : 'idle');
      setError(null);
    } catch (nextError) {
      setStatus((current) => current === 'active' ? 'active' : syncFailureStatus(nextError));
      setError(friendlySyncError(nextError, 'Не удалось синхронизировать рабочее время. Повторим автоматически.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [setActiveSession]);

  const applySharedState = useCallback((value) => {
    const message = parseTimerSyncMessage(value);
    if (!message) return false;

    clearStopFlash();
    setError(null);
    if (message.state === 'active' && message.session?.startedAt) {
      writePaused(false);
      setPaused(false);
      setActiveSession(message.session);
      setTick(Date.now());
      setStatus('active');
      return true;
    }

    if (message.state === 'paused') {
      const cached = activeSessionRef.current;
      const fallbackSeconds = cached ? (Number(cached.initialSeconds) || 0) + elapsed(cached.startedAt) : 0;
      const sharedSeconds = Number(message.lastSessionSeconds);
      if (Number.isFinite(sharedSeconds) && sharedSeconds >= 0) setLastSessionSeconds(sharedSeconds);
      else if (cached) setLastSessionSeconds(fallbackSeconds);
      setActiveSession(null);
      writePaused(true);
      setPaused(true);
      setStatus('paused');
      return true;
    }

    if (message.state === 'stopped') {
      const sharedSeconds = Number(message.lastSessionSeconds);
      if (Number.isFinite(sharedSeconds) && sharedSeconds >= 0) setLastSessionSeconds(sharedSeconds);
      setActiveSession(null);
      writePaused(false);
      setPaused(false);
      setStatus('idle');
      flashStopped();
      return true;
    }

    return false;
  }, [clearStopFlash, flashStopped, setActiveSession]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => {
    if (stopFlashTimerRef.current) window.clearTimeout(stopFlashTimerRef.current);
  }, []);
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
    channelRef.current = channel;
    const sync = (event) => { if (!applySharedState(event?.data)) refresh(); };
    const preserve = () => {
      if (readPaused()) applySharedState(createTimerSyncMessage('paused'));
      else refresh({ preserveActive: true });
    };
    if (channel) channel.addEventListener('message', sync);
    const storage = (event) => {
      if (event.key === SYNC_KEY) {
        if (!applySharedState(event.newValue)) refresh();
      } else if (event.key === PAUSED_KEY && event.newValue === '1') {
        applySharedState(createTimerSyncMessage('paused'));
      }
    };
    const visible = () => { if (document.visibilityState === 'visible') preserve(); };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', preserve);
    document.addEventListener('visibilitychange', visible);
    return () => {
      channel?.close();
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', preserve);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [applySharedState, refresh]);
  useEffect(() => {
    if (!activeSession) return undefined;
    let disposed = false;
    const pulse = async () => {
      setTick(Date.now());
      const current = activeSessionRef.current;
      if (!current?.id || !current.dateKey || current.dateKey === currentDateKey() || rolloverRef.current) return;
      rolloverRef.current = true;
      try {
        const response = await workTimerService.rollover(current.id);
        if (disposed || !response.session) return;
        setActiveSession(response.session);
        setTick(Date.now());
        setStatus('active');
        setError(null);
        broadcast(channelRef.current, 'active', { session: response.session });
        onSessionChange?.();
      } catch (nextError) {
        if (!disposed) setError(friendlySyncError(nextError, 'Не удалось создать запись для новых суток. Таймер продолжает считать и повторит попытку.'));
      } finally {
        rolloverRef.current = false;
      }
    };
    const timer = window.setInterval(pulse, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeSession?.id, onSessionChange, setActiveSession]);

  const start = useCallback(async (input = {}) => {
    if (['starting', 'pausing', 'stopping'].includes(status)) return;
    const wasPaused = paused;
    const startedAt = new Date().toISOString();
    const initialSeconds = wasPaused ? lastSessionSeconds : 0;
    clearStopFlash();
    setStatus('starting');
    setError(null);
    setActiveSession({ id: 'pending', startedAt, initialSeconds, status: 'Active', source: 'lifemap', pending: true });
    setTick(Date.now());
    try {
      const response = await workTimerService.start({ ...input, startedAt, initialSeconds });
      const nextSession = response.session ? { ...response.session, startedAt, initialSeconds } : null;
      writePaused(false);
      setPaused(false);
      setActiveSession(nextSession);
      setTick(Date.now());
      setStatus('active');
      broadcast(channelRef.current, 'active', { session: nextSession });
      onSessionChange?.();
    } catch (nextError) {
      setActiveSession(null);
      setStatus(wasPaused ? 'paused' : syncFailureStatus(nextError));
      setError(friendlySyncError(nextError, 'Старт не сохранён. Проверьте соединение и попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [clearStopFlash, lastSessionSeconds, onSessionChange, paused, status]);

  const pause = useCallback(async () => {
    if (!activeSession || ['starting', 'pausing', 'stopping'].includes(status)) return;
    setStatus('pausing');
    setError(null);
    try {
      const response = await workTimerService.pause(activeSession.id);
      const pausedSeconds = response.session?.timerSeconds ?? ((Number(activeSession.initialSeconds) || 0) + elapsed(activeSession.startedAt));
      setLastSessionSeconds(pausedSeconds);
      setActiveSession(null);
      writePaused(true);
      setPaused(true);
      setStatus('paused');
      broadcast(channelRef.current, 'paused', { lastSessionSeconds: pausedSeconds });
      onSessionChange?.();
    } catch (nextError) {
      setStatus('active');
      setError(friendlySyncError(nextError, 'Пауза не сохранилась. Таймер продолжает считаться; попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [activeSession, onSessionChange, status]);

  const stop = useCallback(async () => {
    if (['starting', 'pausing', 'stopping'].includes(status)) return;
    setError(null);
    if (!activeSession) {
      writePaused(false);
      setPaused(false);
      setStatus('idle');
      flashStopped();
      broadcast(channelRef.current, 'stopped', { lastSessionSeconds });
      return;
    }
    setStatus('stopping');
    try {
      const response = await workTimerService.pause(activeSession.id);
      const stoppedSeconds = response.session?.timerSeconds ?? ((Number(activeSession.initialSeconds) || 0) + elapsed(activeSession.startedAt));
      writePaused(false);
      setPaused(false);
      setLastSessionSeconds(stoppedSeconds);
      setActiveSession(null);
      setStatus('idle');
      flashStopped();
      broadcast(channelRef.current, 'stopped', { lastSessionSeconds: stoppedSeconds });
      onSessionChange?.();
    } catch (nextError) {
      setStatus('active');
      setError(friendlySyncError(nextError, 'Остановка не сохранилась. Таймер продолжает считаться; попробуйте ещё раз.'));
      console.warn('work_session_sync_failed', nextError);
    }
  }, [activeSession, flashStopped, lastSessionSeconds, onSessionChange, status]);

  const currentSessionSeconds = activeSession ? (Number(activeSession.initialSeconds) || 0) + elapsed(activeSession.startedAt, tick) : paused ? lastSessionSeconds : 0;

  return { status, activeSession, paused, stopFlash, currentSessionSeconds, lastSessionSeconds, start, pause, stop, refresh, error };
}
