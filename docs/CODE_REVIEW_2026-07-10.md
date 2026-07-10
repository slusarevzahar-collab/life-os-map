# LifeMap code review — 2026-07-10

## Scope

Full review of the current LifeMap path:

`Notion core databases → notionAdapter → live snapshot → action map model → UI → LM Assistant / LM Inbox → write-back`

Core databases in scope:

1. LifeMap Tasks
2. LifeMap Goals
3. LifeMap Sessions
4. LifeMap Projects & Areas
5. LifeMap Dreams
6. LM Inbox

The review also covered Telegram durable intake, LM Inbox reprocessing state, mutation authorization, regression tests and production health checks.

## Critical / high findings fixed

### 1. Sessions were loaded but effectively invisible

**Problem:** `snapshot.sessions` existed but was not represented in the action map. Session results and time data could be stored in Notion without becoming visible in LifeMap.

**Fix:** sessions now have their own leaf model and `Сессии` sphere. The UI exposes project, linked task, energy, duration, timestamps, result and next step. Session history is also summarized back onto linked tasks.

### 2. Session → Task relation was read and written with the wrong Notion property type

**Problem:** the Notion `Task` property in LifeMap Sessions is a relation, but the old mapper treated it like rich text and the old writer attempted to write text.

**Fix:** relation IDs are now read with relation mapping, resolved to task titles/codes in the snapshot, and written as proper relation objects. Session status and project names are normalized to valid database options.

### 3. Goal context was incomplete

**Problem:** `Why` and `Success Criteria` existed in LifeMap Goals but were omitted from the snapshot and therefore unavailable to LifeMap and LM Assistant.

**Fix:** both fields are now mapped, shown in goal details and included in bounded LM Assistant context.

### 4. Task metadata and real progress were discarded

**Problem:** Tasks contained Type, Energy, planning/time fields and partial Progress, but the UI reduced leaf progress to 0 or 100 and omitted Type/Energy from the model.

**Fix:** task mapper now includes Type and Energy; partial Progress is preserved; task details include session count, accumulated session time and the latest session result/next step.

### 5. Linked Dreams could disappear

**Problem:** Dreams with `Linked project` were removed from the Life sphere but not attached to their project.

**Fix:** visible linked Dreams are attached to the matching project. `Hidden until later` Dreams are preserved under `Идеи / потом` instead of disappearing.

### 6. Project Focus level was ignored

**Problem:** Primary / Secondary / Background was read but not used for map ordering.

**Fix:** declared projects are now ordered by Focus level before task-count tie breaking. Focus metadata is visible in project details.

### 7. LM Inbox “missing analysis” semantics were inconsistent

**Problem:** stale policy version and truly missing first analysis had been conflated in parts of the reprocessing flow, creating false reprocessing counts.

**Fix:** UI and runtime now use the explicit `needsReprocessing` state for the temporary reprocessing control. Existing analyzed records are not queued merely because policy version changed.

### 8. LM Inbox snapshot lost structured fields

**Problem:** the general Notion snapshot mapper omitted extracted assets, attachment metadata, original text and AI processing version.

**Fix:** structured LM Inbox fields are now parsed into the snapshot, so map context and LM Assistant no longer see a reduced signal shape.

### 9. Database mutations were not strongly authenticated

**Problem:** same-origin requests were accepted for write routes. Because the deployed app is reachable publicly, same-origin is CSRF protection, not user authentication.

**Fix:** all database mutations now require the LifeMap write secret. The frontend stores it only for the browser session and prompts for it on the first protected write, then retries the action.

### 10. Build gate missed a removed frontend export

**Problem:** the action-map refactor removed a helper still imported by ContextMenu. This caused a Vercel build failure.

**Fix:** dependency removed from ContextMenu and the build restored. CI now runs `AI policy tests + data model tests + frontend build` as one gate.

## Data visibility after review

### LifeMap Tasks

Now represented:
- title and stable code;
- project and goal;
- status, type, energy;
- real progress;
- priority and planning dates;
- timing fields;
- next action and session notes;
- linked goal IDs;
- session count, accumulated session time, latest result and next step.

### LifeMap Goals

Now represented:
- area;
- status and horizon;
- progress and target date;
- Why;
- Success Criteria;
- next action;
- linked tasks.

Goals are no longer dropped merely because they currently have no task.

### LifeMap Sessions

Now represented:
- relation to Task;
- task title and code resolved from the relation;
- project;
- status and energy;
- start/finish time;
- duration;
- result;
- next step;
- dedicated map sphere plus task-level aggregates.

### LifeMap Projects & Areas

Now represented:
- type and status;
- focus level;
- goal;
- current state;
- next action;
- Why it matters;
- focus-aware ordering.

### LifeMap Dreams

Now represented:
- type and status;
- visibility;
- life sphere;
- linked project;
- Why I want it;
- next gentle step;
- target date;
- deterministic placement into project, Life, or later/backlog branch.

### LM Inbox

Now represented in the shared snapshot:
- type/category;
- decision/status/priority;
- related projects;
- source and captured date;
- summary/original text;
- assistant note;
- possible use and next action;
- extracted assets;
- attachment metadata;
- AI processing version and missing-analysis state.

The map remains intentionally bounded for signal visualization, while the dedicated LM Inbox view is the full working interface.

## New regression coverage

The data model regression test verifies:

- Sessions are visible;
- goals without tasks remain visible;
- partial task progress survives the pipeline;
- session aggregates reach the task model;
- linked Dreams appear under projects;
- hidden Dreams remain recoverable in later/backlog;
- Primary projects sort ahead of Secondary projects;
- LM Assistant receives Why, Success Criteria, Sessions, Projects & Areas, Dreams and data-quality context.

The production smoke workflow now verifies:

- Telegram intake health;
- all six core Notion databases report connected;
- snapshot version is the reviewed 0.9 line;
- LM Inbox production health;
- LifeMap data-health endpoint output;
- AI policy tests, data-model regressions and frontend build.

## Deliberate architecture boundary

Not every Notion page or knowledge database should become a map planet.

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

The operational core drives the visual map and live work state. The knowledge layer should be retrieved selectively by LM Assistant and should not be duplicated into the map merely to make it “connected”.

## Remaining security decision requiring product-level choice

The code review hardened all **writes**. The deployed app and read endpoints still need one product decision: either protect the whole deployment at the platform edge, or add an explicit LifeMap unlock/auth flow for private read access. This is intentionally not guessed in code because it changes how the owner opens and shares the app.
