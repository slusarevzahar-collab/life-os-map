import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAssistantStatus, postAssistantChat } from '../lib/lifeMapRuntime.js';

const CHAT_PREFIX = 'lifemap.assistant.chat.v1:';

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
  return safeText(item?.code || item?.raw?.code || item?.icon || '').replace('-', '') || 'AI';
}

function itemKey(item) {
  if (!item) return 'global';
  return item.sourceId || item.id || itemCode(item) || 'object';
}

function itemKindLabel(item) {
  if (!item) return 'Глобальный режим';
  if (item.kind === 'signal') return 'AI Inbox signal';
  if (item.kind === 'task') return 'Задача';
  return item.kind || 'Объект LifeMap';
}

function itemSummary(item) {
  if (!item) return '';
  return safeText(item.raw?.summary || item.summary || item.raw?.possibleUse || item.raw?.nextAction || item.raw?.sessionNotes || '');
}

function assistantContext(map, focus, snapshot, target, targetContext = {}) {
  const source = snapshot?.meta?.source || 'unknown';
  const connected = snapshot?.meta?.connected || {};
  const taskCount = Number(map?.tasks || 0);
  const doneCount = Number(map?.completedTasks || 0);
  const items = [
    `Экран: ${branchTitle(map)}`,
    `Текущий фокус: ${focusTitle(focus)}`,
    `Задачи ветки: активные ${taskCount}, сделано ${doneCount}`,
    `Источник данных: ${source}`,
    connected.signals ? 'AI Inbox подключён к Notion' : 'AI Inbox не подтверждён как live-источник',
  ];

  if (target) {
    items.unshift(`${itemKindLabel(target)}: ${itemCode(target)} · ${safeText(target.title)}`);
    if (target.status) items.push(`Статус объекта: ${target.status}`);
    if (target.raw?.sourceUrl) items.push(`Источник: ${target.raw.sourceUrl}`);
    if (targetContext?.mapTitle) items.push(`Родительская ветка: ${targetContext.mapTitle}`);
    if (Array.isArray(targetContext?.contextItems) && targetContext.contextItems.length) items.push(`Контекстных файлов: ${targetContext.contextItems.length}`);
  }

  return items;
}

function quickPromptsFor(target) {
  if (target?.kind === 'signal') return ['Разбери этот сигнал', 'Выдели инструменты и промпты', 'Сделай из этого задачу', 'Сохрани как материал проекта'];
  if (target?.kind === 'task') return ['Что осталось сделать?', 'Разложи на маленькие шаги', 'Найди риски и пробелы', 'Сформулируй следующий шаг'];
  return ['Что делать дальше?', 'Покажи текущий фокус', 'Разбери AI Inbox', 'Предложи следующий шаг'];
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
  try { window.localStorage.setItem(`${CHAT_PREFIX}${key}`, JSON.stringify(messages.slice(-30))); } catch {}
}

export function AssistantPanel({ currentMap, activeFocus, snapshot }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(null);
  const [targetContext, setTargetContext] = useState({});
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      setTarget(event.detail?.target || null);
      setTargetContext(event.detail?.context || {});
      setDraft('');
      setError('');
      setOpen(true);
    };
    window.addEventListener('lifemap:assistant-target', handler);
    return () => window.removeEventListener('lifemap:assistant-target', handler);
  }, []);

  const chatKey = useMemo(() => itemKey(target), [target]);
  const context = useMemo(() => assistantContext(currentMap, activeFocus, snapshot, target, targetContext), [currentMap, activeFocus, snapshot, target, targetContext]);
  const quickPrompts = useMemo(() => quickPromptsFor(target), [target]);
  const title = target ? `${itemCode(target)} · ${safeText(target.title)}` : 'Помощник LifeMap';
  const targetText = itemSummary(target);

  useEffect(() => {
    if (!open) return;
    fetchAssistantStatus().then(setStatus).catch((err) => setStatus({ ok: false, configured: false, error: err.message }));
  }, [open]);

  useEffect(() => { setMessages(readChat(chatKey)); }, [chatKey]);
  useEffect(() => { if (open) setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 40); }, [open, messages.length]);

  const appendMessages = (nextMessages) => {
    setMessages((items) => {
      const next = [...items, ...nextMessages].slice(-30);
      writeChat(chatKey, next);
      return next;
    });
  };

  const openGlobal = (event) => {
    event.stopPropagation();
    setTarget(null);
    setTargetContext({});
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
      const response = await postAssistantChat({ message: text, messages: history, target, context: { ...targetContext, screen: currentMap?.title, contextChips: context } });
      const assistant = response.assistant || {};
      appendMessages([{ role: 'assistant', text: assistant.reply || 'Ответ пустой.', summary: assistant.summary, proposedActions: assistant.proposedActions || [], warnings: assistant.warnings || [], nextStep: assistant.nextStep, createdAt: new Date().toISOString() }]);
    } catch (err) {
      setError(err.message);
      appendMessages([{ role: 'assistant', text: `Не получилось получить ответ: ${err.message}`, warnings: [err.message], createdAt: new Date().toISOString(), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    writeChat(chatKey, []);
    setMessages([]);
  };

  return (
    <>
      <button className="assistantFab" type="button" onClick={openGlobal} title="Открыть помощника LifeMap">AI</button>
      {open ? (
        <div className="assistantOverlay" onClick={() => setOpen(false)}>
          <section className="assistantPanel assistantPanelChat" onClick={(event) => event.stopPropagation()}>
            <header className="assistantHeader">
              <div>
                <small>{target ? `LifeMap Assistant · ${itemKindLabel(target)}` : 'LifeMap Assistant'}</small>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="assistantStatusBar">
              <span className={status?.configured ? 'ok' : 'warn'}>{status?.configured ? `AI подключён · ${status.model || 'model'}` : 'AI ждёт настройку backend'}</span>
              <span>{status?.canExecuteActions ? 'Действия защищены' : 'Режим чата'}</span>
            </div>

            <div className="assistantBlock compactAssistantContext">
              <small>Контекст</small>
              <div className="assistantChips">{context.map((item) => <span key={item}>{item}</span>)}</div>
              {targetText ? <p className="assistantTargetText">{targetText}</p> : null}
            </div>

            <div className="assistantChatThread" ref={scrollRef}>
              {!messages.length ? <div className="assistantMessage assistantSystemMessage"><b>Контекстный чат готов.</b><p>Задай вопрос по текущей карте, задаче или сигналу.</p></div> : null}
              {messages.map((message, index) => (
                <div key={`${message.createdAt}-${index}`} className={`assistantMessageBubble ${message.role} ${message.error ? 'error' : ''}`}>
                  <small>{message.role === 'user' ? 'Ты' : 'AI'}</small>
                  <p>{message.text}</p>
                  {message.summary ? <details><summary>Сводка</summary><pre>{message.summary}</pre></details> : null}
                  {message.warnings?.length ? <div className="assistantWarnings">{message.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
                  {message.nextStep ? <div className="assistantNextStep"><b>Далее:</b> {message.nextStep}</div> : null}
                  {message.proposedActions?.length ? <div className="assistantActions">{message.proposedActions.map((action, actionIndex) => <div className="assistantActionCard" key={`${action.type}-${action.title}-${actionIndex}`}><small>{action.type}</small><b>{action.title}</b><p>{action.risk || 'planned'}</p></div>)}</div> : null}
                </div>
              ))}
              {busy ? <div className="assistantMessageBubble assistant loading"><p>Думаю по контексту LifeMap…</p></div> : null}
            </div>

            {error ? <div className="assistantInlineError">{error}</div> : null}
            <div className="assistantQuickActions">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={(event) => sendMessage(event, prompt)} disabled={busy}>{prompt}</button>)}</div>

            <form className="assistantInput assistantChatInput" onSubmit={sendMessage}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Спроси LifeMap Assistant о текущем фокусе, очереди, AI Inbox или следующем шаге." />
              <div className="assistantInputFooter">
                <button type="button" onClick={clearChat}>Очистить</button>
                <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Отправляю…' : 'Отправить'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
