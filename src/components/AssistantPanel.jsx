import { useEffect, useMemo, useState } from 'react';

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

const ASSISTANT_RULES = [
  'Всегда учитывать выбранную задачу, сигнал или планету как главный контекст чата.',
  'Не превращать входящий пост в задачу автоматически без решения пользователя.',
  'Сначала выделять: суть, применимость, проект, тип актива, следующий шаг.',
  'Промпты складывать в библиотеку промптов по цели применения.',
  'Инструменты складывать в библиотеку инструментов с платформой, ссылкой и способом применения.',
  'Опасные, юридические и финансовые сигналы помечать как требующие проверки.',
];

function quickPromptsFor(target) {
  if (target?.kind === 'signal') {
    return ['Разбери этот сигнал', 'Выдели инструменты и промпты', 'Сделай из этого задачу', 'Сохрани как материал проекта'];
  }
  if (target?.kind === 'task') {
    return ['Что осталось сделать?', 'Разложи на маленькие шаги', 'Найди риски и пробелы', 'Сформулируй следующий шаг'];
  }
  return ['Разбери выбранный сигнал', 'Что сделать следующим?', 'Создай задачу из этого поста', 'Сохрани как промпт'];
}

function assistantIntro(target) {
  if (!target) return 'Я вижу общий контекст LifeMap: текущий экран, фокус, очередь и подключённые источники. Позже здесь будет настоящий AI-диалог.';
  return `Я открыт в контексте «${safeText(target.title)}». Когда модель будет подключена, она будет получать ID, статус, заметки, исходный текст, связанную ветку и соседний контекст этого объекта.`;
}

export function AssistantPanel({ currentMap, activeFocus, snapshot }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(null);
  const [targetContext, setTargetContext] = useState({});

  useEffect(() => {
    const handler = (event) => {
      setTarget(event.detail?.target || null);
      setTargetContext(event.detail?.context || {});
      setDraft('');
      setOpen(true);
    };
    window.addEventListener('lifemap:assistant-target', handler);
    return () => window.removeEventListener('lifemap:assistant-target', handler);
  }, []);

  const context = useMemo(() => assistantContext(currentMap, activeFocus, snapshot, target, targetContext), [currentMap, activeFocus, snapshot, target, targetContext]);
  const quickPrompts = useMemo(() => quickPromptsFor(target), [target]);
  const title = target ? `${itemCode(target)} · ${safeText(target.title)}` : 'Помощник навигатора';
  const targetText = itemSummary(target);

  const openGlobal = (event) => {
    event.stopPropagation();
    setTarget(null);
    setTargetContext({});
    setOpen(true);
  };

  return (
    <>
      <button className="assistantFab" type="button" onClick={openGlobal} title="Открыть помощника LifeMap">AI</button>
      {open ? (
        <div className="assistantOverlay" onClick={() => setOpen(false)}>
          <section className="assistantPanel" onClick={(event) => event.stopPropagation()}>
            <header className="assistantHeader">
              <div>
                <small>{target ? `LifeMap Assistant · ${itemKindLabel(target)}` : 'LifeMap Assistant'}</small>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="assistantChatMock">
              <div className="assistantMessage assistantSystemMessage">
                <b>Контекстный чат подготовлен.</b>
                <p>{assistantIntro(target)}</p>
              </div>
              {targetText ? (
                <div className="assistantMessage assistantContextMessage">
                  <small>Фрагмент контекста</small>
                  <p>{targetText}</p>
                </div>
              ) : null}
            </div>

            <div className="assistantBlock">
              <small>Контекст, который помощник должен видеть</small>
              <div className="assistantChips">{context.map((item) => <span key={item}>{item}</span>)}</div>
            </div>

            <div className="assistantBlock assistantRulesBlock">
              <small>Базовые правила помощника</small>
              <ol className="assistantRules">{ASSISTANT_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ol>
            </div>

            <div className="assistantBlock">
              <small>Быстрые действия</small>
              <div className="assistantQuickActions">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}</button>)}</div>
            </div>

            <form className="assistantInput" onSubmit={(event) => event.preventDefault()}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={target ? 'Спроси что-то по этой задаче или сигналу. Контекст уже прикреплён к будущему AI.' : 'Здесь будет глобальный диалог с помощником LifeMap.'} />
              <button type="submit" disabled>AI будет подключён позже</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
