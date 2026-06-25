import { useMemo, useState } from 'react';

function safeText(value = '') {
  return String(value || '').trim();
}

function focusTitle(focus) {
  return safeText(focus?.title) || 'Фокус пока не выбран';
}

function branchTitle(map) {
  return safeText(map?.title) || 'LifeMap';
}

function assistantContext(map, focus, snapshot) {
  const source = snapshot?.meta?.source || 'unknown';
  const connected = snapshot?.meta?.connected || {};
  const taskCount = Number(map?.tasks || 0);
  const doneCount = Number(map?.completedTasks || 0);
  return [
    `Экран: ${branchTitle(map)}`,
    `Текущий фокус: ${focusTitle(focus)}`,
    `Задачи ветки: активные ${taskCount}, сделано ${doneCount}`,
    `Источник данных: ${source}`,
    connected.signals ? 'AI Inbox подключён к Notion' : 'AI Inbox не подтверждён как live-источник',
  ];
}

const ASSISTANT_RULES = [
  'Не превращать входящий пост в задачу автоматически без решения пользователя.',
  'Сначала выделять: суть, применимость, проект, тип актива, следующий шаг.',
  'Промпты складывать в библиотеку промптов по цели применения.',
  'Инструменты складывать в библиотеку инструментов с платформой, ссылкой и способом применения.',
  'Опасные, юридические и финансовые сигналы помечать как требующие проверки.',
];

export function AssistantPanel({ currentMap, activeFocus, snapshot }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const context = useMemo(() => assistantContext(currentMap, activeFocus, snapshot), [currentMap, activeFocus, snapshot]);
  const quickPrompts = [
    'Разбери выбранный сигнал',
    'Что сделать следующим?',
    'Создай задачу из этого поста',
    'Сохрани как промпт',
  ];

  return (
    <>
      <button className="assistantFab" type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} title="Открыть помощника LifeMap">
        AI
      </button>
      {open ? (
        <div className="assistantOverlay" onClick={() => setOpen(false)}>
          <section className="assistantPanel" onClick={(event) => event.stopPropagation()}>
            <header className="assistantHeader">
              <div>
                <small>LifeMap Assistant</small>
                <h2>Помощник навигатора</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="assistantStatus">
              <b>Пока это UI-оболочка.</b>
              <p>Позже сюда подключим модель, которая будет читать контекст LifeMap, Notion и AI Inbox. Сейчас экран нужен, чтобы заранее правильно заложить место, сценарии и инструкции.</p>
            </div>

            <div className="assistantBlock">
              <small>Контекст, который помощник должен видеть</small>
              <div className="assistantChips">
                {context.map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>

            <div className="assistantBlock">
              <small>Базовые правила помощника</small>
              <ol className="assistantRules">
                {ASSISTANT_RULES.map((rule) => <li key={rule}>{rule}</li>)}
              </ol>
            </div>

            <div className="assistantBlock">
              <small>Быстрые действия</small>
              <div className="assistantQuickActions">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>

            <form className="assistantInput" onSubmit={(event) => event.preventDefault()}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Здесь будет диалог с помощником: можно будет спросить, что делать с сигналом, задачей или проектом." />
              <button type="submit" disabled>AI будет подключён позже</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
