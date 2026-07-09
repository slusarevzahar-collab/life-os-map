# LM Inbox Production Acceptance

Acceptance test state for Telegram → Vercel → Notion → LM Inbox.

- Environment variables were added to Vercel Production by the user.
- A fresh production deployment is required so the new environment is loaded.
- After deployment, verify `/api/telegram/status` before sending the benchmark message.
- Benchmark case: `LMQ-01-20260709` from `docs/LM_INBOX_QUALITY_CHALLENGE.md`.

Do not mark this acceptance complete until production reports secure intake ready and the end-to-end Telegram test creates one durable LM Inbox record with AI enrichment on that same record.
