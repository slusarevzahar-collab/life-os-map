# LifeMap work time tracker

## Architecture and storage choice

LifeMap already has a React/Vite client, an Express API used locally and through Vercel, protected read/write routes, and a Notion `LifeMap Sessions` database exposed through `NOTION_SESSIONS_DB_ID`. The tracker extends that existing path. It does not call Notion from the browser and does not introduce a second database.

Notion was selected because it is already the durable operational store for LifeMap sessions and is already included in the snapshot consumed by the map and LM Assistant. Browser storage is used only to notify another tab that server state changed.

## Data model

The existing fields remain compatible: `Session`, `Task`, `Scope`, `Project`, `Status`, `Started At`, `Finished At`, `Duration Min`, `Result`, and `Next Step`.

The migration adds:

- `Session Number` (unique ID) — stable sequential number for longitudinal statistics;

- `Duration Seconds` (number) — precise server-calculated duration;
- `Date Key` (text) — local date at start (`YYYY-MM-DD`);
- `Timezone` (text) — IANA timezone;
- `Source` (select) — `lifemap`;
- `User ID`, `Project ID`, `Task ID` (text) — optional extension points.

Notion supplies the record ID and created/last-edited timestamps. `Status=Active` identifies the one open session. Existing Active/Finished views serve the same role as status indexes; Notion does not expose user-managed database indexes.

Each `Date Key` has exactly one visible journal record. Repeated start, pause, stop, and resume actions update that daily record. `Duration Seconds` is the accumulated worked time for the day, while `Started At Exact` identifies the currently running segment and `Initial Seconds` keeps the visible timer continuous across pauses or midnight.

## API

All routes are protected by the existing LifeMap access/write secret.

`POST /api/life-os/work-sessions/rollover` closes the previous local day at midnight and activates the next daily record without resetting the visible timer.

- `POST /api/life-os/work-sessions/start` — idempotently create or return the active session.
- `POST /api/life-os/work-sessions/pause` — finish the active session using server time.
- `GET /api/life-os/work-sessions/active` — restore the active session.
- `GET /api/life-os/work-sessions/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Europe/Moscow` — totals and daily breakdown, including active time.
- `GET /api/life-os/work-sessions/context?days=7&timezone=Europe/Moscow` — compact context for agents.

The ordinary `/api/life-os/snapshot` also includes `workTime`, and `compactForAssistant()` passes only safe timer totals and active-session identifiers to LM Assistant.

## Reliability

- Starting again on the same local date reuses the numbered daily record and adds only the new worked segment to its duration.
- At local midnight the previous record is closed at the exact boundary, the next numbered record is created, and the UI timer continues with the accumulated cross-day total.

- Elapsed time is always `now - startedAt`; `setInterval` only redraws the UI.
- Refresh, browser restart, device sleep, and suspended JavaScript recover from the saved UTC start time.
- Start and pause are serialized inside an API instance. Start re-queries after creation and reconciles duplicate Active records, covering retries and near-simultaneous tabs.
- `BroadcastChannel` updates other tabs immediately; a storage event is the fallback.
- A failed pause keeps the timer active in the UI so unconfirmed time is not silently discarded.
- Duration is never accepted from the tracker client. The server calculates seconds and mirrors fractional minutes for existing analytics.
- Daily aggregation splits intervals at actual local midnight boundaries, including DST changes.

## Migration

Set `NOTION_TOKEN` and `NOTION_SESSIONS_DB_ID`, then run:

```bash
npm run migrate:work-sessions
```

The runtime filters writes against the current Notion schema, so old fields remain usable during rollout. Run the migration before relying on precise seconds, timezone metadata, or optional IDs.

## Manual verification

1. Run `npm ci`, `npm run migrate:work-sessions`, then `npm run app`.
2. Open LifeMap and enter the existing access key if prompted.
3. Press **Старт** in the lower-left widget.
4. Reload the page and confirm that the active time is restored.
5. Open a second tab and confirm that both tabs show the same active session.
6. Press **Пауза** and confirm that the counter stops and today's total includes the session.
7. Check the `LifeMap Sessions` record: Finished status, UTC timestamps, server duration, local date key, timezone, and source.
8. Query the stats and context routes and verify the same total.

## Tests

`npm test` covers duration/formatting, recovery from `startedAt`, completed plus active totals, midnight and timezone/DST splitting, negative-duration protection, idempotent start/pause, restoration, stats, and agent context.
