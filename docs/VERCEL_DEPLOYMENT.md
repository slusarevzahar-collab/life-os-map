# LifeMap on Vercel

LifeMap deploys as:

```text
Vite UI        → dist/
/api/*         → Vercel Function api/index.js
Express routes → createLifeMapApp().app
```

`vercel.json` rewrites `/api/:path*` to the single serverless entrypoint and restores the original Express API path inside `api/index.js`.

## Required environment variables

For real Notion data:

```text
NOTION_TOKEN
NOTION_TASKS_DB_ID
NOTION_GOALS_DB_ID
NOTION_SESSIONS_DB_ID
NOTION_PROJECTS_DB_ID
NOTION_DREAMS_DB_ID
NOTION_SIGNALS_DB_ID
```

For cloud AI:

```text
GROQ_API_KEY
```

Optional provider/model variables remain supported by the router.

For protected write actions:

```text
LIFEMAP_ASSISTANT_API_SECRET
```

For Telegram integration when intentionally moving webhook processing to Vercel:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ALLOWED_USER_IDS
TELEGRAM_WEBHOOK_URL
```

Do not copy `.env` into Git or Vercel build output. Add values in Vercel Project Settings → Environment Variables.

## Verification after deployment

Open these endpoints on the deployed domain:

```text
/api/life-os/health
/api/life-os/snapshot
/api/life-os/assistant/status
/api/telegram/status
```

Expected minimum:

- `/api/life-os/health` returns JSON with `ok: true`;
- health shows which Notion databases and AI providers are configured;
- snapshot stops showing API offline;
- Assistant status reports configured cloud routes after `GROQ_API_KEY` is present.

## Important serverless limitation

The current long-running AI Inbox reprocess job keeps progress in process memory. Vercel Functions are not a durable worker runtime, so bulk reprocessing should not rely on one function instance staying alive. Normal snapshot reads and Assistant chat requests are suitable for the deployed Function. Bulk reprocess and durable background work should later move to a durable queue/workflow or remain in the development worker until that migration is complete.
