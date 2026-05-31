# Life OS Map

Интерактивный навигатор проектов, задач, целей и рабочих сессий Захара.

## Что это

Life OS Map — визуальная карта в космическом стиле: центральная система, планеты-задачи, цели, рабочие сессии, AI Copilot и будущая синхронизация с Notion.

## Текущий статус

- React/Vite-проект создан.
- Базовый интерфейс карты перенесён из ChatGPT Canvas в GitHub.
- Добавлен mock Notion Adapter.
- Будущий endpoint: `/api/life-os/snapshot`.

## Будущая архитектура

```text
Notion DB → backend/API → notionAdapter → Life OS Map
```

Notion token нельзя хранить в браузере. Поэтому для настоящей синхронизации нужен backend route, который безопасно читает Notion и отдаёт карте JSON.

## Как запустить

```bash
npm install
npm run dev
```

## Следующие шаги

1. Проверить запуск проекта.
2. Подключить preview через Codespaces / Vercel.
3. Создать backend route `/api/life-os/snapshot`.
4. Подключить Notion API.
5. Заменить mock data на живые данные.
