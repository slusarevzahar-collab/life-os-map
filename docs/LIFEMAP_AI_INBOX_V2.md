# LifeMap AI Inbox v2 — asset-centric architecture

## Product problem

The first Inbox UI treated the same source post as the item in every thematic tab. A post containing any tool could appear both in `Incoming` and `Tools`, and the same source could appear again in `Prompts` or `Workflow`. This duplicates posts instead of structuring knowledge.

A second problem appeared during migration: bulk reprocessing ran dozens of provider calls inside one synchronous HTTP request. Temporary rate limits caused partial runs and forced the user to click reprocess repeatedly.

A third problem was decision quality: generic AI notes such as “useful for automation” did not help decide what deserves attention now. AI Inbox therefore needs both better grounded commentary and a live relevance layer tied to current work.

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

## Decision-grade AI commentary

`assistantNote` must help make a decision, not repeat the summary.

A useful note should add at least one of these:

- exact connection to the current focus or active work;
- a concrete limitation or risk;
- what the material can replace, shorten, or accelerate;
- why it can safely be postponed;
- what must be verified before adoption.

Generic statements such as “useful tool”, “may help automate tasks”, and “can be used in projects” are explicitly disallowed.

`possibleUse` and asset `suggestedUse` should name a concrete project, task, or work scenario from the provided LifeMap context. When no grounded connection exists, these fields should remain empty instead of inventing usefulness.

## Live relevance score

Every visible Signal and Asset receives a local `0–100` relevance score. This score is dynamic and does not spend AI tokens.

The current heuristic considers:

- keyword overlap with the current focus;
- direct match with the current focus project;
- number of active tasks that the material can plausibly match;
- source priority;
- recency.

Rows are sorted by relevance. The compact row shows `Акт. N`; the expanded row explains the strongest reasons behind the score.

This layer is intentionally local and recalculates when LifeMap focus or active tasks change. AI classification and relevance ranking are separate concerns: the model structures the material once, while LifeMap can reprioritize it repeatedly without paying for another model call.

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

## Budget-aware model routing

LifeMap no longer pins all work to one large Groq model.

There are separate routing profiles:

- Inbox: Scout → Instant → Qwen → optional Gemini;
- Chat: Qwen → Scout → 70B → Instant → optional Gemini.

The same Groq API key can address the configured Groq models. When one model returns `429`, that route enters a local cooldown and the router tries the next available model.

Token use is also reduced structurally:

- Inbox prompt is shorter;
- Inbox input text is clipped to a smaller safe window;
- only current focus plus up to six active work items are passed for Inbox decision context;
- Inbox output budget is smaller;
- chat history and output budget are smaller.

The goal is not to pretend free APIs are unlimited. The goal is graceful degradation: use an efficient model pool, avoid wasting tokens, skip cooling routes, and pause/resume automatically when all currently available free routes are exhausted.

## Background reprocessing queue

### `POST /api/life-os/inbox/reprocess`

Starts one background migration job and returns immediately with job metadata.

A single user click should process all candidates that do not yet have `AI processing version`.

The worker:

- processes records sequentially;
- adds pacing between provider calls;
- retries short temporary failures;
- respects provider `retry-after` when available;
- enters `waiting_rate_limit` for long quota waits;
- stores `resumeAfter` and automatically retries the same signal when the wait expires;
- reuses existing analysis for duplicate source signals where possible;
- stores progress in an in-memory job state.

### `GET /api/life-os/inbox/reprocess/status`

Returns current job progress for frontend polling.

The frontend displays:

- processed + failed / total;
- current signal title;
- a visual progress bar;
- quota wait state and planned resume time;
- final processed, reused, and failed counts.

### `GET /api/life-os/inbox/files/:signalId`

Securely proxies a stored Telegram attachment from the trusted LifeMap UI.

## Frontend interaction rules

- prompt modal is portaled to `document.body` and constrained to the current viewport;
- long prompt text scrolls inside the modal;
- chat `Enter` sends;
- chat `Shift+Enter` inserts a newline;
- provider errors shown to the user are concise and do not expose raw organization identifiers or billing URLs.

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

### Relevance

Given a current focus in LifeMap and a set of active tasks:

- Inbox rows are sorted by relevance descending;
- each row displays a 0–100 relevance score;
- expanding the row shows grounded reasons for the score;
- changing focus can change order without another AI request.
