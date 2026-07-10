# LifeMap code review — 2026-07-10

## Scope

Full review of the production path:

`Notion core databases → notionAdapter → live snapshot → action map → UI → LM Assistant / LM Inbox → write-back`

Core operational databases:

1. LifeMap Tasks
2. LifeMap Goals
3. LifeMap Sessions
4. LifeMap Projects & Areas
5. LifeMap Dreams
6. LM Inbox

The review also covered Telegram durable intake, deduplication, LM Inbox reprocessing semantics, mutation/read authorization, regression coverage and Vercel production builds.

## Review result

The database and code review is closed. The remaining ambiguity around intentionally unlinked historical sessions was resolved explicitly instead of hiding those records or forcing false Task relations.

### Tasks

The shared model preserves:

- title and stable task code;
- project and goal context;
- status, type and energy;
- real partial progress;
- priority and planning dates;
- timing fields;
- next action and session notes;
- Goal relations;
- session count, accumulated time, latest result and latest next step.

Notion pagination is now complete across all snapshot databases through `has_more` / `next_cursor`; the old first-page limitation is no longer present.

### Goals

LifeMap now preserves and exposes:

- Area;
- Status and Horizon;
- Progress and Target Date;
- Why;
- Success Criteria;
- Next Action;
- linked Tasks.

A goal is not removed merely because it currently has no task.

### Sessions

The Task property is handled as a real Notion relation for both reads and writes. Sessions expose task title/code, project, status, energy, timestamps, duration, result and next step.

The database now has an explicit `Scope` field:

- `Task` — session linked to a concrete Task;
- `Project` — valid project-level session without a Task relation;
- `Historical` — historical session intentionally preserved without an artificial Task relation.

The three reviewed legacy sessions were marked `Historical`. Data quality now separates intentional standalone sessions from genuinely unclassified unlinked sessions. New API-created sessions receive `Task` scope when a Task relation exists and `Project` scope otherwise.

### Projects & Areas

The snapshot and map use type, status, Focus level, goal, current state, next action and Why it matters. Primary / Secondary / Background now contribute to deterministic project ordering.

### Dreams

Dreams preserve type, status, visibility, life sphere, linked project, Why, next gentle step and target date. Linked visible Dreams are attached to their project; hidden-later Dreams remain recoverable in the later/backlog branch.

### LM Inbox

The shared snapshot preserves signal type/category, decision/status/priority, related projects, source/date, summary, original text, assistant note, possible use, next action, extracted assets, attachment metadata and AI processing state.

Review fixes include:

- true missing-analysis semantics separated from stale policy version;
- exact duplicate suppression in the client;
- persistent source-URL deduplication for Telegram intake;
- media-group deduplication retained;
- race-safe in-flight acceptance;
- recoverable failure state when AI analysis fails after durable Notion persistence;
- obvious historical duplicate records archived during the data cleanup.

The dedicated LM Inbox remains the full signal workspace; the visual map is intentionally bounded.

## Canonical naming

Canonical names are:

- `LifeMap`
- `LM Assistant`
- `LM Inbox`

Runtime reads retain compatibility with historical aliases such as `Life OS` and `AI Inbox`, but new session write-back now stores canonical project names directly. Active database records reviewed during this pass were migrated to canonical Project/Goal values where appropriate. Historical prose and task titles that document the old architecture are preserved rather than rewritten destructively.

## Security closure

The earlier read-access product decision is resolved.

- Private snapshot, LM Inbox data, reprocess status, attachments and LM Assistant access require LifeMap access.
- The first successful unlock with the existing access secret issues an HttpOnly, SameSite=Strict session cookie.
- Database writes still require the explicit LifeMap secret header.
- The browser keeps the access secret only in session storage for the active browser session.
- Public health output is sanitized and does not expose private Notion error details or database identifiers through failure text.

## Regression coverage

The regression model now covers:

- Sessions visible in the map;
- goals without Tasks retained;
- partial Task progress preserved;
- session aggregates reaching Tasks;
- linked Dreams attached to Projects;
- hidden Dreams recoverable in later/backlog;
- Focus-level project ordering;
- LM Assistant receiving Goal rationale, success criteria, Sessions, Projects & Areas, Dreams and data-quality context;
- `Scope` preserved in bounded LM Assistant context;
- intentional standalone session count separated from broken unlinked-session count;
- exact LM Inbox duplicate suppression preferring the live record over an archived copy.

The production build gate remains the final deployment check for frontend/server compatibility.

## Architecture boundary

Not every Notion page should become a map planet.

Operational core:

- Tasks
- Goals
- Sessions
- Projects & Areas
- Dreams
- LM Inbox

Knowledge layer:

- AI Operating Policy
- LifeMap AI Context
- Decisions & Architecture Log
- Prompt Library
- research notes and handoff journals

The operational core drives the live map and work state. Knowledge sources should be retrieved selectively by LM Assistant instead of being duplicated into the map merely to appear connected.
