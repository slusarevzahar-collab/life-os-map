# LifeMap Frontend Function Contract

Этот документ — обязательный regression checklist для любых изменений интерфейса LifeMap. Дизайн можно переписывать и упрощать, но перечисленные пользовательские функции должны оставаться доступными из UI и продолжать вызывать существующие backend/API сценарии.

## 1. Навигация и состояние карты

- Hash route сохраняет текущую ветку LifeMap.
- `Назад` возвращает на предыдущий уровень карты.
- `Главная` возвращает в root.
- Открытие планеты/ветки не ломает текущий focus и локальную очередь.
- Ошибки snapshot/backend доступны через error UI, а не только через console.
- Состояния `connected`, `loading`, `mock data`, `api offline` визуально различимы.
- Названия локально переименованных статических планет не должны самопроизвольно сбрасываться на том же origin.
- Рабочий Codespaces origin фиксирован на едином порту 3001; нельзя возвращать параллельный UI origin на 3000, потому что localStorage aliases и другая локальная UI state привязаны к origin.

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

Assistant — слой решений и исполнения, а не универсальный чат и не дополнительный экран со справочной информацией.

Обязательные функции:

- Global AI button открывает Assistant.
- Chat can open globally, from a task, or from an Inbox signal.
- Target context передаётся backend.
- Conversation history хранится локально отдельно по target key.
- Enter отправляет сообщение.
- Shift+Enter вставляет перенос строки.
- Clear chat.
- Proposed actions отображаются непосредственно под релевантным AI-ответом.
- Executable actions требуют подтверждения.
- Write actions требуют assistant secret.
- Secret хранится только в sessionStorage текущей вкладки и доступен через компактный блок `Изменения`.
- Friendly errors для network/quota failures.
- Chat profile quota/capacity status.
- Assistant status обновляется после AI-запроса и периодически, пока окно открыто.
- Во время ожидания AI показывается короткий индикатор `печатаю` с анимированным троеточием.
- Global decision workflows: главное узкое место, рабочая сессия, AI Inbox → текущая работа, очистка очереди.
- Task workflows: разблокировка задачи, план короткой сессии, проверка готовности, поиск прямой помощи в Inbox.
- Signal workflows: применить сейчас/позже/архивировать/задача, извлечь ценное, сравнить с текущей работой, принять решение по сигналу.

Удалённые как лишние элементы не должны возвращаться без новой самостоятельной функции:

- постоянные вкладки `Контекст / Действия / Настройки`;
- постоянная правая context panel;
- общие быстрые команды вроде `Что делать дальше?`, которые провоцируют пересказ карты вместо решения.

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
- Один Telegram update должен обрабатываться не более одного раза в рамках активного server process.
- Повторная доставка того же update во время обработки или в dedupe TTL не запускает повторный AI-анализ и не создаёт второй acknowledgement.
- Webhook быстро отвечает Telegram до длинного AI/Notion pipeline, чтобы provider latency не провоцировала повторную доставку одного update.
- Документ metadata сохраняются вместе с signal.
- AI analysis failure не должен терять входящий signal при обычной обработке ошибки.
- Notion failure должен оставить local fallback.
- После успешной обработки отправляется ровно одно подтверждение `Доставлено в AI-INBOX`.

## 8. Responsive UI contract

- Основной интерфейс проверяется на desktop, типичном 13-inch laptop viewport и mobile/Fold viewport.
- Assistant не должен требовать горизонтальной прокрутки.
- На laptop viewport sidebar Assistant остаётся компактным, а чат получает приоритет по ширине.
- На mobile/Fold Assistant может скрывать sidebar, но глобальный чат, target chat, inline actions, Enter/Shift+Enter, quota/error states и protected action flow сохраняются.
- AI Inbox на mobile/Fold использует рабочую панель почти на весь экран, горизонтальную ленту вкладок и компактные строки сигналов.
- Планеты root map остаются читаемого размера и не превращаются в мелкие badges из-за короткого названия.
- Scrollbars используют визуальный язык LifeMap и не должны выглядеть как широкие browser-default полосы.
- На узких экранах layout может меняться, но функции из этого контракта не исчезают.

## 9. One-port Codespaces mode и deployed mode

Обычный Codespaces launch:

```bash
npm run app
```

Codespaces path:

- build Vite UI;
- Express serves `dist`;
- UI + API + Telegram webhook работают на port 3001;
- port 3000 не используется проектом;
- `npm run dev` не должен случайно поднимать второй UI origin.

Vercel deployed path:

- Vite UI собирается в `dist`;
- `/api/*` проходит через Vercel Function entrypoint;
- deployed UI не должен зависеть от Codespaces URL;
- environment secrets задаются в Vercel Project Settings и не попадают в Git.

## 10. Design regression rule

Перед любым крупным redesign:

1. Сверить затрагиваемые компоненты с этим документом.
2. Не удалять handlers, API calls, custom events, storage keys и protected-action flows ради визуального упрощения.
3. После изменений пройти UI checklist по затронутому разделу на desktop, laptop и mobile/Fold viewport.
4. Не добавлять постоянные панели, вкладки и кнопки без ясной пользовательской функции.
5. Запустить:

```bash
npm run test:ai
npm run build
```

6. Для backend/UI integration проверить:

```bash
curl http://localhost:3001/api/life-os/health
curl http://localhost:3001/api/life-os/assistant/status
curl http://localhost:3001/api/life-os/inbox/reprocess/status
curl http://localhost:3001/api/telegram/status
```

7. Для Vercel deployment проверить те же GET endpoints на deployed domain.
8. Изменение считается завершённым только когда функция доступна из интерфейса, а не просто существует в коде.
