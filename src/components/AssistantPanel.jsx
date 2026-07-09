import { useEffect, useMemo, useRef, useState } from 'react';
import { executeAssistantActions, fetchAssistantStatus, postAssistantChat } from '../lib/lifeMapRuntime.js';
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
} from '../lib/assistantChatHistory.js';
import { CloudQuotaMeter } from './CloudQuotaMeter.jsx';
import '../assistant-fullscreen.css';
import '../ai-capacity.css';
import '../assistant-role.css';

const SECRET_KEY = 'lifemap.assistant.writeSecret.session';
const EXECUTABLE_ACTIONS = new Set(['update_task', 'rename_item', 'create_session', 'create_signal', 'dedupe_signals']);

function safeText(value = '') {
  return String(value || '').trim();
}

function focusTitle(focus) {
  return safeText(focus?.title) || 'Фокус пока не выбран';
}

function branchTitle(map) {
  return safeText(map?.title) || 'LifeMap';
}

function itemCode(item) {
  return safeText(item?.code || item?.raw?.code || item?.icon || '').replace(/-/g, '') || 'AI';
}

function itemKindLabel(item) {
  if (!item) return 'LifeMap';
  if (item.kind === 'signal') return 'AI Inbox';
  if (item.kind === 'task') return 'Задача';
  return item.kind || 'Объект LifeMap';
}

function friendlyAssistantError(error) {
  const message = String(error?.message || error || 'Неизвестная ошибка');
  if (/capacity|rate limit|429|quota|resource_exhausted/i.test(message)) {
    return 'Бесплатный AI-пул временно исчерпал доступную квоту. LifeMap автоматически переключает модели и продолжит работу, когда появится доступный маршрут.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Не удалось связаться с LifeMap API. Проверь статус backend для текущего окружения.';
  }
  return message.length > 320 ? `${message.slice(0, 319)}…` : message;
}

function assistantContext(map, focus, snapshot, target, targetContext = {}) {
  const source = snapshot?.meta?.source || 'unknown';
  const connected = snapshot?.meta?.connected || {};
  const items = [
    { label: 'Экран', value: branchTitle(map) },
    { label: 'Фокус', value: focusTitle(focus) },
    { label: 'Задачи ветки', value: `активные ${Number(map?.tasks || 0)}, сделано ${Number(map?.completedTasks || 0)}` },
    { label: 'Источник', value: source },
    { label: 'AI Inbox', value: connected.signals ? 'Notion подключён' : 'live-источник не подтверждён' },
  ];

  if (target) {
    items.unshift({ label: itemKindLabel(target), value: `${itemCode(target)} · ${safeText(target.title)}` });
    if (target.status) items.push({ label: 'Статус объекта', value: target.status });
    if (target.raw?.sourceUrl) items.push({ label: 'Источник объекта', value: target.raw.sourceUrl });
    if (targetContext?.mapTitle) items.push({ label: 'Родительская ветка', value: targetContext.mapTitle });
    if (Array.isArray(targetContext?.contextItems) && targetContext.contextItems.length) items.push({ label: 'Файлы контекста', value: String(targetContext.contextItems.length) });
  }

  return items;
}

function quickPromptsFor(target) {
  if (target?.kind === 'signal') {
    return [
      {
        label: 'Применить сейчас?',
        prompt: 'Оцени этот сигнал относительно текущего фокуса и активных задач. Прими одно решение: использовать сейчас, сохранить на потом, архивировать или превратить в задачу. Объясни решение конкретной связью с LifeMap.',
      },
      {
        label: 'Извлечь ценное',
        prompt: 'Выдели из этого сигнала только реально полезные инструменты, промпты, workflow или идеи. Для каждого скажи конкретное применение в текущей работе; банальные применения пропусти.',
      },
      {
        label: 'Сравнить с работой',
        prompt: 'Сравни этот материал с текущим фокусом и активными задачами. Найди совпадения, конфликт, дублирование или отсутствие связи. Дай короткий вывод, без пересказа материала.',
      },
      {
        label: 'Решение по сигналу',
        prompt: 'Прими решение по этому сигналу как редактор AI Inbox: что оставить, что извлечь, что игнорировать и нужен ли конкретный следующий шаг. Не создавай задачу без реального действия.',
      },
    ];
  }

  if (target?.kind === 'task') {
    return [
      {
        label: 'Разблокировать задачу',
        prompt: 'Проанализируй эту задачу в контексте проекта. Назови вероятный главный блокер, чего конкретно не хватает, и один первый шаг, который можно начать сейчас.',
      },
      {
        label: 'План на 30 минут',
        prompt: 'Составь рабочую сессию на 30 минут именно по этой задаче: цель, 2–4 шага, первый физический шаг и критерий Done. Не добавляй другие проекты.',
      },
      {
        label: 'Проверить готовность',
        prompt: 'Проверь, достаточно ли конкретно сформулирована эта задача для выполнения. Найди максимум 3 пробела, риска или зависимости и предложи исправление.',
      },
      {
        label: 'Найти помощь в Inbox',
        prompt: 'Проверь переданные сигналы AI Inbox и найди максимум 3 материала, которые прямо помогают выполнить эту задачу. Если прямой пользы нет, так и скажи.',
      },
    ];
  }

  return [
    {
      label: 'Главное узкое место',
      prompt: 'Найди главное узкое место в моей текущей работе. Выбери только одно, назови конкретные факты из LifeMap, объясни почему оно важнее ближайшей альтернативы и дай первый шаг до 30 минут.',
    },
    {
      label: 'Сессия на 45 минут',
      prompt: 'Собери рабочую сессию на 45 минут из текущего фокуса и активных задач: одна цель сессии, 2–4 последовательных шага, первый физический шаг и критерий Done.',
    },
    {
      label: 'Inbox → текущая работа',
      prompt: 'Найди максимум 3 сигнала AI Inbox, которые прямо помогают текущему фокусу. Для каждого скажи, что именно использовать сейчас. Если подходящих нет, не придумывай связи.',
    },
    {
      label: 'Почистить очередь',
      prompt: 'Проверь активные задачи на дубли, конфликт приоритетов, устаревшие пункты и задачи без понятного следующего действия. Покажи только действительно проблемные места и предложи минимальные изменения.',
    },
  ];
}

function readSecret() {
  try { return window.sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function writeSecret(value) {
  try {
    if (value) window.sessionStorage.setItem(SECRET_KEY, value);
    else window.sessionStorage.removeItem(SECRET_KEY);
  } catch {}
}

function formatHistoryTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return '';
  }
}

function sessionKindLabel(session) {
  const kind = session?.target?.kind;
  if (kind === 'signal') return 'AI Inbox';
  if (kind === 'task') return 'Задача';
  return 'LifeMap';
}

function HistoryPanel({ sessions, activeSessionId, busy, onSelect, onNew, mobile = false }) {
  return (
    <section className={`assistantHistoryPanel ${mobile ? 'mobile' : ''}`}>
      <div className="assistantHistoryHead">
        <small>История</small>
        <button type="button" onClick={onNew} disabled={busy}>+ Новый</button>
      </div>
      <div className="assistantHistoryList">
        {sessions.length ? sessions.slice(0, 16).map((session) => (
          <button
            type="button"
            key={session.id}
            className={session.id === activeSessionId ? 'active' : ''}
            onClick={() => onSelect(session)}
            disabled={busy}
          >
            <b>{session.title || 'Новый чат'}</b>
            <span>{sessionKindLabel(session)}{session.updatedAt ? ` · ${formatHistoryTime(session.updatedAt)}` : ''}</span>
          </button>
        )) : <p>История появится после первого сообщения.</p>}
      </div>
    </section>
  );
}

function ActionCard({ action, onExecute, busy, disabled }) {
  const executable = EXECUTABLE_ACTIONS.has(action.type);
  return (
    <article className={`assistantActionCard ${executable ? 'isExecutable' : 'isPlan'}`}>
      <div>
        <small>{executable ? 'Изменение LifeMap' : 'План'}</small>
        <b>{action.title || 'Действие LifeMap'}</b>
        {action.risk ? <p>{action.risk}</p> : null}
      </div>
      {executable ? (
        <button type="button" disabled={busy || disabled} onClick={() => onExecute(action)}>
          {busy ? 'Выполняю…' : 'Подтвердить'}
        </button>
      ) : <span className="assistantPlanBadge">Предложение</span>}
    </article>
  );
}

function MessageBubble({ message, onExecute, actionBusy, actionsDisabled }) {
  return (
    <div className={`assistantMessageBubble ${message.role} ${message.error ? 'error' : ''}`}>
      <small>{message.role === 'user' ? 'Ты' : message.role === 'system' ? 'LifeMap' : 'AI'}</small>
      <p>{message.text}</p>
      {message.summary ? <details><summary>Сводка</summary><pre>{message.summary}</pre></details> : null}
      {message.warnings?.length ? <div className="assistantWarnings">{message.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
      {message.nextStep ? <div className="assistantNextStep"><b>Далее:</b> {message.nextStep}</div> : null}
      {message.proposedActions?.length ? (
        <div className="assistantActions">
          {message.proposedActions.map((action, index) => (
            <ActionCard key={`${action.type}-${action.title}-${index}`} action={action} onExecute={onExecute} busy={actionBusy === `${action.type}-${action.title}`} disabled={actionsDisabled} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantPanel({ currentMap, activeFocus, snapshot }) {
  if (typeof window !== 'undefined') window.__lifemapContext = { snapshot, activeFocus };

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(null);
  const [targetContext, setTargetContext] = useState({});
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState(() => readAssistantSessions());
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const stored = readActiveAssistantSessionId();
    const items = readAssistantSessions();
    return items.some((session) => session.id === stored) ? stored : (items[0]?.id || '');
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState(readSecret);
  const scrollRef = useRef(null);

  const refreshStatus = () => fetchAssistantStatus()
    .then(setStatus)
    .catch((err) => setStatus((previous) => previous || { ok: false, configured: false, error: friendlyAssistantError(err) }));

  const activateSession = (session, openPanel = true) => {
    if (!session) return;
    setActiveSessionId(session.id);
    setActiveAssistantSessionId(session.id);
    setTarget(session.target || null);
    setTargetContext(session.targetContext || {});
    setMessages(readAssistantSessionMessages(session.id));
    setDraft('');
    setError('');
    setHistoryOpen(false);
    if (openPanel) setOpen(true);
  };

  const startNewChat = (event) => {
    event?.stopPropagation?.();
    if (busy) return;
    const created = createAssistantSession();
    setSessions(created.sessions);
    activateSession(created.session, true);
  };

  useEffect(() => {
    const handler = (event) => {
      const nextTarget = event.detail?.target || null;
      const nextContext = event.detail?.context || {};
      const existing = findAssistantSessionForTarget(nextTarget);
      if (existing) {
        setSessions(readAssistantSessions());
        setActiveSessionId(existing.id);
        setActiveAssistantSessionId(existing.id);
        setTarget(existing.target || nextTarget);
        setTargetContext(existing.targetContext || nextContext);
        setMessages(readAssistantSessionMessages(existing.id));
      } else {
        const created = createAssistantSession({ target: nextTarget, targetContext: nextContext });
        setSessions(created.sessions);
        setActiveSessionId(created.session.id);
        setTarget(nextTarget);
        setTargetContext(nextContext);
        setMessages([]);
      }
      setDraft('');
      setError('');
      setHistoryOpen(false);
      setOpen(true);
    };
    window.addEventListener('lifemap:assistant-target', handler);
    return () => window.removeEventListener('lifemap:assistant-target', handler);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (historyOpen) setHistoryOpen(false);
        else setOpen(false);
      }
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, historyOpen]);

  const context = useMemo(() => assistantContext(currentMap, activeFocus, snapshot, target, targetContext), [currentMap, activeFocus, snapshot, target, targetContext]);
  const quickPrompts = useMemo(() => quickPromptsFor(target), [target]);
  const snapshotStats = useMemo(() => ({
    tasks: snapshot?.tasks?.length || 0,
    goals: snapshot?.goals?.length || 0,
    signals: snapshot?.signals?.length || 0,
    warnings: snapshot?.meta?.warnings?.length || 0,
  }), [snapshot]);

  useEffect(() => {
    if (!open) return undefined;
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 30000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 40);
  }, [open, messages.length]);
  useEffect(() => { writeSecret(secret); }, [secret]);

  const appendMessages = (nextMessages, sessionId = activeSessionId) => {
    if (!sessionId) return;
    setMessages((items) => {
      const next = [...items, ...nextMessages].slice(-40);
      writeAssistantSessionMessages(sessionId, next);
      return next;
    });
    setSessions(updateAssistantSession(sessionId, { updatedAt: new Date().toISOString() }));
  };

  const openGlobal = (event) => {
    event.stopPropagation();
    const current = sessions.find((session) => session.id === activeSessionId) || sessions[0];
    if (current) activateSession(current, true);
    else startNewChat(event);
  };

  const sendMessage = async (event, quickText = '') => {
    event?.preventDefault?.();
    const text = safeText(quickText || draft);
    if (!text || busy) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = createAssistantSession({ target, targetContext });
      sessionId = created.session.id;
      setSessions(created.sessions);
      setActiveSessionId(sessionId);
    }

    const userMessage = { role: 'user', text, createdAt: new Date().toISOString() };
    appendMessages([userMessage], sessionId);
    setSessions(touchAssistantSessionFromMessage(sessionId, text));
    setDraft('');
    setBusy(true);
    setError('');
    try {
      const history = [...messages, userMessage].slice(-12).map((item) => ({ role: item.role, text: item.text }));
      const response = await postAssistantChat({
        message: text,
        messages: history,
        target,
        context: { ...targetContext, screen: currentMap?.title, contextChips: context, snapshotStats },
      });
      const assistant = response.assistant || {};
      appendMessages([{
        role: 'assistant',
        text: assistant.reply || 'Ответ пустой.',
        summary: assistant.summary,
        proposedActions: assistant.proposedActions || [],
        warnings: assistant.warnings || [],
        nextStep: assistant.nextStep,
        createdAt: new Date().toISOString(),
      }], sessionId);
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      setError(friendly);
      appendMessages([{ role: 'assistant', text: friendly, createdAt: new Date().toISOString(), error: true }], sessionId);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const runAction = async (action) => {
    if (!secret) {
      setError('Для подтверждённых изменений нужен action secret. Открой «Изменения» в левой колонке.');
      return;
    }
    const ok = window.confirm(`Выполнить изменение «${action.title || action.type}» в LifeMap/Notion?`);
    if (!ok) return;
    const actionId = `${action.type}-${action.title}`;
    setActionBusy(actionId);
    setError('');
    try {
      const response = await executeAssistantActions({ actions: [{ ...action, confirmed: true, requiresConfirmation: false }], secret });
      appendMessages([{ role: 'system', text: `Изменение выполнено: ${action.title || action.type}`, summary: JSON.stringify(response.executedActions || response, null, 2), createdAt: new Date().toISOString() }]);
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      setError(friendly);
      appendMessages([{ role: 'system', text: `Изменение не выполнено: ${friendly}`, createdAt: new Date().toISOString(), error: true }]);
    } finally {
      setActionBusy('');
    }
  };

  const clearChat = () => {
    if (!activeSessionId) return;
    const ok = window.confirm('Очистить сообщения в этом чате?');
    if (!ok) return;
    setSessions(clearAssistantSession(activeSessionId));
    setMessages([]);
  };

  const handleDraftKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    sendMessage(event);
  };

  const mainEyebrow = target ? `${itemKindLabel(target)} · ${itemCode(target)}` : '';
  const mainTitle = target ? safeText(target.title) : 'LifeMap Assistant';

  return (
    <>
      <button className="assistantFab" type="button" onClick={openGlobal} title="Открыть помощника LifeMap">AI</button>
      {open ? (
        <div className="assistantWorkspaceOverlay" onClick={() => setOpen(false)}>
          <section className="assistantWorkspace compactMode assistantDecisionWorkspace" onClick={(event) => event.stopPropagation()}>
            <aside className="assistantWorkspaceSidebar">
              <div className="assistantBrandBlock assistantBrandCompact">
                <div className="assistantBrandIdentity"><span>AI</span><div><small>LifeMap</small><h2>Assistant</h2></div></div>
              </div>

              <CloudQuotaMeter status={status} compact />

              <HistoryPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                busy={busy}
                onSelect={(session) => activateSession(session, true)}
                onNew={startNewChat}
              />

              <div className="assistantQuickStack assistantDecisionCommands">
                <small>{target ? 'Работа с объектом' : 'Решения'}</small>
                {quickPrompts.map((item) => (
                  <button key={item.label} type="button" onClick={(event) => sendMessage(event, item.prompt)} disabled={busy}>
                    {item.label}
                  </button>
                ))}
              </div>

              <details className="assistantWriteAccess">
                <summary><span>Изменения</span><b>{secret ? 'включены' : 'только предложения'}</b></summary>
                {status?.canExecuteActions ? (
                  <label className="assistantSecretField">
                    Action secret
                    <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="LIFEMAP_ASSISTANT_API_SECRET" />
                  </label>
                ) : <p>Backend сейчас не разрешает write actions. Assistant всё равно может анализировать и предлагать изменения.</p>}
              </details>
            </aside>

            {historyOpen ? (
              <div className="assistantHistoryMobileOverlay" onClick={() => setHistoryOpen(false)}>
                <div className="assistantHistoryMobileSheet" onClick={(event) => event.stopPropagation()}>
                  <button className="assistantHistoryMobileClose" type="button" onClick={() => setHistoryOpen(false)}>×</button>
                  <HistoryPanel
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    busy={busy}
                    mobile
                    onSelect={(session) => activateSession(session, true)}
                    onNew={startNewChat}
                  />
                </div>
              </div>
            ) : null}

            <main className="assistantWorkspaceMain">
              <header className="assistantWorkspaceHeader">
                <div>{mainEyebrow ? <small>{mainEyebrow}</small> : null}<h1>{mainTitle}</h1></div>
                <div className="assistantHeaderActions">
                  <button className="assistantMobileHistoryButton" type="button" onClick={() => setHistoryOpen(true)}>История</button>
                  <button type="button" onClick={clearChat}>Очистить</button>
                  <button className="assistantCloseButton" type="button" onClick={() => setOpen(false)}>Закрыть</button>
                </div>
              </header>

              <div className="assistantChatThread fullScreenThread" ref={scrollRef}>
                {!messages.length ? (
                  <div className="assistantWelcome assistantDecisionWelcome">
                    <h2>Что нужно решить?</h2>
                    <p>Опиши проблему или решение, которое нужно принять. История чатов сохранится на этом устройстве.</p>
                  </div>
                ) : null}
                {messages.map((message, index) => (
                  <MessageBubble key={`${message.createdAt}-${index}`} message={message} onExecute={runAction} actionBusy={actionBusy} actionsDisabled={!status?.canExecuteActions} />
                ))}
                {busy ? <div className="assistantMessageBubble assistant loading"><p>печатаю</p></div> : null}
              </div>

              {error ? <div className="assistantInlineError">{error}</div> : null}
              <form className="assistantInput assistantWorkspaceInput" onSubmit={sendMessage}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleDraftKeyDown} placeholder={target ? 'Что нужно решить по этому объекту?' : 'Опиши решение, которое нужно принять, или проблему в работе…'} />
                <button type="submit" disabled={busy || !draft.trim()}>{busy ? '...' : 'Отправить'}</button>
              </form>
            </main>
          </section>
        </div>
      ) : null}
    </>
  );
}
