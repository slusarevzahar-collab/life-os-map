# LifeMap AI Inbox v2 — asset-centric architecture

## Product problem

The first Inbox UI treated the same source post as the item in every thematic tab. A post containing any tool could appear both in `Incoming` and `Tools`, and the same source could appear again in `Prompts` or `Workflow`. This duplicates posts instead of structuring knowledge.

A second problem appeared during migration: bulk reprocessing ran dozens of provider calls inside one synchronous HTTP request. Temporary rate limits caused partial runs and forced the user to click reprocess repeatedly.

## Core model

A **Signal** is the incoming source container. An **Asset** is a useful concrete object extracted from that source.

One signal may produce zero, one, or many assets.

Examples:

- one post listing 5 tools → 5 `Tool` assets;
- one post containing a design prompt and a productivity prompt → 2 `Prompt` assets in different categories;
- one post describing a repeatable process and mentioning 2 tools → 1 `Workflow` asset + 2 `Tool` assets;
- one product update describing a reusable process → `News` + `Workflow`;
- one useful attached PDF → `File`, optionally with additional `Research`, `Reference`, or `Instruction` assets when grounded content is available.

## Asset contract

```json
{
  "kind": "Prompt|Tool|Workflow|Task|Research|Idea|Reference|News|Instruction|File|Other",
  "category": "Дизайн",
  "title": "Concrete asset title",
  "description": "What it is and what it is for, grounded in source text",
  "content": "Exact prompt or instruction text when explicitly present",
  "url": "Direct resource URL when available",
  "suggestedUse": "Short practical suggestion for Zakhar or a current project"
}
```

Rules:

- never invent `content`;
- do not merge several tools into one tool card;
- do not merge prompts for different tasks into one prompt card;
- `category` is a short human label suitable for a dynamic UI subtab;
- `suggestedUse` is a recommendation, not an automatically created task;
- dedupe assets inside a signal;
- useful information must map to the most precise kind or `Other`;
- an empty test message or noise may legitimately produce zero assets.

## Main tabs

### Incoming

Signal-centric. Shows source signals waiting for review.

### Prompts

Asset-centric. Shows only `kind=Prompt`. Dynamic subtabs are built from the actual `category` values in the data.

Prompt rows show title and description compactly. Expanded state shows suggested use, source, and an exact copy-friendly prompt window when `content` exists.

### Tools

Asset-centric. Shows only `kind=Tool`. One row per actual tool.

Expanded rows show what the tool does, suggested use, direct URL, and source signal context.

### Workflow

Asset-centric. Shows only `kind=Workflow`, grouped by dynamic categories.

### Ideas

Asset-centric. Shows `kind=Idea` for product, business, creative, and feature ideas.

### Materials

Asset-centric. Groups:

- `Research`;
- `Reference`;
- `News`;
- `Instruction`;
- `File`;
- `Other`.

Dynamic categories can include Documentation, News & Updates, Research, Cases, Security, Monetization, Content, and Other.

### Tasks

Asset-centric. Shows only `kind=Task`. These are candidates; task creation remains a separate confirmed action.

### Processed

Signal-centric. Shows reviewed/archived source signals.

## Persistence

Notion database `LifeMap AI Inbox` contains:

- `Extracted assets` — JSON array of assets;
- `AI processing version` — policy/version marker;
- `Attachment metadata` — safe Telegram attachment metadata used by the backend;
- existing signal-level fields remain for source-level classification and review.

A signal is considered AI-processed by the presence of `AI processing version`, not by `assets.length`. This prevents legitimate zero-asset test/noise messages from being reprocessed forever.

New signals preserve original Telegram text in `Summary`; AI commentary is stored separately.

## Attachment rules

For new Telegram documents, LifeMap persists:

- file name;
- MIME type;
- file size;
- Telegram file ID for backend retrieval.

The model receives only safe metadata and never receives the Telegram file ID or bot token.

The backend proxies file downloads so the browser never sees the Telegram bot token.

Old attachment signals created before attachment metadata persistence may not support direct download. Their fallback is the original Telegram source post.

## Background reprocessing queue

### `POST /api/life-os/inbox/reprocess`

Starts one background migration job and returns immediately with job metadata.

A single user click should process all candidates that do not yet have `AI processing version`.

The worker:

- processes records sequentially;
- adds pacing between provider calls;
- retries temporary failures;
- respects provider `retry-after` when available;
- reuses existing analysis for duplicate source signals where possible;
- stores progress in an in-memory job state.

### `GET /api/life-os/inbox/reprocess/status`

Returns current job progress for frontend polling.

The frontend displays:

- processed + failed / total;
- current signal title;
- a visual progress bar;
- final processed, reused, and failed counts.

### `GET /api/life-os/inbox/files/:signalId`

Securely proxies a stored Telegram attachment from the trusted LifeMap UI.

## Frontend acceptance tests

### Multi-asset post

Given one Telegram post containing:

- a design prompt;
- a productivity prompt;
- three different tools;
- one repeatable workflow;

The UI must show:

- 2 Prompt rows in appropriate dynamic categories;
- 3 separate Tool rows;
- 1 Workflow row;
- 1 source Signal in Incoming until it is processed;
- no duplicated source-post row used as a fake Prompt/Tool/Workflow item.

### Mixed material post

Given one post describing a new AI feature, an implementation tip, and a reference link, the model may emit `News`, `Instruction`, and `Reference`, all visible in Materials and grouped by dynamic categories.

### Attachment

Given a new Telegram PDF attachment:

- the signal row shows filename and metadata;
- AI may create a `File` asset without inventing PDF contents;
- the file is downloadable from AI Inbox through the backend proxy;
- the bot token is never exposed to the browser.
