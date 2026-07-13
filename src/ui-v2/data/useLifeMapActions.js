// LifeMap UI V2 — network mutation layer (Stage 5A).
// Reuses the existing runtime/selectors contracts. It never reimplements
// request/secret handling and never mutates route, camera, viewport or HUD.
import { useCallback, useRef, useState } from 'react';
import { patchTask, patchItemTitle } from '../../lib/lifeMapRuntime.js';
import { canPatchTask } from '../../lib/lifeMapSelectors.js';

const MAX_FOCUS_QUEUE = 12;
const OFFLINE_MESSAGE = 'API недоступен. Изменение не отправлено.';

function normalizeError(error, fallback) {
  return error?.message ? String(error.message) : fallback;
}

function sameFocusItem(left, right) {
  if (!left || !right) return false;
  if (left.sourceId || right.sourceId) return Boolean(left.sourceId) && left.sourceId === right.sourceId;
  return left.id === right.id;
}

export function useLifeMapActions({ refresh, networkAvailable = true }) {
  const [busyById, setBusyById] = useState({});
  const [error, setError] = useState('');
  const inFlightRef = useRef(new Set());

  const clearError = useCallback(() => setError(''), []);

  const offlineResult = useCallback(() => {
    setError(OFFLINE_MESSAGE);
    return { ok: false, offline: true, error: OFFLINE_MESSAGE };
  }, []);

  const runExclusive = useCallback(async (id, fn, failureMessage) => {
    const key = String(id || 'unknown');
    if (inFlightRef.current.has(key)) return { skipped: true };
    inFlightRef.current.add(key);
    setBusyById((previous) => ({ ...previous, [key]: true }));
    try {
      await fn();
      return { ok: true };
    } catch (caught) {
      const message = normalizeError(caught, failureMessage);
      setError(message);
      return { ok: false, error: message };
    } finally {
      inFlightRef.current.delete(key);
      setBusyById((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }, []);

  const runNetworkExclusive = useCallback(
    (id, fn, failureMessage) => {
      if (!networkAvailable) return Promise.resolve(offlineResult());
      return runExclusive(id, fn, failureMessage);
    },
    [networkAvailable, offlineResult, runExclusive]
  );

  const completeTask = useCallback(
    (node) => {
      if (!canPatchTask(node)) return Promise.resolve({ ok: false, error: 'Этот объект нельзя отметить Done.' });
      return runNetworkExclusive(
        node.sourceId,
        async () => {
          await patchTask(node.sourceId, { status: 'Done', progress: 100 });
          await refresh();
        },
        'Не удалось отметить задачу выполненной.'
      );
    },
    [refresh, runNetworkExclusive]
  );

  const restoreTask = useCallback(
    (node) => {
      if (!canPatchTask(node)) return Promise.resolve({ ok: false, error: 'Этот объект нельзя восстановить как задачу.' });
      return runNetworkExclusive(
        node.sourceId,
        async () => {
          await patchTask(node.sourceId, { status: 'Next', progress: 0 });
          await refresh();
        },
        'Не удалось вернуть задачу в работу.'
      );
    },
    [refresh, runNetworkExclusive]
  );

  const saveNote = useCallback(
    (node, note) => {
      if (!canPatchTask(node)) return Promise.resolve({ ok: false, error: 'У этого объекта нельзя сохранить заметку задачи.' });
      return runNetworkExclusive(
        node.sourceId,
        async () => {
          await patchTask(node.sourceId, { sessionNotes: String(note ?? '') });
          await refresh();
        },
        'Не удалось сохранить заметку.'
      );
    },
    [refresh, runNetworkExclusive]
  );

  const renameItem = useCallback(
    (node, title) => {
      if (!node?.sourceId) return Promise.resolve({ ok: false, error: 'У объекта нет источника для переименования.' });
      return runNetworkExclusive(
        node.sourceId,
        async () => {
          await patchItemTitle(node, title);
          await refresh();
        },
        'Не удалось переименовать объект в Notion.'
      );
    },
    [refresh, runNetworkExclusive]
  );

  const reorderTasks = useCallback(
    (orderedItems) => {
      const patchable = orderedItems.filter((item) => canPatchTask(item));
      if (patchable.length < 2) return Promise.resolve({ ok: true, unchanged: true });
      return runNetworkExclusive(
        '__reorder__',
        async () => {
          const results = await Promise.allSettled(
            patchable.map((item, index) => patchTask(item.sourceId, { priority: (index + 1) * 10 }))
          );
          await refresh();
          if (results.some((result) => result.status === 'rejected')) {
            throw new Error('Часть задач не удалось переставить. Порядок повторно загружен с сервера.');
          }
        },
        'Не удалось сохранить новый порядок.'
      );
    },
    [refresh, runNetworkExclusive]
  );

  const updateFocusQueue = useCallback((focusItem, position, setFocusQueue) => {
    setFocusQueue((queue) => {
      const clean = queue.filter((item) => !sameFocusItem(item, focusItem));
      if (position === 'now') return [focusItem, ...clean].slice(0, MAX_FOCUS_QUEUE);
      if (!clean.length) return [focusItem];
      return [clean[0], focusItem, ...clean.slice(1)].slice(0, MAX_FOCUS_QUEUE);
    });
  }, []);

  const patchFocusStatus = useCallback(
    async (node, status) => {
      if (!canPatchTask(node)) return { ok: true, localOnly: true };
      if (!networkAvailable) {
        return {
          ok: true,
          localOnly: true,
          warning: 'Очередь обновлена локально, но статус в Notion не изменён: API недоступен.',
        };
      }
      const result = await runExclusive(
        node.sourceId,
        async () => {
          await patchTask(node.sourceId, { status });
          await refresh();
        },
        'Очередь обновлена локально, но статус в Notion изменить не удалось.'
      );
      return { ...result, localUpdated: true };
    },
    [networkAvailable, refresh, runExclusive]
  );

  const setFocusNow = useCallback(
    async (node, focusItem, setFocusQueue) => {
      updateFocusQueue(focusItem, 'now', setFocusQueue);
      return patchFocusStatus(node, 'Now');
    },
    [patchFocusStatus, updateFocusQueue]
  );

  const setFocusNext = useCallback(
    async (node, focusItem, setFocusQueue) => {
      updateFocusQueue(focusItem, 'next', setFocusQueue);
      return patchFocusStatus(node, 'Next');
    },
    [patchFocusStatus, updateFocusQueue]
  );

  return {
    busyById,
    isBusy: (id) => Boolean(busyById[String(id)]),
    error,
    clearError,
    completeTask,
    restoreTask,
    saveNote,
    renameItem,
    reorderTasks,
    setFocusNow,
    setFocusNext,
  };
}
