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

For Telegram integration on Vercel:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ALLOWED_USER_IDS
```

`TELEGRAM_WEBHOOK_URL` is optional on Vercel. When it is absent, the production Function derives the stable endpoint from `VERCEL_PROJECT_PRODUCTION_URL` and uses:

```text
https://<production-domain>/api/telegram/webhook
```

Do not copy `.env` into Git or Vercel build output. Add values in Vercel Project Settings → Environment Variables.

## Production Telegram flow

The Vercel webhook path is designed as durable-first intake:

```text
Telegram POST
→ verify production intake configuration
→ verify webhook secret
→ verify allowed Telegram user
→ save raw signal to Notion
→ send one acknowledgement: Доставлено в LM Inbox
→ return 202
→ continue document enrichment + AI analysis with Vercel waitUntil
→ update the same Notion signal record with classification, note, next action and extracted assets
```

Production intake fails closed. The Vercel route only accepts Telegram material when all security and durable-storage prerequisites are present: bot token, webhook secret, non-empty user allowlist, Notion token and LM Inbox database ID. The production self-sync also refuses to register a webhook until this secure intake configuration is ready.

The raw signal is written before Telegram receives a success response. If durable Notion storage is unavailable in the Vercel runtime, the route returns a non-2xx response so Telegram can retry instead of silently losing the update.

`api/index.js` also checks the current Telegram webhook on production API activity and synchronizes it to the stable production URL when needed. This avoids dependence on a running Codespace.

Codespaces no longer take ownership of the Telegram webhook during normal startup. Production Vercel remains the default webhook owner. A Codespaces runtime may take ownership only when `TELEGRAM_WEBHOOK_RUNTIME=codespaces` is set explicitly for a deliberate local webhook test.

The manual `/api/telegram/set-webhook` route remains available for administration but requires `X-LifeMap-Assistant-Secret`.

Background processing uses `waitUntil()`. Vercel documents that it extends the Function request lifetime for the supplied Promise, including work performed after the response is sent, subject to the Function timeout.

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
- Assistant status reports configured cloud routes after `GROQ_API_KEY` is present;
- `/api/telegram/status` reports the real webhook URL;
- `intake.secureReady` is `true`;
- `intake.durableFirst` is `true`;
- `intake.backgroundScheduler` is `vercel-waitUntil` on the production Vercel Function.

Final end-to-end acceptance test:

1. stop the Codespace;
2. open `/api/telegram/status` on the stable production domain and confirm `secureReady: true` plus the stable Vercel webhook URL;
3. send one unique Telegram message to the LM Inbox bot;
4. receive exactly one `Доставлено в LM Inbox` acknowledgement;
5. confirm a new signal appears in Notion/LM Inbox;
6. after background processing, confirm the same signal record receives AI analysis and extracted assets rather than a duplicate record.

## Important serverless limitation

The normal Telegram intake path is now durable-first and uses Vercel background scheduling, but the bulk LM Inbox reprocess job is different: its progress is still kept in process memory. Vercel Functions are not a durable worker runtime for long bulk jobs, so bulk reprocessing should not rely on one Function instance staying alive. That job should later move to a durable queue/workflow.
