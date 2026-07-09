# LifeMap

LifeMap — карта жизни и проектов с Notion как source of truth, LM Inbox для входящих сигналов и LM Assistant для работы с контекстом карты.

Канонические пользовательские названия:

```text
LifeMap
LM Assistant
LM Inbox
```

`Life OS`, `LifeMap Assistant` и `AI Inbox` — legacy aliases. Они могут встречаться в старых данных и технических путях API, но не должны использоваться в новом пользовательском интерфейсе и новых AI-ответах.

## Архитектура

```text
Telegram → LM Inbox → Notion → LifeMap UI
                         ↓
                    LM Assistant
                         ↓
              Groq pool → Gemini fallback
```

Основной рабочий режим Codespaces — один порт:

```text
3001 = LifeMap UI + API + Telegram webhook
```

Порт `3000` больше не используется проектом.

## LM Assistant

LM Assistant получает минимальный безопасный контекст:

- текущий focus;
- релевантные задачи;
- ограниченный список целей;
- ограниченный список сигналов;
- выбранный target object.

AI не получает полный snapshot Notion. Перед отправкой контекст сокращается и проходит secret/PII redaction.

Канонический формат ответа:

```json
{
  "reply": "...",
  "summary": "...",
  "proposedActions": [],
  "warnings": [],
  "nextStep": "..."
}
```

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

## LM Inbox

LM Inbox — часть LifeMap, а не отдельный проект.

Поток:

```text
Telegram receive
→ security preparation
→ AI analysis
→ server-side normalization
→ Notion write or local fallback
→ short Telegram acknowledgement
→ LifeMap UI
```

LM Inbox может извлекать несколько assets из одного сигнала:

```text
Prompt
Tool
Workflow
Task
Research
Idea
Reference
News
Instruction
File
Other
```

Интерфейс включает:

- Входящие;
- Промпты;
- Инструменты;
- Workflow;
- Идеи;
- Материалы;
- В задачи;
- Разобрано.

На корневой орбите LM Inbox не показывается как отдельная планета: он открывается отдельной кнопкой рядом с AI launcher.

## AI providers

Router поддерживает разные профили для массовой обработки LM Inbox и LM Assistant chat.

Основной бесплатный provider сейчас — Groq pool. Gemini предусмотрен как независимый fallback после подключения ключа.

В status UI отдельно учитывается operational capacity для:

- LM Assistant profile;
- LM Inbox profile.

LifeMap не придумывает общую квоту. Точные remaining/limit значения показываются только после provider response headers; до этого UI показывает availability маршрутов без ложного процента.

## Запуск в Codespaces

Обычный рабочий режим:

```bash
git pull
npm run app
```

`npm run app`:

1. находит и останавливает stale listener на порту `3001`;
2. собирает production UI;
3. запускает единый Express server;
4. отдаёт UI и API на `3001`;
5. публикует Codespaces port и может синхронизировать Telegram webhook для Codespaces runtime.

После запуска в терминале должна появиться строка:

```text
LifeMap public UI: https://<codespace>-3001.app.github.dev/
```

Для обычной разработки в Codespaces открывать нужно именно этот URL.

`npm run dev` намеренно запускает тот же one-port mode, чтобы случайно не вернуть старый `3000`.

## Vercel production

Vercel получает изменения из `main` через Git integration и автоматически создаёт production deployment.

Важное различие:

- Codespaces URL временный и зависит от активного Codespace;
- стабильный Vercel production domain предназначен для постоянно доступного UI/API;
- Telegram production webhook должен указывать на стабильный Vercel endpoint `/api/telegram/webhook`, а не на Codespaces URL.

Environment variables для Vercel задаются в настройках проекта Vercel. Локальный `.env` из Codespaces туда не переносится автоматически.

## Если 3001 показывает 404

Основная диагностика:

```bash
curl -i http://localhost:3001/
curl http://localhost:3001/api/life-os/health
```

Затем:

```bash
npm run app
```

Startup script сам убирает stale process на `3001`, пересобирает UI и запускает актуальный server.

Если Codespaces Ports UI всё ещё показывает старый порт `3000` или старую подпись, сделай Rebuild Container: изменения `devcontainer.json` применяются к уже существующему Codespace только после rebuild.

## Проверка

После запуска:

```bash
curl -i http://localhost:3001/
curl http://localhost:3001/api/life-os/assistant/status
curl http://localhost:3001/api/telegram/status
curl http://localhost:3001/api/life-os/health
```

Legacy API paths `/api/life-os/*` пока сохраняются ради обратной совместимости. Переименование пользовательских терминов не должно ломать существующие маршруты.

Если AI provider не настроен, status покажет `configured: false`, но LifeMap и сохранение LM Inbox продолжат работать.

## Обновление кода

```bash
git pull
npm run app
```

Для изменений backend/frontend используем один и тот же restart path, чтобы не оставлять старые процессы и старый UI bundle.

## Документы

- `docs/NAVIGATOR_MASTER_PLAN.md` — архитектурный план.
- `docs/LIFEMAP_PROGRESS_LOGIC.md` — логика процентов.
- `docs/LIFEMAP_AI_POLICY.md` — правила LM Assistant, LM Inbox, privacy, actions и смены моделей.
- `docs/FRONTEND_FUNCTION_CONTRACT.md` — обязательный regression contract для redesign iterations.
- `docs/VERCEL_DEPLOYMENT.md` — production deploy и environment configuration.

## Ближайший roadmap

1. Настроить Telegram webhook на стабильный Vercel production endpoint и проверить end-to-end доставку при выключенном Codespace.
2. Проверить LM Assistant и LM Inbox визуально и функционально на production UI.
3. Синхронизировать историю LM Assistant между устройствами через backend storage.
4. Подключить Gemini как независимый cloud fallback.
5. Продолжить protected local Gemma fallback через LM Studio.
6. Добавить voice/image processing отдельным privacy-safe слоем.

## Важная логика продукта

LifeMap не должен превращаться в обычный список задач. Главная цепочка:

```text
куда я иду → какой проект активен → какая задача сейчас → что дальше → что уже сделано
```
