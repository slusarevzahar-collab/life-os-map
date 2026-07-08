# LifeMap

LifeMap — карта жизни и проектов с Notion как source of truth, AI Inbox для входящих сигналов и LifeMap Assistant для работы с контекстом карты.

## Архитектура

```text
Telegram → AI Inbox → Notion → LifeMap UI
                         ↓
                  LifeMap Assistant
                         ↓
              Groq pool → Gemini fallback
```

Основной рабочий режим — один порт:

```text
3001 = LifeMap UI + API + Telegram webhook
```

Порт `3000` больше не используется проектом.

## AI Assistant

LifeMap Assistant получает минимальный безопасный контекст:

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

## AI Inbox

AI Inbox — часть LifeMap, а не отдельный проект.

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

AI Inbox может извлекать несколько assets из одного сигнала:

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

## AI providers

Router поддерживает разные профили для массовой обработки AI Inbox и Assistant chat.

Основной бесплатный provider сейчас — Groq pool. Gemini предусмотрен как независимый fallback после подключения ключа.

В status UI отдельно показывается operational capacity для:

- Assistant profile;
- AI Inbox profile.

LifeMap не придумывает общую квоту. Точные remaining/limit значения показываются только после provider response headers; до этого UI показывает availability маршрутов без ложного процента.

## Запуск в Codespaces

Обычный рабочий режим:

```bash
git pull
npm run app
```

`npm run app` теперь:

1. находит и останавливает stale listener на порту `3001`;
2. собирает production UI;
3. запускает единый Express server;
4. отдаёт UI и API на `3001`;
5. публикует Codespaces port и синхронизирует Telegram webhook.

После запуска в терминале должна появиться строка:

```text
LifeMap public UI: https://<codespace>-3001.app.github.dev/
```

Открывать нужно именно эту ссылку.

`npm run dev` намеренно запускает тот же one-port mode, чтобы случайно не вернуть старый `3000`.

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

Если AI provider не настроен, status покажет `configured: false`, но LifeMap и сохранение AI Inbox продолжат работать.

## Обновление кода

```bash
git pull
npm run app
```

Для изменений backend/frontend используем один и тот же restart path, чтобы не оставлять старые процессы и старый UI bundle.

## Документы

- `docs/NAVIGATOR_MASTER_PLAN.md` — архитектурный план.
- `docs/LIFEMAP_PROGRESS_LOGIC.md` — логика процентов.
- `docs/LIFEMAP_AI_POLICY.md` — правила Assistant, AI Inbox, privacy, actions и смены моделей.
- `docs/FRONTEND_FUNCTION_CONTRACT.md` — обязательный regression contract для redesign iterations.

## Ближайший roadmap

1. Проверить текущий single-port startup после Codespaces pull/rebuild.
2. Подключить Gemini как независимый cloud fallback.
3. Продолжить protected local Gemma fallback через LM Studio.
4. Проверить Telegram → AI analysis → Notion → LifeMap UI на новых типах сигналов.
5. Добавить voice/image processing отдельным privacy-safe слоем.
6. Продолжить premium visual consistency pass.

## Важная логика продукта

LifeMap не должен превращаться в обычный список задач. Главная цепочка:

```text
куда я иду → какой проект активен → какая задача сейчас → что дальше → что уже сделано
```
