# Life OS Map

Интерактивный AI-first навигатор целей, задач, рабочих сессий и следующих действий Захара.

## Что это

Life OS Map — не просто dashboard. Это визуальная карта жизни/проектов:

```text
AI-first Life OS → Goals → Tasks → Work Sessions → Time / Progress / Copilot
```

Карта должна быть главным способом ориентироваться во всём объёме целей и задач. Панели слева/справа — вспомогательные: их можно скрывать, чтобы работать с чистой картой.

## Текущий статус

Работает:

- React/Vite frontend.
- Express backend.
- Live-чтение Notion Tasks DB.
- Live-чтение Goals DB и Work Sessions DB, если переданы ID.
- Canvas-like модель: root → goals → tasks.
- Фильтры карты: Все / Сейчас / Следующее / В работе / Пауза.
- Command Deck, Active Queue, Data panel, Plan panel, Copilot panel.
- Notion adapter вынесен в `server/notionAdapter.js`.
- Архитектурный план хранится в `docs/NAVIGATOR_MASTER_PLAN.md`.

## Простая схема

```text
Notion DBs
  ↓
server/notionAdapter.js
  ↓
server.js: /api/life-os/snapshot
  ↓
React frontend
  ↓
Life OS Map UI
```

## Как запускать в Codespaces

Нужно два терминала.

### Терминал 1 — API / backend

Это сервер, который читает Notion. Он работает на порту `3001`.

```bash
NOTION_TOKEN="ТВОЙ_ТОКЕН" NOTION_TASKS_DB_ID="a6fbb0e23b2542908e374a1298cf3842" NOTION_GOALS_DB_ID="a399c256328b4a5aa2f6e70402309b78" NOTION_SESSIONS_DB_ID="704ef8ce0e144db3b1cf9871b5194fa7" npm run api
```

Токен нельзя присылать в чат и нельзя коммитить в GitHub.

Если всё хорошо, увидишь:

```text
Life OS API listening on http://localhost:3001
NOTION_TOKEN is set
NOTION_TASKS_DB_ID is set
NOTION_GOALS_DB_ID is set
NOTION_SESSIONS_DB_ID is set
```

Этот терминал не закрывать.

### Терминал 2 — frontend / сайт

Это интерфейс карты. Он обычно работает на `5173` или `5174`.

```bash
npm run dev
```

Открывать сайт нужно через вкладку Ports / Порты или через всплывающее окно Codespaces.

## Как обновлять код

Если ассистент внёс правки в GitHub:

```bash
git pull
```

Потом перезапусти нужный процесс.

Для frontend:

```bash
Ctrl + C
npm run dev
```

Для API:

```bash
Ctrl + C
NOTION_TOKEN="ТВОЙ_ТОКЕН" NOTION_TASKS_DB_ID="a6fbb0e23b2542908e374a1298cf3842" NOTION_GOALS_DB_ID="a399c256328b4a5aa2f6e70402309b78" NOTION_SESSIONS_DB_ID="704ef8ce0e144db3b1cf9871b5194fa7" npm run api
```

## Частые ошибки

### EADDRINUSE / port 3001 already in use

API уже запущен в другом терминале. Найди старый терминал с `Life OS API listening...` и нажми `Ctrl + C`, либо не запускай второй API.

### `fallback` в интерфейсе

Frontend не видит API или API не запущен. Проверь терминал API и перезагрузи сайт.

### `connected`, но нет Goals/Sessions

Проверь, что:

- в команду API переданы `NOTION_GOALS_DB_ID` и `NOTION_SESSIONS_DB_ID`;
- Notion integration `Life OS Map Backend` подключена к этим базам;
- в базах есть записи.

### Порт 5173/5174 меняется

Это нормально. Vite берёт свободный порт. Смотри актуальную ссылку в Ports / Порты.

## Ближайший roadmap

1. Стабилизировать canvas-layout карты.
2. Добавить drag/zoom и ограничения пустой области.
3. Разделить frontend на компоненты.
4. Добавить write API для Work Sessions DB.
5. Добавить task event API: старт, пауза, завершение, перенос.
6. Добавить календарную и временную аналитику.
7. Усилить визуальный стиль до premium / serious tool.

## Важная логика продукта

Не превращать карту в обычный список задач. Список задач полезен, но главный смысл Life OS Map — видеть систему целиком:

```text
куда я иду → какие цели активны → какие задачи двигают цель → сколько времени уходит → что делать дальше
```
