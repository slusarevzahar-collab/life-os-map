# LifeMap — контекст для Claude Code

## Что это
LifeMap — персональный AI-навигационный центр Захара: цели → проекты → задачи → текущий фокус → Done.
Это не обычный таск-трекер. LM Inbox является частью LifeMap и превращает входящие материалы из Telegram в структурированную библиотеку промптов, инструментов, workflow, идей, материалов и кандидатов в задачи.

Канонические пользовательские названия:
- LifeMap;
- LM Assistant;
- LM Inbox.

`Life OS`, `LifeMap Assistant` и `AI Inbox` — устаревшие алиасы. Их можно учитывать при чтении старых данных и исторических документов, но не возвращать в новом пользовательском интерфейсе и новых AI-ответах.

## Главное правило работы
Нет разделения обязанностей между Claude, GPT и другими AI-инструментами.
Любой агент может работать с frontend, backend, инфраструктурой, документацией и интеграциями, если задача этого требует.
Не ограничивать себя "своей зоной" и не предполагать, что другой агент обязательно доделает соседнюю часть.
Перед изменениями проверять актуальный код и документы в репозитории.

## Текущая архитектура
- React 18 + Vite frontend
- Express backend
- Codespaces: единый рабочий порт 3001, UI + API + Telegram webhook
- Vercel: Vite UI в `dist/` + serverless entrypoint `api/index.js` для `/api/*`
- Notion как source of truth для рабочих данных
- Telegram → LM Inbox → AI analysis → Notion/local fallback → LifeMap UI
- AI provider router с несколькими Groq routes и fallback-архитектурой
- дальнейший план: Gemini как независимый cloud fallback, затем локальная Gemma через LM Studio последним fallback route

Обычный Codespaces запуск:

```bash
npm run app
```

Не возвращать отдельный frontend на порт 3000.

## Текущая роль LM Assistant
LM Assistant — слой решений и исполнения, а не универсальный чат.

Он должен:
1. выбирать главный приоритет и объяснять trade-off;
2. находить блокеры, зависимости, противоречия, дубли и задачи без следующего действия;
3. собирать короткие рабочие сессии с ясным Done;
4. связывать конкретные сигналы LM Inbox с текущим фокусом, не выдумывая применение;
5. предлагать минимальные изменения LifeMap через protected actions.

Стандарт ответа:
- решение сначала;
- конкретные названия задач/сигналов как evidence;
- без пересказа карты;
- без фраз «сосредоточься на текущем фокусе» без конкретного действия;
- если LM Inbox не содержит ничего полезного для текущей работы — прямо говорить об этом;
- максимум один главный приоритет, до двух вторичных;
- для рабочей сессии: цель, 2–4 шага, первый физический шаг, критерий Done.

Интерфейс LM Assistant:
- удалены отдельные вкладки `Контекст / Действия / Настройки`;
- actions показываются прямо под релевантным AI-ответом;
- отдельный видимый блок `Изменения` убран; protected action flow должен сохраняться без постоянной технической панели;
- decision workflows: узкое место, 45-минутная сессия, Inbox → текущая работа, очистка очереди;
- right context panel удалён как лишний постоянный слой;
- убраны дублирующие описания роли, название активной модели и технические подписи маршрутов;
- AI resource UI — одна общая шкала `Ресурс AI`, агрегированная по доступному облачному пулу;
- история чатов находится в sidebar: независимые локальные сессии, `+ Новый`, переключение, автоматический заголовок по первому сообщению, меню `⋯` для действий над чатом и миграция legacy storage;
- на mobile/Fold история открывается компактной icon-кнопкой и drawer;
- глобальная шапка не дублирует название LM Assistant;
- composer должен оставаться компактным, округлым и похожим на современное AI-chat поле ввода;
- на главном экране LM Inbox не отображается как планета: это отдельная launcher-кнопка рядом с AI.

Текущая реализация истории:
- метаданные сессий: `src/lib/assistantChatHistory.js`;
- сообщения и индекс хранятся в localStorage текущего origin;
- история пока локальна конкретному браузеру и домену;
- задача синхронизации истории между устройствами создана в LifeMap Tasks со статусом Next;
- target-сессии сохраняют компактный snapshot контекста, без полного snapshot LifeMap;
- не ломать migration старых локальных чатов.

Правило для AI resource UI:
- показывать один понятный процент и одну шкалу;
- не выводить названия моделей и внутренние route names;
- не дублировать технический статус вроде `4 из 4 маршрутов доступны` в основном пользовательском интерфейсе;
- точные provider/model diagnostics оставлять только для status/debug API.

## Текущий приоритет
Главная активная инфраструктурная задача: **настроить Telegram webhook на Vercel production endpoint**.

Критерий готовности:
1. Telegram webhook указывает на стабильный Vercel endpoint `/api/telegram/webhook`;
2. secret и Telegram allowlist проверяются;
3. при выключенном Codespace тестовое сообщение доходит до backend;
4. запись появляется в LM Inbox / Notion;
5. бот отдаёт один короткий acknowledgement без дублей.

После webhook:
1. синхронизация истории LM Assistant между устройствами;
2. независимый Gemini cloud fallback;
3. local_lmstudio bridge для Gemma как последний fallback.

## Vercel deployment

Файлы:
- `api/index.js` — serverless entrypoint для Express app;
- `vercel.json` — `/api/:path*` → API function;
- `docs/VERCEL_DEPLOYMENT.md` — environment variables и проверка.

После deploy проверить:

```text
/api/life-os/health
/api/life-os/snapshot
/api/life-os/assistant/status
/api/telegram/status
```

Пути API пока сохраняют legacy `/api/life-os/*` ради совместимости. Не переименовывать маршруты одновременно с UI-терминологией без отдельной миграции и обратной совместимости.

Важно: Vercel backend не получит локальный `.env` из Codespaces. Нужные значения должны быть добавлены в Vercel Project Settings → Environment Variables. Не коммитить секреты.

При Git integration push в production branch `main` должен автоматически создавать production deployment. Пользователю не нужно вручную нажимать Redeploy после каждого изменения кода.

Не путать URL:
- стабильный production domain должен вести на текущий production deployment;
- URL вида `<project>-<unique-hash>-<scope>.vercel.app` относится к конкретному deployment/commit и не обновляется вместе с новыми коммитами;
- при проверке последних изменений использовать стабильный production domain проекта или branch URL, а не старый commit-specific deployment URL.

Bulk LM Inbox reprocess пока хранит progress в process memory и не считается durable serverless workflow. Не переписывать его под Vercel наивно; для production нужен durable queue/workflow.

## Важные документы
- `docs/LIFEMAP_AI_POLICY.md` — правила поведения LM Assistant и LM Inbox
- `docs/FRONTEND_FUNCTION_CONTRACT.md` — функции, которые нельзя потерять при redesign
- `docs/NAVIGATOR_MASTER_PLAN.md` — архитектурный план
- `docs/VERCEL_DEPLOYMENT.md` — deploy backend/API на Vercel
- `README.md` — текущий запуск и общая архитектура

## Правила разработки
- Делать небольшие безопасные итерации вместо больших переписываний.
- Не ломать существующие функции ради визуального упрощения.
- Перед крупным redesign сверяться с `docs/FRONTEND_FUNCTION_CONTRACT.md`.
- Интерфейс должен работать на desktop, 13-inch laptop и mobile/Fold.
- Сохранять русский интерфейс и корректную кириллицу.
- Не коммитить `.env`, токены, ключи и локальные secrets.
- Не логировать prompts/responses и секретные payloads без необходимости.
- Если Notion или AI provider недоступен, использовать предусмотренные fallback-механизмы и не терять данные.
- Исполняемые AI-действия требуют подтверждения и protected action flow.
- LM Inbox может извлекать несколько assets из одного входящего сигнала.
- Не превращать каждый входящий материал в задачу автоматически.
- Не добавлять декоративные панели и вкладки без самостоятельной пользовательской функции.
- При упрощении UI сохранять функции через более естественный контекстный доступ, а не удалять backend-возможности.

## Git workflow при параллельной работе
Перед началом:

```bash
git status --short
git pull --ff-only
```

Если в рабочем дереве есть локальные изменения, сначала понять их происхождение; не удалять и не перезаписывать их автоматически.
После законченной задачи:
- проверить diff;
- запустить релевантные тесты/build;
- сделать понятный commit;
- push в main только когда изменения согласованы с текущим состоянием репозитория.

## Базовая проверка

```bash
npm run test:ai
npm run build
```

Для runtime-проверки Codespaces:

```bash
curl http://localhost:3001/api/life-os/health
curl http://localhost:3001/api/life-os/assistant/status
curl http://localhost:3001/api/life-os/inbox/reprocess/status
curl http://localhost:3001/api/telegram/status
```

## Формат отчёта после работы
Кратко сообщить:
- что изменено;
- какие файлы затронуты;
- что проверено;
- что не удалось проверить;
- следующий логичный шаг.
