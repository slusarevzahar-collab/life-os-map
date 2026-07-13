// LifeMap UI V2 — useInboxData (Stage 5B1, fix pass 2).
// Live Inbox data layer for the morph InboxWindow. Reuses ONLY the existing
// runtime contracts (lifeMapRuntime.js) — the 403 access-key flow stays
// solely in lifeMapRuntime.js's requestJson; this hook never reads/writes a
// secret.
//
// Polling state machine (no setInterval anywhere):
// - signals poll ~15s, assistant status ~30s, both run unconditionally while
//   the window is mounted and the tab is visible.
// - the reprocess-job 3s loop is CONDITIONAL: it runs a single check on
//   mount (to pick up a job already running from a previous session), and
//   only re-schedules itself while the fetched status is `running` or
//   `waiting_rate_limit`. idle/completed/failed/null does not keep a timer
//   alive. `reprocess()` restarts the loop when it starts a new job.
// - every chain uses recursive setTimeout: the next call is only scheduled
//   after the previous request settles, so a slow response can never pile
//   up overlapping calls.
// - while `document.visibilityState !== 'visible'` no request fires; each
//   due tick just reschedules itself. The moment the tab becomes visible
//   again, one safe refresh runs immediately for every poll (respecting the
//   in-flight/generation guards below), then the normal cadence resumes.
// - each endpoint has its own in-flight guard (max one request at a time)
//   and every async function captures the current mount "generation" up
//   front; if the hook's active-effect has since torn down and restarted
//   (or fully unmounted) by the time the request resolves, the stale
//   response is dropped instead of updating state.
// - mutations (status change, reprocess) are gated by `networkWritable` —
//   the same flag LifeMapShell uses to disable task mutations while
//   showing fallback/mock data — and call `onRefreshSnapshot` after
//   succeeding so the rest of the shell picks up the change. A change to
//   `inboxRefreshRevision` (bumped by the shell after an Assistant action
//   that could affect Inbox data) also triggers one extra safe refresh.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAssistantStatus,
  fetchInboxAssets,
  fetchInboxReprocessStatus,
  patchSignal,
  reprocessInboxSignals,
} from '../../lib/lifeMapRuntime.js';
import { formatTime } from '../adapters/inboxUiAdapter.js';

const SIGNALS_MS = 15000;
const STATUS_MS = 30000;
const JOB_MS = 3000;
const OFFLINE_WRITE_ERROR = 'Изменения недоступны: LifeMap сейчас показывает последние известные данные без записи в API.';
const JOB_ACTIVE_STATUSES = ['running', 'waiting_rate_limit'];

function isDocumentVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useInboxData({ active = true, fallbackSignals = [], networkWritable = true, onRefreshSnapshot, inboxRefreshRevision = 0 } = {}) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [localStatus, setLocalStatus] = useState({});
  const [busySignalId, setBusySignalId] = useState('');
  const [reprocessing, setReprocessing] = useState(false);
  const [job, setJob] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [enteringIds, setEnteringIds] = useState(new Set());

  const signalsRef = useRef([]);
  const jobRef = useRef(null);
  const lastJobProgressRef = useRef(-1);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const fallbackRef = useRef(fallbackSignals);
  fallbackRef.current = fallbackSignals;
  const networkWritableRef = useRef(networkWritable);
  networkWritableRef.current = networkWritable;
  const onRefreshSnapshotRef = useRef(onRefreshSnapshot);
  onRefreshSnapshotRef.current = onRefreshSnapshot;
  const reprocessBusyRef = useRef(false);
  const signalBusyIdsRef = useRef(new Set());
  const inFlightRef = useRef({ signals: false, status: false, job: false });
  const timeoutsRef = useRef(new Set());
  const runJobNowRef = useRef(null);
  const runSignalsNowRef = useRef(null);
  const runStatusNowRef = useRef(null);
  const revisionRef = useRef(inboxRefreshRevision);

  const setSafeTimeout = useCallback((fn, ms) => {
    const id = window.setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
    return id;
  }, []);
  useEffect(() => () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current.clear();
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try { await onRefreshSnapshotRef.current?.(); } catch { /* shell refresh is best-effort */ }
  }, []);

  const isStale = useCallback((gen) => !mountedRef.current || generationRef.current !== gen, []);

  const loadSignals = useCallback(async ({ initial = false } = {}) => {
    if (inFlightRef.current.signals) return;
    const gen = generationRef.current;
    inFlightRef.current.signals = true;
    if (initial) setLoading(true);
    try {
      const rows = await fetchInboxAssets();
      if (isStale(gen)) return;
      const next = rows.length ? rows : fallbackRef.current;
      const previousIds = new Set(signalsRef.current.map((item) => item.id));
      const added = next.filter((item) => !previousIds.has(item.id)).map((item) => item.id);
      signalsRef.current = next;
      setSignals(next);
      if (!initial && added.length) {
        setEnteringIds(new Set(added));
        setSafeTimeout(() => { if (!isStale(gen)) setEnteringIds(new Set()); }, 900);
      }
      setError('');
    } catch (err) {
      if (isStale(gen)) return;
      if (!signalsRef.current.length) {
        signalsRef.current = fallbackRef.current;
        setSignals(fallbackRef.current);
      }
      setError(`Не удалось обновить LM Inbox: ${err.message}`);
    } finally {
      inFlightRef.current.signals = false;
      if (initial && !isStale(gen)) setLoading(false);
    }
  }, [isStale, setSafeTimeout]);

  const loadAiStatus = useCallback(async () => {
    if (inFlightRef.current.status) return;
    const gen = generationRef.current;
    inFlightRef.current.status = true;
    try {
      const status = await fetchAssistantStatus();
      if (!isStale(gen)) setAiStatus(status);
    } catch {
      // Keep the last known meter; the window must not crash on status errors.
    } finally {
      inFlightRef.current.status = false;
    }
  }, [isStale]);

  const syncJobStatus = useCallback(async () => {
    if (inFlightRef.current.job) return jobRef.current;
    const gen = generationRef.current;
    inFlightRef.current.job = true;
    try {
      const response = await fetchInboxReprocessStatus();
      if (isStale(gen)) return jobRef.current;
      const nextJob = response.job || null;
      const previous = jobRef.current;
      jobRef.current = nextJob;
      setJob(nextJob);
      const working = JOB_ACTIVE_STATUSES.includes(nextJob?.status);
      setReprocessing(working);

      if (nextJob?.status === 'waiting_rate_limit') {
        setNotice(`AI-пул ждёт обновления квоты и продолжит сам${nextJob.resumeAfter ? ` после ${formatTime(nextJob.resumeAfter)}` : ''}. Прогресс сохранён.`);
      } else if (nextJob?.status === 'running') {
        const done = Number(nextJob.processed || 0) + Number(nextJob.failed || 0);
        setNotice(`Разбираю сигналы: ${done}/${nextJob.total || '…'}${nextJob.current ? ` · ${nextJob.current}` : ''}`);
        if (done !== lastJobProgressRef.current) {
          lastJobProgressRef.current = done;
          await loadSignals({ initial: false });
          await loadAiStatus();
        }
      } else if (previous && JOB_ACTIVE_STATUSES.includes(previous.status) && nextJob?.status && nextJob.status !== 'idle') {
        await loadSignals({ initial: false });
        await loadAiStatus();
        if (!isStale(gen)) {
          setNotice(`Переразбор завершён: обработано ${nextJob.processed || 0}${nextJob.reused ? `, повторно использовано ${nextJob.reused}` : ''}, ошибок ${nextJob.failed || 0}.`);
        }
        await refreshSnapshot();
      }
      return nextJob;
    } catch (err) {
      if (!isStale(gen) && JOB_ACTIVE_STATUSES.includes(jobRef.current?.status)) {
        setError(`Не удалось получить статус переразбора: ${err.message}`);
      }
      return jobRef.current;
    } finally {
      inFlightRef.current.job = false;
    }
  }, [isStale, loadAiStatus, loadSignals, refreshSnapshot]);

  useEffect(() => {
    if (!active) return undefined;
    mountedRef.current = true;
    generationRef.current += 1;
    const gen = generationRef.current;
    let stopped = false;
    let signalsTimer = null;
    let statusTimer = null;
    let jobTimer = null;

    const runSignals = async () => {
      if (stopped || gen !== generationRef.current) return;
      if (!isDocumentVisible()) {
        signalsTimer = window.setTimeout(runSignals, SIGNALS_MS);
        return;
      }
      await loadSignals({ initial: false });
      if (!stopped && gen === generationRef.current) signalsTimer = window.setTimeout(runSignals, SIGNALS_MS);
    };
    const runStatus = async () => {
      if (stopped || gen !== generationRef.current) return;
      if (!isDocumentVisible()) {
        statusTimer = window.setTimeout(runStatus, STATUS_MS);
        return;
      }
      await loadAiStatus();
      if (!stopped && gen === generationRef.current) statusTimer = window.setTimeout(runStatus, STATUS_MS);
    };
    const runJob = async () => {
      if (stopped || gen !== generationRef.current) return;
      if (!isDocumentVisible()) {
        jobTimer = window.setTimeout(runJob, JOB_MS);
        return;
      }
      const nextJob = await syncJobStatus();
      if (stopped || gen !== generationRef.current) return;
      if (JOB_ACTIVE_STATUSES.includes(nextJob?.status)) jobTimer = window.setTimeout(runJob, JOB_MS);
    };
    runJobNowRef.current = () => {
      window.clearTimeout(jobTimer);
      runJob();
    };
    runSignalsNowRef.current = () => {
      window.clearTimeout(signalsTimer);
      runSignals();
    };
    runStatusNowRef.current = () => {
      window.clearTimeout(statusTimer);
      runStatus();
    };

    const onVisibilityChange = () => {
      if (isDocumentVisible()) {
        runSignalsNowRef.current?.();
        runStatusNowRef.current?.();
        runJobNowRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    loadSignals({ initial: true });
    loadAiStatus();
    syncJobStatus().then((nextJob) => {
      if (stopped || gen !== generationRef.current) return;
      if (JOB_ACTIVE_STATUSES.includes(nextJob?.status)) jobTimer = window.setTimeout(runJob, JOB_MS);
    });
    signalsTimer = window.setTimeout(runSignals, SIGNALS_MS);
    statusTimer = window.setTimeout(runStatus, STATUS_MS);

    return () => {
      stopped = true;
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(signalsTimer);
      window.clearTimeout(statusTimer);
      window.clearTimeout(jobTimer);
      runJobNowRef.current = null;
      runSignalsNowRef.current = null;
      runStatusNowRef.current = null;
    };
  }, [active, loadAiStatus, loadSignals, syncJobStatus]);

  useEffect(() => {
    if (revisionRef.current === inboxRefreshRevision) return;
    revisionRef.current = inboxRefreshRevision;
    if (!active || !mountedRef.current) return;
    runSignalsNowRef.current?.();
    runStatusNowRef.current?.();
  }, [active, inboxRefreshRevision]);

  const updateStatus = useCallback(async (signal, status) => {
    if (signalBusyIdsRef.current.has(signal.id)) return { skipped: true, reason: 'already-running' };
    if (!networkWritableRef.current) {
      setError(OFFLINE_WRITE_ERROR);
      return { ok: false, error: OFFLINE_WRITE_ERROR };
    }
    const gen = generationRef.current;
    signalBusyIdsRef.current.add(signal.id);
    setBusySignalId(signal.id);
    try {
      await patchSignal(signal.id, { status });
      if (isStale(gen)) return { ok: true };
      await loadSignals({ initial: false });
      if (isStale(gen)) return { ok: true };
      await refreshSnapshot();
      if (isStale(gen)) return { ok: true };
      setLocalStatus((state) => {
        const fresh = signalsRef.current.find((item) => item.id === signal.id);
        if (fresh && fresh.status === status) {
          if (!(signal.id in state)) return state;
          const next = { ...state };
          delete next[signal.id];
          return next;
        }
        return { ...state, [signal.id]: status };
      });
      setNotice(status === 'New' ? 'Сигнал возвращён во входящие.' : 'Статус сохранён в Notion.');
      setSafeTimeout(() => { if (!isStale(gen)) setNotice(''); }, 2200);
      return { ok: true };
    } catch (err) {
      if (!isStale(gen)) setError(`Не удалось изменить статус: ${err.message}`);
      return { ok: false, error: err.message };
    } finally {
      signalBusyIdsRef.current.delete(signal.id);
      if (!isStale(gen)) setBusySignalId('');
    }
  }, [isStale, loadSignals, refreshSnapshot, setSafeTimeout]);

  const reprocess = useCallback(async (unprocessedCount = 0) => {
    if (!networkWritableRef.current) {
      setError(OFFLINE_WRITE_ERROR);
      return { skipped: true, reason: 'offline' };
    }
    if (reprocessBusyRef.current) return { skipped: true, reason: 'already-running' };
    reprocessBusyRef.current = true;
    const gen = generationRef.current;
    setReprocessing(true);
    setError('');
    setNotice(`Запускаю переразбор ${unprocessedCount} сигналов…`);
    try {
      const response = await reprocessInboxSignals({ onlyMissing: true });
      if (isStale(gen)) return { ok: true };
      const nextJob = response.job || null;
      jobRef.current = nextJob;
      setJob(nextJob);
      lastJobProgressRef.current = -1;
      runJobNowRef.current?.();
      return { ok: true };
    } catch (err) {
      if (!isStale(gen)) {
        setError(`Переразбор не запущен: ${err.message}`);
        setNotice('');
        setReprocessing(false);
      }
      return { ok: false, error: err.message };
    } finally {
      reprocessBusyRef.current = false;
    }
  }, [isStale]);

  return {
    signals,
    loading,
    notice,
    error,
    localStatus,
    busySignalId,
    reprocessing,
    job,
    aiStatus,
    enteringIds,
    updateStatus,
    reprocess,
  };
}
