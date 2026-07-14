// LifeMap UI V2 — useAssistantChat (Stage 5B1, fix pass 2).
// Live assistant chat state for the morph AssistantWindow. Reuses ONLY the
// existing contracts: lifeMapRuntime.js (postAssistantChat,
// executeAssistantActions, fetchAssistantStatus — the 403 access-key flow
// stays solely in the runtime) and assistantChatHistory.js (session
// persistence, 30/40 limits, target-key reuse, storage keys — UNCHANGED).
//
// Request safety:
// - `busyRef` (checked synchronously, before the first await) serializes
//   sends: two rapid submits can only ever start one postAssistantChat.
// - every request captures the session id it belongs to up front; the
//   response is written into THAT session's storage and only mirrored into
//   live `messages`/`busy`/`error` state if that session is still active
//   when the response lands — a stale response can't leak into whatever
//   session the user has since switched to.
// - `mountedRef` + `generationRef` (the mount/generation id) guard every
//   await: after unmount, the response is still persisted to history (so
//   it's there next time that session is opened) but no React state is
//   touched.
// - `actionBusyIdsRef` (a Set, checked synchronously) means two fast clicks
//   on two different proposed-action buttons can't both fire; a click on
//   the SAME action id twice can't either.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeAssistantActions,
  fetchAssistantStatus,
  postAssistantChat,
} from '../../lib/lifeMapRuntime.js';
import {
  clearAssistantSession,
  createAssistantSession,
  findAssistantSessionForTarget,
  readActiveAssistantSessionId,
  readAssistantSessionMessages,
  readAssistantSessions,
  setActiveAssistantSessionId,
  touchAssistantSessionFromMessage,
  updateAssistantSession,
  writeAssistantSessionMessages,
} from '../../lib/assistantChatHistory.js';
import {
  assistantContext,
  assistantStatusView,
  friendlyAssistantError,
  isExecutableAssistantAction,
  quickPromptsFor,
  safeDisplayText,
} from '../adapters/assistantContextAdapter.js';

const STATUS_MS = 30000;
const OFFLINE_WRITE_ERROR = 'Изменения недоступны: LifeMap сейчас показывает последние известные данные без записи в API.';

function isDocumentVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// Resolves activeSessionId/messages/target/targetContext from the SAME
// stored session in one shot. Stage 5B1 fix1 computed `messages` from the
// restored session but left `target`/`targetContext` defaulted to
// null/{} — opening the window on a target-bound session showed that
// session's messages under the GENERAL header/quick-prompts until some
// other action happened to reset target. All four now come from one read.
function resolveInitialSession({ generic = false } = {}) {
  const stored = readActiveAssistantSessionId();
  const items = readAssistantSessions();
  const session = generic
    // Some older target-bound sessions were persisted with `global` as
    // their targetKey. The target payload is authoritative here: a plain
    // Assistant opening must never restore any session that still carries
    // an object target, regardless of its legacy key.
    ? items.find((entry) => !entry.target && (!entry.targetKey || entry.targetKey === 'global')) || null
    : items.find((entry) => entry.id === stored) || items[0] || null;
  return {
    id: session?.id || '',
    messages: session ? readAssistantSessionMessages(session.id) : [],
    target: session?.target || null,
    targetContext: session?.targetContext || {},
  };
}

export function useAssistantChat({ active = true, bootTarget = null, currentMap, activeFocus, snapshot, networkWritable = true, onRefreshSnapshot, apiOffline = false, onInboxDataStale } = {}) {
  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = resolveInitialSession({ generic: !bootTarget });

  const [sessions, setSessions] = useState(() => readAssistantSessions());
  const [activeSessionId, setActiveSessionIdState] = useState(() => initialRef.current.id);
  const [messages, setMessages] = useState(() => initialRef.current.messages);
  const [target, setTarget] = useState(() => initialRef.current.target);
  const [targetContext, setTargetContext] = useState(() => initialRef.current.targetContext);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [errorState, setErrorState] = useState(null); // { sessionId, message } | null

  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const consumedBootRef = useRef(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const networkWritableRef = useRef(networkWritable);
  networkWritableRef.current = networkWritable;
  const apiOfflineRef = useRef(apiOffline);
  apiOfflineRef.current = apiOffline;
  const onRefreshSnapshotRef = useRef(onRefreshSnapshot);
  onRefreshSnapshotRef.current = onRefreshSnapshot;
  const onInboxDataStaleRef = useRef(onInboxDataStale);
  onInboxDataStaleRef.current = onInboxDataStale;
  const busyRef = useRef(false); // synchronous send-serialization guard
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef(0); // sequence id of the in-flight send, for busy/typing scoping
  const actionBusyIdsRef = useRef(new Set()); // synchronous per-action-id guard
  const statusRunNowRef = useRef(null);
  const statusInFlightRef = useRef(false);

  const isStale = useCallback((gen) => !mountedRef.current || generationRef.current !== gen, []);

  const refreshSnapshot = useCallback(async () => {
    try { await onRefreshSnapshotRef.current?.(); } catch { /* shell refresh is best-effort */ }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (statusInFlightRef.current) return;
    const gen = generationRef.current;
    statusInFlightRef.current = true;
    try {
      const next = await fetchAssistantStatus();
      if (!isStale(gen)) setStatus(next);
    } catch (err) {
      if (!isStale(gen)) setStatus((previous) => previous || { ok: false, configured: false, error: friendlyAssistantError(err) });
    } finally {
      statusInFlightRef.current = false;
    }
  }, [isStale]);

  // Recursive setTimeout, visibility-gated, generation-guarded — same
  // pattern as useInboxData's polling.
  useEffect(() => {
    if (!active) return undefined;
    mountedRef.current = true;
    generationRef.current += 1;
    const gen = generationRef.current;
    let stopped = false;
    let timer = null;

    const run = async () => {
      if (stopped || gen !== generationRef.current) return;
      if (!isDocumentVisible()) {
        timer = window.setTimeout(run, STATUS_MS);
        return;
      }
      await refreshStatus();
      if (!stopped && gen === generationRef.current) timer = window.setTimeout(run, STATUS_MS);
    };
    statusRunNowRef.current = () => {
      window.clearTimeout(timer);
      run();
    };
    const onVisibilityChange = () => { if (isDocumentVisible()) statusRunNowRef.current?.(); };
    document.addEventListener('visibilitychange', onVisibilityChange);

    refreshStatus();
    timer = window.setTimeout(run, STATUS_MS);

    return () => {
      stopped = true;
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(timer);
      statusRunNowRef.current = null;
    };
  }, [active, refreshStatus]);

  const activateSession = useCallback((session) => {
    if (!session) return;
    setActiveSessionIdState(session.id);
    setActiveAssistantSessionId(session.id);
    setTarget(session.target || null);
    setTargetContext(session.targetContext || {});
    setMessages(readAssistantSessionMessages(session.id));
    setErrorState(null);
  }, []);

  const startNewChat = useCallback(() => {
    if (busyRef.current) return;
    const created = createAssistantSession();
    setSessions(created.sessions);
    activateSession(created.session);
  }, [activateSession]);

  // Consume the boot target passed by the shell (task row AI button,
  // context menu, TaskDetailPanel, Inbox "Чат с AI"). Same reuse rule as
  // the legacy `lifemap:assistant-target` handler: an existing session for
  // the same targetKey is reactivated, otherwise a new session is created.
  // When bootTarget is null (the plain AI pill segment), initialization picks
  // the newest GENERAL session, never the last target-bound one. If none
  // exists, `send()` lazily creates it on the first message.
  useEffect(() => {
    if (!bootTarget || consumedBootRef.current === bootTarget) return;
    consumedBootRef.current = bootTarget;
    const nextTarget = bootTarget.target || null;
    const nextContext = bootTarget.context || {};
    const existing = findAssistantSessionForTarget(nextTarget);
    if (existing) {
      setSessions(readAssistantSessions());
      setActiveSessionIdState(existing.id);
      setActiveAssistantSessionId(existing.id);
      setTarget(existing.target || nextTarget);
      setTargetContext(existing.targetContext || nextContext);
      setMessages(readAssistantSessionMessages(existing.id));
    } else {
      const created = createAssistantSession({ target: nextTarget, targetContext: nextContext });
      setSessions(created.sessions);
      setActiveSessionIdState(created.session.id);
      setTarget(nextTarget);
      setTargetContext(nextContext);
      setMessages([]);
    }
    setErrorState(null);
  }, [bootTarget]);

  // Single source of truth for a session's message list: reads the
  // CURRENT stored messages for `sessionId` (never the live `messages`
  // state, which may belong to a different session), appends, writes back.
  // Only mirrors into the live `messages` state if `sessionId` is still
  // active AND the hook is still mounted — after unmount the history write
  // still happens (so the message is there next time), but no setState.
  const appendMessages = useCallback((nextMessages, sessionId) => {
    const targetSessionId = sessionId || activeSessionIdRef.current;
    if (!targetSessionId) return;
    const stored = readAssistantSessionMessages(targetSessionId);
    const next = [...stored, ...nextMessages].slice(-40);
    writeAssistantSessionMessages(targetSessionId, next);
    const nextSessions = updateAssistantSession(targetSessionId, { updatedAt: new Date().toISOString() });
    if (!mountedRef.current) return;
    if (targetSessionId === activeSessionIdRef.current) setMessages(next);
    setSessions(nextSessions);
  }, []);

  const send = useCallback(async (rawText) => {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, error: 'empty' };
    // Synchronous guard, checked before any await: two rapid submits can
    // only ever pass this once.
    if (busyRef.current) return { ok: false, error: 'busy' };
    // Re-check gating here too — the hook is the single place that can
    // actually fire the request, so it never trusts only the composer's
    // `disabled` prop (which can be stale for a render or two).
    if (apiOfflineRef.current) return { ok: false, error: OFFLINE_WRITE_ERROR };
    const view = assistantStatusView(status, { apiOffline: apiOfflineRef.current });
    if (view.blocksSend) return { ok: false, error: view.description || view.label };

    busyRef.current = true;
    const gen = generationRef.current;
    const seq = (requestSequenceRef.current += 1);
    activeRequestRef.current = seq;

    let sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      const created = createAssistantSession({ target, targetContext });
      sessionId = created.session.id;
      if (!isStale(gen)) {
        setSessions(created.sessions);
        setActiveSessionIdState(sessionId);
      }
      setActiveAssistantSessionId(sessionId);
    }

    const userMessage = { role: 'user', text, createdAt: new Date().toISOString() };
    appendMessages([userMessage], sessionId);
    setSessions(touchAssistantSessionFromMessage(sessionId, text));
    if (!isStale(gen)) {
      setBusy(true);
      setPendingSessionId(sessionId);
      if (errorState?.sessionId === sessionId) setErrorState(null);
    }
    try {
      const history = readAssistantSessionMessages(sessionId).slice(-12).map((item) => ({ role: item.role, text: item.text }));
      const contextChips = assistantContext(currentMap, activeFocus, snapshot, target, targetContext);
      const snapshotStats = {
        tasks: snapshot?.tasks?.length || 0,
        goals: snapshot?.goals?.length || 0,
        signals: snapshot?.signals?.length || 0,
        warnings: snapshot?.meta?.warnings?.length || 0,
      };
      const response = await postAssistantChat({
        message: text,
        messages: history,
        target,
        context: { ...targetContext, screen: currentMap?.title, contextChips, snapshotStats },
      });
      const assistant = response.assistant || {};
      appendMessages([{
        role: 'assistant',
        text: safeDisplayText(assistant.reply, 'Ответ пустой.'),
        summary: assistant.summary ? safeDisplayText(assistant.summary) : undefined,
        proposedActions: Array.isArray(assistant.proposedActions) ? assistant.proposedActions : [],
        warnings: Array.isArray(assistant.warnings) ? assistant.warnings.map((item) => safeDisplayText(item)) : [],
        nextStep: assistant.nextStep ? safeDisplayText(assistant.nextStep) : undefined,
        provider: safeDisplayText(assistant.provider || response.provider || response.meta?.provider, ''),
        model: safeDisplayText(assistant.model || response.model || response.meta?.model, ''),
        status: safeDisplayText(assistant.status || response.status || response.meta?.status, ''),
        capacity: safeDisplayText(assistant.capacity || assistant.quota || response.capacity || response.quota, ''),
        createdAt: new Date().toISOString(),
      }], sessionId);
      return { ok: true };
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      if (!isStale(gen) && sessionId === activeSessionIdRef.current) setErrorState({ sessionId, message: friendly });
      appendMessages([{ role: 'assistant', text: friendly, createdAt: new Date().toISOString(), error: true }], sessionId);
      return { ok: false, error: friendly };
    } finally {
      busyRef.current = false;
      // A finally for an OLDER request must never clear busy/pending set by
      // a NEWER one — only touch state if this is still the request that
      // last set `activeRequestRef`.
      if (!isStale(gen) && activeRequestRef.current === seq) {
        setBusy(false);
        setPendingSessionId('');
      }
      refreshStatus();
    }
  }, [activeFocus, appendMessages, currentMap, errorState, isStale, refreshStatus, snapshot, status, target, targetContext]);

  const executeAction = useCallback(async (action) => {
    // Belt-and-suspenders: the UI only renders a confirm button for
    // executable action types, but this hook is the single place that can
    // actually trigger a Notion/LifeMap mutation, so it re-checks the same
    // allow-list itself instead of trusting the caller.
    if (!isExecutableAssistantAction(action)) {
      setErrorState({ sessionId: activeSessionIdRef.current, message: 'Это предложение нельзя выполнить автоматически.' });
      return;
    }
    const actionId = `${action.type}-${action.title}`;
    // Synchronous per-action guard: two fast clicks on the SAME action, or
    // on two DIFFERENT actions, can never both start an execute call.
    if (actionBusyIdsRef.current.size > 0) return;
    if (!networkWritableRef.current || apiOfflineRef.current) {
      setErrorState({ sessionId: activeSessionIdRef.current, message: OFFLINE_WRITE_ERROR });
      return;
    }
    // Secret prompting lives in the runtime (requestJson 403 flow); we
    // never read/write the access secret from this hook.
    const ok = window.confirm(`Выполнить изменение «${action.title || action.type}» в LifeMap/Notion?`);
    if (!ok) return;
    const gen = generationRef.current;
    const sessionId = activeSessionIdRef.current;
    actionBusyIdsRef.current.add(actionId);
    if (!isStale(gen)) {
      setActionBusy(actionId);
      if (errorState?.sessionId === sessionId) setErrorState(null);
    }
    try {
      const response = await executeAssistantActions({ actions: [{ ...action, confirmed: true, requiresConfirmation: false }] });
      const executed = response.executedActions || response;
      appendMessages([{
        role: 'system',
        text: `Изменение выполнено: ${action.title || action.type}`,
        summary: safeDisplayText(executed, ''),
        createdAt: new Date().toISOString(),
      }], sessionId);
      await refreshSnapshot();
      // LifeMapShell bumps its inboxRefreshRevision counter here — if the
      // Inbox window is ever mounted at the same time as the Assistant
      // window in a future layout, this makes its useInboxData re-fetch
      // instead of showing data a mutating AI action just made stale.
      // Today the two windows are mutually exclusive (only one morph
      // target is mounted at a time), so this is inert in practice but
      // correct and forward-compatible.
      try { onInboxDataStaleRef.current?.(); } catch { /* best-effort */ }
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      if (!isStale(gen) && sessionId === activeSessionIdRef.current) setErrorState({ sessionId, message: friendly });
      appendMessages([{ role: 'system', text: `Изменение не выполнено: ${friendly}`, createdAt: new Date().toISOString(), error: true }], sessionId);
    } finally {
      actionBusyIdsRef.current.delete(actionId);
      if (!isStale(gen)) setActionBusy('');
    }
  }, [appendMessages, errorState, isStale, refreshSnapshot]);

  const clearSession = useCallback((session) => {
    if (!session?.id) return;
    const ok = window.confirm(`Очистить чат «${session.title || 'Новый чат'}»?`);
    if (!ok) return;
    setSessions(clearAssistantSession(session.id));
    if (session.id === activeSessionIdRef.current) setMessages([]);
  }, []);

  const statusView = assistantStatusView(status, { apiOffline });

  return {
    sessions,
    activeSessionId,
    messages,
    target,
    targetContext,
    status,
    statusView,
    // Only reflects the CURRENTLY VISIBLE session's request — if a
    // response for a different (now-inactive) session is still pending,
    // this session's composer stays usable and no stray "typing…" shows.
    busy: busy && pendingSessionId === activeSessionId,
    actionBusy,
    error: errorState?.sessionId === activeSessionId ? errorState.message : '',
    quickPrompts: quickPromptsFor(target),
    activateSession,
    startNewChat,
    send,
    executeAction,
    clearSession,
  };
}
