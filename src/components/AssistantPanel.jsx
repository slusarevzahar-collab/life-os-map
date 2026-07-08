import { useEffect, useMemo, useRef, useState } from 'react';
import { executeAssistantActions, fetchAssistantStatus, postAssistantChat } from '../lib/lifeMapRuntime.js';
import { CloudQuotaMeter } from './CloudQuotaMeter.jsx';
import '../assistant-fullscreen.css';
import '../ai-capacity.css';

const CHAT_PREFIX = 'lifemap.assistant.chat.v2:';
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

function itemKey(item) {
  if (!item) return 'global';
  return item.sourceId || item.id || itemCode(item) || 'object';
}

function itemKindLabel(item) {
  if (!item) return 'LifeMap';
  if (item.kind === 'signal') return 'AI Inbox';
  if (item.kind === 'task') return 'Задача';
  return item.kind || 'Объект LifeMap';
}

function itemSummary(item) {
  if (!item) return '';
  return safeText(item.raw?.summary || item.summary || item.raw?.possibleUse || item.raw?.nextAction || item.raw?.sessionNotes || '');
}

function friendlyAssistantError(error) {
  const message = String(error?.message || error || 'Неизвестная ошибка');
  if (/capacity|rate limit|429|quota|resource_exhausted/i.test(message)) {
    return 'Бесплатный AI-пул временно исчерпал доступную квоту. LifeMap автоматически переключает модели; если закончились все доступные маршруты, чат продолжит работать после обновления квоты.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Не удалось связаться с LifeMap API. Проверь, что приложение на порту 3001 запущено.';
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
      'Разбери этот сигнал и скажи, что с ним делать',
      'Выдели инструменты, промпты и идеи из этого материала',
      'Предложи задачу, только если действие действительно нужно',
      'Скажи, куда положить этот материал и почему',
    ];
  }
  if (target?.kind === 'task') {
    return [
      'Что по этой задаче осталось сделать?',
      'Разложи задачу на маленькие шаги',
      'Найди риски, пробелы и следующий лучший шаг',
      'Сформулируй короткий план выполнения',
    ];
  }
  return [
    'Что мне делать дальше в LifeMap?',
    'Проверь текущий фокус и очередь',
    'Разбери AI Inbox и предложи порядок обработки',
    'Составь план на ближайшую рабочую сессию',
  ];
}

function readChat(key) {
  try {
    const data = JSON.parse(window.localStorage.getItem(`${CHAT_PREFIX}${key}`) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeChat(key, messages) {
  try { window.localStorage.setItem(`${CHAT_PREFIX}${key}`, JSON.stringify(messages.slice(-40))); } catch {}
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

function ActionCard({ action, onExecute, busy, disabled }) {
  const executable = EXECUTABLE_ACTIONS.has(action.type);
  return (
    <article className={`assistantActionCard ${executable ? 'isExecutable' : 'isPlan'}`}>
      <div>
        <small>{action.type || 'action'}</small>
        <b>{action.title || 'Действие LifeMap'}</b>
        <p>{action.risk || (executable ? 'backend action' : 'planning')}</p>
      </div>
      {executable ? (
        <button type="button" disabled={busy || disabled} onClick={() => onExecute(action)}>
          {busy ? 'Выполняю…' : 'Выполнить'}
        </button>
      ) : <span className="assistantPlanBadge">План</span>}
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
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('context');
  const [secret, setSecret] = useState(readSecret);
  const [wideContext, setWideContext] = useState(true);
  const scrollRef = useRef(null);

  const refreshStatus = () => fetchAssistantStatus()
    .then(setStatus)
    .catch((err) => setStatus((previous) => previous || { ok: false, configured: false, error: friendlyAssistantError(err) }));

  useEffect(() => {
    const handler = (event) => {
      setTarget(event.detail?.target || null);
      setTargetContext(event.detail?.context || {});
      setDraft('');
      setError('');
      setTab('context');
      setOpen(true);
    };
    window.addEventListener('lifemap:assistant-target', handler);
    return () => window.removeEventListener('lifemap:assistant-target', handler);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const chatKey = useMemo(() => itemKey(target), [target]);
  const context = useMemo(() => assistantContext(currentMap, activeFocus, snapshot, target, targetContext), [currentMap, activeFocus, snapshot, target, targetContext]);
  const quickPrompts = useMemo(() => quickPromptsFor(target), [target]);
  const targetText = itemSummary(target);
  const latestActions = useMemo(() => messages.flatMap((message) => message.proposedActions || []).slice(-12), [messages]);
  const snapshotStats = useMemo(() => ({ tasks: snapshot?.tasks?.length || 0, goals: snapshot?.goals?.length || 0, signals: snapshot?.signals?.length || 0, warnings: snapshot?.meta?.warnings?.length || 0 }), [snapshot]);

  useEffect(() => {
    if (!open) return undefined;
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 30000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => { setMessages(readChat(chatKey)); }, [chatKey]);
  useEffect(() => { if (open) setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 40); }, [open, messages.length]);
  useEffect(() => { writeSecret(secret); }, [secret]);

  const appendMessages = (nextMessages) => {
    setMessages((items) => {
      const next = [...items, ...nextMessages].slice(-40);
      writeChat(chatKey, next);
      return next;
    });
  };

  const openGlobal = (event) => {
    event.stopPropagation();
    setTarget(null);
    setTargetContext({});
    setTab('context');
    setOpen(true);
  };

  const sendMessage = async (event, quickText = '') => {
    event?.preventDefault?.();
    const text = safeText(quickText || draft);
    if (!text || busy) return;
    const userMessage = { role: 'user', text, createdAt: new Date().toISOString() };
    appendMessages([userMessage]);
    setDraft('');
    setBusy(true);
    setError('');
    try {
      const history = [...messages, userMessage].slice(-12).map((item) => ({ role: item.role, text: item.text }));
      const response = await postAssistantChat({ message: text, messages: history, target, context: { ...targetContext, screen: currentMap?.title, contextChips: context, snapshotStats } });
      const assistant = response.assistant || {};
      appendMessages([{ role: 'assistant', text: assistant.reply || 'Ответ пустой.', summary: assistant.summary, proposedActions: assistant.proposedActions || [], warnings: assistant.warnings || [], nextStep: assistant.nextStep, createdAt: new Date().toISOString() }]);
      if (assistant.proposedActions?.length) setTab('actions');
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      setError(friendly);
      appendMessages([{ role: 'assistant', text: friendly, createdAt: new Date().toISOString(), error: true }]);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  };

  const runAction = async (action) => {
    if (!secret) {
      setError('Для выполнения действий нужен LIFEMAP_ASSISTANT_API_SECRET. Вставь его во вкладке Настройки.');
      setTab('settings');
      return;
    }
    const ok = window.confirm(`Выполнить действие «${action.title || action.type}» в LifeMap/Notion?`);
    if (!ok) return;
    const actionId = `${action.type}-${action.title}`;
    setActionBusy(actionId);
    setError('');
    try {
      const response = await executeAssistantActions({ actions: [{ ...action, confirmed: true, requiresConfirmation: false }], secret });
      appendMessages([{ role: 'system', text: `Действие выполнено: ${action.title || action.type}`, summary: JSON.stringify(response.executedActions || response, null, 2), createdAt: new Date().toISOString() }]);
    } catch (err) {
      const friendly = friendlyAssistantError(err);
      setError(friendly);
      appendMessages([{ role: 'system', text: `Действие не выполнено: ${friendly}`, createdAt: new Date().toISOString(), error: true }]);
    } finally {
      setActionBusy('');
    }
  };

  const clearChat = () => {
    const ok = window.confirm('Очистить локальную историю этого чата?');
    if (!ok) return;
    writeChat(chatKey, []);
    setMessages([]);
  };

  const handleDraftKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    sendMessage(event);
  };

  const mainEyebrow = target ? `${itemKindLabel(target)} · ${itemCode(target)}` : 'Рабочий чат';
  const mainTitle = target ? safeText(target.title) : 'LifeMap Assistant';

  return (
    <>
      <button className="assistantFab" type="button" onClick={openGlobal} title="Открыть помощника LifeMap">AI</button>
      {open ? (
        <div className="assistantWorkspaceOverlay" onClick={() => setOpen(false)}>
          <section className={`assistantWorkspace ${wideContext ? 'withContext' : 'compactMode'}`} onClick={(event) => event.stopPropagation()}>
            <aside className="assistantWorkspaceSidebar">
              <div className="assistantBrandBlock assistantBrandCompact">
                <div className="assistantBrandIdentity"><span>AI</span><div><small>LifeMap</small><h2>Assistant</h2></div></div>
                <p>Контекст, задачи и AI Inbox в одном рабочем диалоге.</p>
              </div>

              <CloudQuotaMeter status={status} profile="chat" compact />

              <div className="assistantStatusLine">
                <span className={status?.configured ? 'ok' : 'warn'}>{status?.configured ? 'Облачный пул подключён' : 'AI ждёт backend или ключ'}</span>
                <small>{snapshotStats.tasks} задач · {snapshotStats.signals} сигналов</small>
              </div>

              <nav className="assistantWorkspaceTabs">
                <button className={tab === 'context' ? 'active' : ''} type="button" onClick={() => setTab('context')}>Контекст</button>
                <button className={tab === 'actions' ? 'active' : ''} type="button" onClick={() => setTab('actions')}>Действия <span>{latestActions.length}</span></button>
                <button className={tab === 'settings' ? 'active' : ''} type="button" onClick={() => setTab('settings')}>Настройки</button>
              </nav>

              <div className="assistantQuickStack"><small>Быстрые команды</small>{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={(event) => sendMessage(event, prompt)} disabled={busy}>{prompt}</button>)}</div>
            </aside>

            <main className="assistantWorkspaceMain">
              <header className="assistantWorkspaceHeader">
                <div><small>{mainEyebrow}</small><h1>{mainTitle}</h1></div>
                <div className="assistantHeaderActions">
                  <button type="button" onClick={() => setWideContext((value) => !value)}>{wideContext ? 'Скрыть контекст' : 'Контекст'}</button>
                  <button type="button" onClick={clearChat}>Очистить чат</button>
                  <button className="assistantCloseButton" type="button" onClick={() => setOpen(false)}>Закрыть</button>
                </div>
              </header>

              <div className="assistantChatThread fullScreenThread" ref={scrollRef}>
                {!messages.length ? <div className="assistantWelcome"><small>Готов к работе</small><h2>Что разберём?</h2><p>Спроси о текущем фокусе, задаче, очереди или материале из AI Inbox. Контекст LifeMap уже подключён.</p></div> : null}
                {messages.map((message, index) => <MessageBubble key={`${message.createdAt}-${index}`} message={message} onExecute={runAction} actionBusy={actionBusy} actionsDisabled={!status?.canExecuteActions} />)}
                {busy ? <div className="assistantMessageBubble assistant loading"><p>Анализирую контекст LifeMap…</p></div> : null}
              </div>

              {error ? <div className="assistantInlineError">{error}</div> : null}
              <form className="assistantInput assistantWorkspaceInput" onSubmit={sendMessage}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleDraftKeyDown} placeholder={target ? 'Вопрос или команда по открытому объекту…' : 'Спроси о фокусе, задачах, очереди или AI Inbox…'} />
                <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Отправляю…' : 'Отправить'}</button>
              </form>
            </main>

            {wideContext ? <aside className="assistantWorkspaceContext">
              {tab === 'context' ? <><section><small>Данные контекста</small><div className="assistantContextList">{context.map((item) => <div key={`${item.label}-${item.value}`}><b>{item.label}</b><span>{item.value}</span></div>)}</div></section><section><small>Фрагмент</small><p className="assistantTargetText large">{targetText || 'Объект не выбран. Ассистент использует глобальный контекст карты.'}</p></section></> : null}
              {tab === 'actions' ? <section><small>Действия</small>{latestActions.length ? <div className="assistantActions sideActions">{latestActions.map((action, index) => <ActionCard key={`${action.type}-${action.title}-${index}`} action={action} onExecute={runAction} busy={actionBusy === `${action.type}-${action.title}`} disabled={!status?.canExecuteActions} />)}</div> : <p className="assistantEmptyText">Пока нет предложенных действий.</p>}</section> : null}
              {tab === 'settings' ? <section><small>Настройки</small><label className="assistantSecretField">Secret для выполнения действий<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="LIFEMAP_ASSISTANT_API_SECRET" /></label><p className="assistantMutedText">Секрет хранится только в sessionStorage текущей вкладки. Без него ассистент предлагает действия, но не меняет Notion.</p><div className="assistantContextList"><div><b>API</b><span>{status?.ok ? 'доступен' : status?.error || 'проверяется'}</span></div><div><b>AI pool</b><span>{status?.model || 'не задан'}</span></div><div><b>Write actions</b><span>{status?.canExecuteActions ? 'разрешены с secret' : 'выключены'}</span></div></div></section> : null}
            </aside> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
