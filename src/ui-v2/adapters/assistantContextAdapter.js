// LifeMap UI V2 — Assistant context adapter (Stage 5B1).
// Pure functions: context chips + quick prompts per target kind.
// Lifted from the legacy AssistantPanel.jsx so behaviour matches 1:1.

function safeText(value = '') {
  return String(value || '').trim();
}

// The server always normalizes reply/summary/warnings/nextStep to strings
// (server/lifemapAi.js), but this is the last line of defence at the UI
// boundary: if an unexpected shape (object, array, null) ever reaches a
// text slot, render it as readable JSON instead of letting React coerce it
// to the literal string "[object Object]".
export function safeDisplayText(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

// Single source of truth for "can this proposed action actually mutate
// LifeMap/Notion" — shared by the action card (which decides whether to
// show a confirm button at all) and useAssistantChat's executeAction (which
// is the only place that can actually fire the mutation, and re-checks this
// itself rather than trusting the caller).
export const EXECUTABLE_ASSISTANT_ACTIONS = new Set(['update_task', 'rename_item', 'create_session', 'create_signal', 'dedupe_signals']);

export function isExecutableAssistantAction(action) {
  return Boolean(action) && EXECUTABLE_ASSISTANT_ACTIONS.has(action.type);
}

export function focusTitle(focus) {
  return safeText(focus?.title) || 'Фокус пока не выбран';
}

export function branchTitle(map) {
  return safeText(map?.title) || 'LifeMap';
}

export function itemCode(item) {
  return safeText(item?.code || item?.raw?.code || item?.icon || '').replace(/-/g, '') || 'LM';
}

export function itemKindLabel(item) {
  if (!item) return 'LifeMap';
  if (item.kind === 'signal') return 'LM Inbox';
  if (item.kind === 'asset') return 'Материал LM Inbox';
  if (item.kind === 'task') return 'Задача';
  return item.kind || 'Объект LifeMap';
}

export function friendlyAssistantError(error) {
  const message = String(error?.message || error || 'Неизвестная ошибка');
  if (/capacity|rate limit|429|quota|resource_exhausted/i.test(message)) {
    return 'Бесплатный AI-пул временно исчерпал доступную квоту. LifeMap автоматически переключает модели и продолжит работу, когда появится доступный маршрут.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Не удалось связаться с LifeMap API. Проверь статус backend для текущего окружения.';
  }
  return message.length > 320 ? `${message.slice(0, 319)}…` : message;
}

export function assistantContext(map, focus, snapshot, target, targetContext = {}) {
  const source = snapshot?.meta?.source || 'unknown';
  const connected = snapshot?.meta?.connected || {};
  const items = [
    { label: 'Экран', value: branchTitle(map) },
    { label: 'Фокус', value: focusTitle(focus) },
    { label: 'Задачи ветки', value: `активные ${Number(map?.tasks || 0)}, сделано ${Number(map?.completedTasks || 0)}` },
    { label: 'Источник', value: source },
    { label: 'LM Inbox', value: connected.signals ? 'Notion подключён' : 'live-источник не подтверждён' },
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

export function quickPromptsFor(target) {
  if (target?.kind === 'asset') {
    const assetKind = target.raw?.assetKind || '';
    const assetLabel = String(target.title || 'этот материал').trim() || 'этот материал';
    if (assetKind === 'Prompt') {
      return [
        { label: 'Как применить этот промпт', prompt: `Прочитай сохранённый промпт «${assetLabel}» и скажи, где именно в текущей работе его использовать прямо сейчас, если такое применение есть. Если применения нет — прямо скажи это.` },
        { label: 'Улучшить промпт', prompt: `Проверь промпт «${assetLabel}» на неоднозначности, лишние шаги и отсутствующие ограничения. Предложи минимальную конкретную правку, а не полный пересказ.` },
        { label: 'Сравнить с текущим подходом', prompt: `Сравни промпт «${assetLabel}» с тем, как я обычно решаю похожие задачи. Назови конкретную разницу и стоит ли переключаться.` },
      ];
    }
    if (assetKind === 'Tool') {
      return [
        { label: 'Стоит ли подключать', prompt: `Оцени инструмент «${assetLabel}» относительно текущего фокуса и активных задач. Дай одно решение: подключить сейчас, отложить или пропустить — и почему.` },
        { label: 'Что он заменит', prompt: `Скажи, какой текущий процесс или инструмент «${assetLabel}» может заменить или ускорить, и какой ценой (интеграция, обучение, риск).` },
        { label: 'Первый шаг проверки', prompt: `Дай один конкретный первый шаг, чтобы за 30 минут проверить, подходит ли «${assetLabel}» для текущей работы.` },
      ];
    }
    if (assetKind === 'Workflow') {
      return [
        { label: 'Применить к текущей работе', prompt: `Адаптируй workflow «${assetLabel}» к текущему фокусу и активным задачам: какие шаги нужны, какие можно пропустить.` },
        { label: 'Найти слабое место', prompt: `Проверь workflow «${assetLabel}» на пропущенные шаги, ручные узкие места или зависимости, которые могут его сломать в реальной работе.` },
        { label: 'Сессия по этому workflow', prompt: `Составь рабочую сессию на 30 минут, чтобы внедрить первый шаг workflow «${assetLabel}».` },
      ];
    }
    if (assetKind === 'Idea') {
      return [
        { label: 'Применить сейчас?', prompt: `Оцени идею «${assetLabel}» относительно текущего фокуса и активных задач. Прими одно решение: развивать сейчас, сохранить на потом или отложить — и почему.` },
        { label: 'Минимальная проверка', prompt: `Предложи минимальный способ проверить идею «${assetLabel}» без большого вложения времени.` },
        { label: 'Риски и сомнения', prompt: `Назови главные риски или недостающую информацию по идее «${assetLabel}», прежде чем в неё вкладываться.` },
      ];
    }
    return [
      { label: 'Применить сейчас?', prompt: `Оцени материал «${assetLabel}» относительно текущего фокуса и активных задач. Дай одно решение: использовать сейчас, сохранить или архивировать.` },
      { label: 'Что в нём ценного', prompt: `Выдели из материала «${assetLabel}» только то, что реально применимо в текущей работе; банальности пропусти.` },
      { label: 'Сравнить с работой', prompt: `Сравни материал «${assetLabel}» с текущим фокусом и активными задачами. Найди совпадение, конфликт или отсутствие связи.` },
    ];
  }

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
        prompt: 'Прими решение по этому сигналу как редактор LM Inbox: что оставить, что извлечь, что игнорировать и нужен ли конкретный следующий шаг. Не создавай задачу без реального действия.',
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
        prompt: 'Проверь переданные сигналы LM Inbox и найди максимум 3 материала, которые прямо помогают выполнить эту задачу. Если прямой пользы нет, так и скажи.',
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
      prompt: 'Найди максимум 3 сигнала LM Inbox, которые прямо помогают текущему фокусу. Для каждого скажи, что именно использовать сейчас. Если подходящих нет, не придумывай связи.',
    },
    {
      label: 'Почистить очередь',
      prompt: 'Проверь активные задачи на дубли, конфликт приоритетов, устаревшие пункты и задачи без понятного следующего действия. Покажи только действительно проблемные места и предложи минимальные изменения.',
    },
  ];
}

export function formatHistoryTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return '';
  }
}

export function sessionKindLabel(session) {
  const kind = session?.target?.kind;
  if (kind === 'signal') return 'LM Inbox';
  if (kind === 'asset') return 'Материал LM Inbox';
  if (kind === 'task') return 'Задача';
  return 'LifeMap';
}

// Distinct, named Assistant availability states — replaces a single
// unlabelled percent with something the UI can actually explain and gate
// sending on. `apiOffline` (LifeMap API showing fallback/mock data) always
// wins over whatever the AI provider status says, since without write
// access there is nothing useful an AI action could do anyway.
const QUOTA_EXHAUSTED_STATE = 'quota-exhausted';
export function assistantStatusView(status, { apiOffline = false } = {}) {
  if (apiOffline) {
    return {
      state: 'api-offline',
      label: 'LifeMap offline',
      description: 'LifeMap API сейчас недоступен — показаны последние известные данные. Отправка сообщений и AI-действия временно отключены.',
      provider: '',
      model: '',
      blocksSend: true,
    };
  }
  if (!status) {
    return {
      state: 'loading',
      label: 'Проверяю AI…',
      description: 'Проверяю доступность AI-провайдера.',
      provider: '',
      model: '',
      blocksSend: true,
    };
  }
  if (status.error) {
    return {
      state: 'provider-unavailable',
      label: 'AI недоступен',
      description: safeDisplayText(status.error, 'Не удалось проверить статус AI-провайдера.'),
      provider: '',
      model: '',
      blocksSend: true,
    };
  }
  const providers = Array.isArray(status.providers) ? status.providers.filter((provider) => provider?.configured) : [];
  if (!status.configured || !providers.length) {
    return {
      state: 'provider-unconfigured',
      label: 'AI не настроен',
      description: 'AI-провайдер не подключён. LifeMap продолжает работать без AI — сообщения отправляются, но ответ будет стандартным без реального AI-анализа.',
      provider: '',
      model: '',
      blocksSend: false,
    };
  }
  const available = providers.filter((provider) => Number(provider.blockedForMs || 0) <= 0);
  if (!available.length) {
    return {
      state: 'rate-limited',
      label: 'AI ждёт квоту',
      description: 'Все подключённые AI-маршруты сейчас заблокированы лимитом запросов. Подожди немного — LifeMap продолжит сам, когда квота обновится.',
      provider: status.provider || '',
      model: status.model || '',
      blocksSend: true,
    };
  }
  const percents = available
    .flatMap((provider) => [provider.quota?.requests?.percent, provider.quota?.tokens?.percent])
    .map((value) => (value === null || value === undefined || value === '' ? null : Number(value)))
    .filter((value) => Number.isFinite(value));
  if (percents.length && percents.every((value) => value <= 0)) {
    return {
      state: QUOTA_EXHAUSTED_STATE,
      label: 'Квота исчерпана',
      description: 'Доступная бесплатная квота AI-провайдеров исчерпана. LifeMap автоматически переключит модели, когда появится доступный маршрут.',
      provider: status.provider || '',
      model: status.model || '',
      blocksSend: true,
    };
  }
  return {
    state: 'ready',
    label: 'AI готов',
    description: status.provider ? `${status.provider}${status.model ? ` · ${status.model}` : ''}` : 'AI-провайдер доступен.',
    provider: status.provider || '',
    model: status.model || '',
    blocksSend: false,
  };
}
