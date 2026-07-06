# LifeMap

Интерактивный AI-first навигатор проектов, задач, входящих сигналов и следующего фокуса Захара.

## Что это

LifeMap — рабочая карта:

```text
цели → проекты → задачи → текущий фокус → Done / возврат в работу
```

AI Inbox является частью LifeMap. Входящий материал из Telegram проходит первичный разбор, безопасную подготовку, AI-анализ и структурированное сохранение.

## Работает сейчас

- React/Vite frontend и Express backend.
- Live-чтение Tasks, Goals, Projects, Dreams и AI Signals Inbox из Notion.
- Карта сфер LifeMap и Mission Control.
- Done / restore, переименование, заметки и drag-reorder задач.
- Telegram webhook intake с allowlist и локальным fallback.
- AI-разбор Inbox: тип, приоритет, связанные проекты, summary, assistant note, possible use и next action.
- Модель-независимый AI Provider Router: Groq primary и Gemini fallback при наличии ключа.
- Детерминированный fallback: LifeMap продолжает работать без внешнего AI.
- Минимизация контекста перед AI-вызовом и маскирование очевидных секретных и контактных данных.
- Серверная нормализация ответов модели.
- Allowlist действий и обязательное подтверждение исполняемых AI-действий.

Подробная политика: `docs/LIFEMAP_AI_POLICY.md`.

## AI-архитектура

```text
LifeMap / Telegram
  ↓
privacy minimization
  ↓
stable prompt policy
  ↓
AI Provider Router
  ├─ Groq primary
  └─ Gemini fallback when configured
  ↓
server-side normalization
  ↓
action allowlist + confirmation
  ↓
Notion / LifeMap UI
```

LifeMap не требует OpenAI API.

## AI Inbox

```text
Telegram Bot
  ↓
server/telegramAdapter.js
  ↓
server/lifemapAi.js
  ↓
server/aiProviderRouter.js
  ↓
server/telegramRoutes.js
  ↓
Notion AI Signals Inbox DB
или local fallback
  ↓
LifeMap UI
```

ИИ не создаёт задачу автоматически из каждого сигнала. Он может определить `Task candidate` и рекомендовать следующий шаг, но изменение рабочих данных проходит отдельно.

## Бесплатный AI-режим

Достаточно одного бесплатного provider key:

- Groq — основной вариант;
- Gemini — резервный вариант;
- при наличии двух провайдеров router переключается на следующий при ошибке или timeout.

Порядок, модель и timeout задаются через локальное окружение. Секреты нельзя коммитить в GitHub или присылать в чат.

## Приватность

LifeMap не отправляет внешней модели весь snapshot.

Assistant получает ограниченный контекст: текущий фокус, выбранный объект, до 16 релевантных задач, до 10 целей, до 8 сигналов и последние 8 коротких сообщений.

AI Inbox получает только текст конкретного сигнала, текущий фокус, список допустимых проектов и hostname источника. Полные prompt/response payload не выводятся в серверные логи.

## AI action safety

Исполняемые действия:

```text
update_task
rename_item
create_session
create_signal
dedupe_signals
```

Плановые действия:

```text
frontend_change_request
backend_change_request
research_request
```

Исполняемые действия требуют подтверждения и защищённого action secret. Неизвестные типы действий отбрасываются.

## Запуск

Backend:

```bash
npm run api
```

Frontend:

```bash
npm run dev
```

Backend по умолчанию работает на порту `3001`.

## Проверка

После запуска полезно проверить:

```bash
curl http://localhost:3001/api/life-os/assistant/status
curl http://localhost:3001/api/telegram/status
curl http://localhost:3001/api/life-os/health
```

Если AI provider не настроен, status покажет `configured: false`, но LifeMap и сохранение AI Inbox продолжат работать.

## Обновление кода

```bash
git pull
```

После обновления перезапусти только изменившийся процесс.

## Документы

- `docs/NAVIGATOR_MASTER_PLAN.md` — архитектурный план.
- `docs/LIFEMAP_PROGRESS_LOGIC.md` — логика процентов.
- `docs/LIFEMAP_AI_POLICY.md` — правила Assistant, AI Inbox, privacy, actions и смены моделей.

## Ближайший roadmap

1. Подключить один бесплатный provider key и провести сквозной тест.
2. Проверить Telegram → AI analysis → Notion → LifeMap UI на разных типах сигналов.
3. Добавить voice/image processing отдельным privacy-safe слоем.
4. Добавить более сильные detail panels для задач и сигналов.
5. Добавить базовую аналитику времени и прогресса.
6. Усилить visual style до premium serious tool.

## Важная логика продукта

LifeMap не должен превращаться в обычный список задач. Главная цепочка:

```text
куда я иду → какой проект активен → какая задача сейчас → что дальше → что уже сделано
```
