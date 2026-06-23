# LifeMap

Интерактивный AI-first навигатор проектов, задач, входящих сигналов и следующего фокуса Захара.

## Что это

LifeMap — не просто dashboard. Это рабочая карта, которая помогает не теряться в проектах и задачах:

```text
цели → проекты → задачи → очередь фокуса → Done / возврат в работу
```

Главный смысл LifeMap — видеть систему целиком и быстро понимать: над чем я работаю сейчас, что дальше, какие проекты двигают меня к доходу и какие входящие сигналы стоит обработать.

## Логика процентов

Процент выполнения считается от количества выполненных задач внутри ветки:

```text
прогресс = выполненные задачи / все задачи * 100
```

Если у цели 10 задач, каждая закрытая задача добавляет 10%. Если у проекта 100 задач, каждая закрытая задача добавляет 1%. Эта логика применяется к проектам, целям, сферам и корневому LifeMap.

## Текущий статус

Работает:

- React/Vite frontend.
- Express backend.
- Live-чтение Notion Tasks DB.
- Live-чтение Goals DB, Projects DB, Dreams DB и AI Signals Inbox DB, если переданы ID и интеграции есть доступ.
- Карта сфер: LifeMap → Проекты / AI Inbox / Цели / Жизнь / Доход / Идеи.
- Отдельная планета AI Inbox для входящих материалов из Telegram-бота и других источников.
- Telegram webhook intake: сообщение боту → первичная классификация → AI Inbox signal → Notion или локальный fallback.
- Mission Control с текущим фокусом и очередью.
- Done / возврат задачи из выполненных.
- Переименование через контекстное меню.
- Заметки к задаче через раскрытие карточки.
- Drag-перестановка задач в списке с записью порядка в Notion через Priority.
- Визуальный прогресс на планетах и в списках веток.
- Notion adapter вынесен в `server/notionAdapter.js`.
- Telegram adapter вынесен в `server/telegramAdapter.js`.
- Архитектурный план хранится в `docs/NAVIGATOR_MASTER_PLAN.md`.
- Логика процентов отдельно описана в `docs/LIFEMAP_PROGRESS_LOGIC.md`.

## Простая схема

```text
Telegram Bot
  ↓ webhook
server/telegramAdapter.js
  ↓
server.js: /api/telegram/webhook
  ↓
Notion AI Signals Inbox DB или .data/telegram-inbox.jsonl
  ↓
server.js: /api/life-os/snapshot
  ↓
LifeMap UI → планета AI Inbox
```

```text
Notion DBs
  ↓
server/notionAdapter.js
  ↓
server.js: /api/life-os/snapshot
  ↓
React frontend
  ↓
LifeMap UI
```

## Как запускать в Codespaces

Нужно два терминала.

### Терминал 1 — API / backend

Это сервер, который читает Notion и принимает Telegram webhook. Он работает на порту `3001`.

```bash
npm run api
```

Токены нельзя присылать в чат и нельзя коммитить в GitHub. Лучше хранить значения в `.env`.

Если всё хорошо, увидишь:

```text
LifeMap API listening on http://localhost:3001
NOTION_TOKEN is set
NOTION_TASKS_DB_ID is set
```

Этот терминал не закрывать.

### Терминал 2 — frontend / сайт

Это интерфейс карты. Он обычно работает на `5173` или `5174`.

```bash
npm run dev
```

Открывать сайт нужно через вкладку Ports / Порты или через всплывающее окно Codespaces.

## Telegram → LifeMap AI Inbox

### Что нужно в `.env`

```env
TELEGRAM_BOT_TOKEN=токен_из_BotFather
TELEGRAM_WEBHOOK_SECRET=любой_длинный_секретный_текст
TELEGRAM_ALLOWED_USER_IDS=твой_telegram_user_id
NOTION_SIGNALS_DB_ID=id_базы_AI_Signals_Inbox
```

`NOTION_SIGNALS_DB_ID` желателен, но не обязателен для первого теста. Если база не подключена, входящие сообщения сохраняются локально в `.data/telegram-inbox.jsonl` и всё равно попадают в snapshot LifeMap как локальные сигналы.

### Как подключить webhook

Порт API `3001` должен быть публичным в Codespaces Ports. После этого возьми публичный HTTPS URL порта `3001` и выполни:

```bash
curl -X POST http://localhost:3001/api/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ТВОЙ-АДРЕС-3001.app.github.dev/api/telegram/webhook"}'
```

Проверка статуса:

```bash
curl http://localhost:3001/api/telegram/status
```

После этого можно написать боту в Telegram. Он должен ответить, что принял сообщение в LifeMap AI Inbox.

## Как обновлять код

Если ассистент внёс правки в GitHub:

```bash
git pull
```

Потом перезапусти только тот процесс, который реально менялся.

Для frontend:

```bash
npm run dev
```

Для API:

```bash
npm run api
```

## Частые ошибки

### EADDRINUSE / port 3001 already in use

API уже запущен в другом терминале. Найди старый терминал с `LifeMap API listening...` и останови его вручную, либо не запускай второй API.

### `api offline` в интерфейсе

Frontend не видит API или API не запущен. Проверь терминал API и перезагрузи сайт.

### `connected`, но нет Goals/Projects/Signals

Проверь, что:

- в `.env` переданы нужные `NOTION_*_DB_ID`;
- Notion integration `LifeMap Backend` подключена к этим базам;
- в базах есть записи.

### Telegram webhook не принимает сообщения

Проверь, что:

- `TELEGRAM_BOT_TOKEN` есть в `.env`;
- API-порт `3001` публичный;
- webhook URL ведёт именно на `/api/telegram/webhook`;
- `TELEGRAM_WEBHOOK_SECRET` в `.env` совпадает с тем, который передан через `/api/telegram/set-webhook`;
- если задан `TELEGRAM_ALLOWED_USER_IDS`, твой Telegram user ID есть в списке.

### Порт 5173/5174 меняется

Это нормально. Vite берёт свободный порт. Смотри актуальную ссылку в Ports / Порты.

## Ближайший roadmap

1. Протестировать Telegram → AI Inbox на реальном боте.
2. Подключить AI Signals Inbox DB в Notion и проверить запись сигналов.
3. Добавить обработку голосовых/файлов/пересланных постов как отдельный слой.
4. Подключить AI-разбор: краткое summary, польза, связанный проект, возможная задача.
5. Добавить нормальные окна/панели для деталей задач и сигналов.
6. Добавить базовую аналитику времени и прогресса.
7. Усилить визуальный стиль до premium / serious tool.

## Важная логика продукта

Не превращать карту в обычный список задач. Список задач полезен, но главный смысл LifeMap — видеть систему целиком:

```text
куда я иду → какой проект активен → какая задача сейчас → что дальше → что уже сделано
```
