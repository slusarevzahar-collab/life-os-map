// LifeMap UI V2 — Stage 3 HUD mock data.
// Isolated: no API, no Notion, no snapshot, no real focusQueue/Inbox/Assistant.
// Text is lifted verbatim from the approved Claude Design source (LifeMap Home.dc.html)
// so the mock windows read like the reference, but nothing here is wired to a backend.
export const missionControlMock = {
  now: 'LifeMap Assistant: подключить бесплатный AI provider и local fallback',
  next: 'Стабилизировать рабочий сценарий навигатора',
  queue: [
    'Подключить бесплатный AI provider (Groq / Gemini)',
    'Local fallback при отсутствии сети',
    'Стабилизировать сценарий навигатора',
    'Сохранение истории чатов на устройстве',
    'Ограничитель токенов и статус ресурса',
    'Разбор входящих сигналов пачкой',
    'Экран целей: прогресс по веткам',
    'Горячие клавиши для навигации',
    'Синхронизация карты между устройствами',
    'Экспорт задач в Markdown',
  ].map((title, i) => ({ n: String(i + 1).padStart(2, '0'), title })),
};

export const inboxMock = {
  eyebrow: 'AI INBOX',
  title: 'Библиотека сигналов',
  action: 'Разобрать всё · 46',
  chips: [
    { n: 'Идеи', v: '12', active: true },
    { n: 'Задачи', v: '18' },
    { n: 'Ссылки', v: '9' },
    { n: 'Заметки', v: '7' },
  ],
  rows: [
    { src: 'Идея', kind: 'idea', title: 'Локальный режим без сети — критично для доверия', meta: 'сегодня · 09:12', score: '0.92' },
    { src: 'Задача', kind: 'task', title: 'Настроить health-check провайдера AI', meta: 'сегодня · 08:40', score: '0.88' },
    { src: 'Заметка', kind: 'note', title: 'Groq даёт бесплатный лимит, хватит для MVP', meta: 'вчера · 22:03', score: '0.71' },
    { src: 'Идея', kind: 'idea', title: 'Показывать остаток токенов в шапке ассистента', meta: 'вчера · 18:27', score: '0.66' },
    { src: 'Задача', kind: 'task', title: 'Пакетный разбор входящих одним действием', meta: 'вчера · 14:55', score: '0.61' },
    { src: 'Заметка', kind: 'note', title: 'История чатов — только на устройстве, без облака', meta: '2 дня назад', score: '0.58' },
  ],
};

export const assistantMock = {
  title: 'LifeMap Assistant',
  history: [
    { t: 'Выбор AI provider для MVP', s: 'сегодня · 4 сообщения', active: true },
    { t: 'Как устроить local fallback', s: 'вчера · 7 сообщений' },
    { t: 'Архитектура навигатора', s: '2 дня назад · 5 сообщений' },
  ],
  decisions: [
    'Провайдер AI: Groq на старте',
    'Fallback: кэш последних ответов',
    'Хранение истории: локально',
    'Лимит: индикатор ресурса в шапке',
  ],
  greetingTitle: 'Что нужно решить?',
  greetingBody:
    'Опиши проблему или решение, которое нужно принять. История чатов сохранится на этом устройстве.',
  placeholder: 'Опиши решение, которое нужно принять, или проблему в работе…',
  suggestions: ['Выбрать AI provider', 'Спланировать fallback', 'Разобрать инбокс'],
};
