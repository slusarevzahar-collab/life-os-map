# Life OS API

The backend is an Express server that keeps the Notion token out of the browser.

## Environment variables

```bash
NOTION_TOKEN="..."
NOTION_TASKS_DB_ID="a6fbb0e23b2542908e374a1298cf3842"
NOTION_GOALS_DB_ID="a399c256328b4a5aa2f6e70402309b78"
NOTION_SESSIONS_DB_ID="704ef8ce0e144db3b1cf9871b5194fa7"
API_PORT="3001"
```

## Endpoints

### GET /api/life-os/health

Checks if the backend is alive and which Notion IDs are present.

Response example:

```json
{
  "ok": true,
  "service": "life-os-api",
  "port": 3001,
  "endpoints": [
    "GET /api/life-os/snapshot",
    "POST /api/life-os/sessions",
    "PATCH /api/life-os/tasks/:id",
    "GET /api/life-os/health"
  ],
  "notion": {
    "token": true,
    "tasks": true,
    "goals": true,
    "sessions": true
  }
}
```

### GET /api/life-os/snapshot

Builds the full workspace snapshot for the map.

The snapshot includes:

- meta
- currentFocus
- goals
- tasks
- sessions
- planning

The frontend uses this endpoint as the source for the canvas-like map.

### POST /api/life-os/sessions

Creates a new row in Work Sessions DB.

Request example:

```json
{
  "title": "Life OS Map coding session",
  "task": "Добавить drag/zoom",
  "project": "Life OS",
  "status": "Finished",
  "startedAt": "2026-06-01T14:00:00+03:00",
  "finishedAt": "2026-06-01T15:10:00+03:00",
  "durationMin": 70,
  "result": "Implemented first canvas viewport prototype",
  "nextStep": "Test drag and zoom on phone"
}
```

### PATCH /api/life-os/tasks/:id

Updates a Notion task page.

Request example:

```json
{
  "status": "In Progress",
  "progress": 60,
  "dueDate": "2026-06-05",
  "plannedDate": "2026-06-04",
  "nextAction": "Test on mobile",
  "timeDebt": 20,
  "rescheduleCount": 1
}
```

## Notes

- This is still an MVP layer.
- Endpoints are not authenticated beyond the Codespaces/dev environment.
- Do not expose the API publicly until authentication and token storage are handled properly.
- The first safe production path is likely a hosted backend with environment variables and a private Notion integration token.
# Work time tracker

The durable work timer extends the existing `LifeMap Sessions` Notion database. See [`WORK_TIME_TRACKER.md`](./WORK_TIME_TRACKER.md) for the schema, migration, recovery rules, and manual verification.

```text
POST /api/life-os/work-sessions/start
POST /api/life-os/work-sessions/pause
GET  /api/life-os/work-sessions/active
GET  /api/life-os/work-sessions/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Europe/Moscow
GET  /api/life-os/work-sessions/context?days=7&timezone=Europe/Moscow
```
