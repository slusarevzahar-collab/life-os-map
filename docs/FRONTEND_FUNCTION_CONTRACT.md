# LifeMap Frontend Function Contract

Этот документ — обязательный regression checklist для любых изменений интерфейса LifeMap. Дизайн можно переписывать и упрощать, но перечисленные пользовательские функции должны оставаться доступными из UI и продолжать вызывать существующие backend/API сценарии.

## 1. Навигация и состояние карты

- Hash route сохраняет текущую ветку LifeMap.
- `Назад` возвращает на предыдущий уровень карты.
- `Главная` возвращает в root.
- Открытие планеты/ветки не ломает текущий focus и локальную очередь.
- Ошибки snapshot/backend доступны через error UI, а не только через console.
- Состояния `connected`, `loading`, `mock data`, `api offline` визуально различимы.

## 2. Mission Control

- Collapsed card открывает Mission Control.
- Текущий focus виден и кликабелен.
- Следующий шаг/следующий focus виден и кликабелен.
- Очередь раскрывается и скрывается.
- Элементы очереди открывают соответствующий объект на карте.
- `Выполнено` сохраняет Done через backend и Notion.
- После Done фокус/очередь пересчитываются, а результат не остаётся только в локальном UI.

## 3. Список задач

- Переключение `Активные` / `Сделано`.
- Раскрытие строки задачи.
- Inline rename.
- Сохранение заметки к задаче.
- Открытие Chat with AI с task context.
- Done.
- Restore.
- Context menu.
- Highlight + scroll-to-item при переходе из focus/queue.
- Периодический snapshot refresh не должен сбрасывать пользовательское раскрытие без необходимости.

## 4. AI Inbox

Главные вкладки должны оставаться доступны:

- Входящие;
- Промпты;
- Инструменты;
- Workflow;
- Идеи;
- Материалы;
- В задачи;
- Разобрано.

Обязательные функции:

- category subtabs внутри asset-вкладок;
- счётчики вкладок и категорий;
- сортировка по relevance score;
- relevance score и объяснение причины оценки;
- low-information signal должен получать relevance 0, если нет содержательной связи, ресурса или извлечённых assets;
- раскрытие строки без перехода на отдельную страницу;
- исходный текст/материал;
- AI comment;
- suggested use;
- attachment metadata;
- прямое скачивание файла/PDF, когда Telegram file id доступен;
- fallback на source link для старых файлов без file id;
- source link;
- prompt modal;
- copy prompt;
- open prompt resource;
- Chat with AI с signal context;
- Reviewed;
- Archived;
- Restore to Inbox;
- reprocess old/missing signals;
- progress state во время reprocess;
- waiting_rate_limit с автоматическим resume;
- периодическое обновление списка;
- новая запись появляется плавно без полного визуального дёргания списка;
- отдельный AI Inbox quota/capacity status.

## 5. LifeMap Assistant

- Global AI button открывает Assistant.
- Chat can open globally, from a task, or from an Inbox signal.
- Target context передаётся backend.
- Tabs: Context, Actions, Settings.
- Quick commands.
- Conversation history хранится локально отдельно по target key.
- Enter отправляет сообщение.
- Shift+Enter вставляет перенос строки.
- Clear chat.
- Show/hide context.
- Proposed actions отображаются отдельно от chat text.
- Executable actions требуют подтверждения.
- Write actions требуют assistant secret.
- Secret хранится только в sessionStorage текущей вкладки.
- Friendly errors для network/quota failures.
- Chat profile quota/capacity status.
- Assistant status обновляется после AI-запроса и периодически, пока окно открыто.

## 6. AI quota UI contract

LifeMap не должен показывать придуманную «общую квоту».

Показываем только измеримые данные:

- remaining requests / request limit для активного route, когда provider вернул headers;
- remaining tokens / token limit для активного route, когда provider вернул headers;
- количество configured routes;
- количество currently available routes;
- cooldown/wait state;
- last active model/route.

AI Inbox и Assistant имеют разные routing profiles, поэтому их capacity status показывается отдельно.

До первого provider response UI должен показывать `нет данных`, а не 100%.

## 7. Telegram intake

- Telegram webhook принимает разрешённого пользователя.
- Документ metadata сохраняются вместе с signal.
- AI analysis failure не должен терять входящий signal.
- Notion failure должен оставить local fallback.
- Успешный приём подтверждается сообщением `Принято в AIinbox`.

## 8. One-port production mode

Обычный Codespaces launch:

```bash
npm run app
```

Обязательный production path:

- build Vite UI;
- Express serves `dist`;
- UI + API + Telegram webhook работают на port 3001;
- port 3000 не нужен для обычного рабочего режима.

Port 3000 разрешён только как отдельный Vite development mode для hot reload.

## 9. Design regression rule

Перед любым крупным redesign:

1. Сверить затрагиваемые компоненты с этим документом.
2. Не удалять handlers, API calls, custom events, storage keys и protected-action flows ради визуального упрощения.
3. После изменений пройти UI checklist по затронутому разделу.
4. Запустить:

```bash
npm run test:ai
npm run build
```

5. Для backend/UI integration проверить:

```bash
curl http://localhost:3001/api/life-os/health
curl http://localhost:3001/api/life-os/assistant/status
curl http://localhost:3001/api/life-os/inbox/reprocess/status
```

6. Изменение считается завершённым только когда функция доступна из интерфейса, а не просто существует в коде.
