# LifeMap AI Inbox v2 — asset-centric architecture

## Product problem

The first Inbox UI treated the same source post as the item in every thematic tab. A post containing any tool could appear both in `Incoming` and `Tools`, and the same source could appear again in `Prompts` or `Workflow`. This duplicates posts instead of structuring knowledge.

## Core model

A **Signal** is the incoming source container. An **Asset** is a useful concrete object extracted from that source.

One signal may produce zero, one, or many assets.

Examples:

- one post listing 5 tools → 5 `Tool` assets;
- one post containing a design prompt and a productivity prompt → 2 `Prompt` assets in different categories;
- one post describing a repeatable process and mentioning 2 tools → 1 `Workflow` asset + 2 `Tool` assets.

## Asset contract

```json
{
  "kind": "Prompt|Tool|Workflow|Task|Research|Idea|Reference",
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
- dedupe assets inside a signal.

## Main tabs

### Incoming

Signal-centric. Shows source signals waiting for review.

### Prompts

Asset-centric. Shows only `kind=Prompt`. Dynamic subtabs are built from the actual `category` values in the data.

Prompt cards show:

- title;
- short description;
- suggested use;
- exact prompt in a dedicated copy-friendly window when `content` exists;
- direct resource URL when available;
- source post link as fallback context.

### Tools

Asset-centric. Shows only `kind=Tool`. One card per actual tool.

Cards show:

- title;
- what the tool does;
- suggested use;
- direct URL;
- source signal context.

### Workflow

Asset-centric. Shows only `kind=Workflow`, grouped by dynamic categories.

### Tasks

Asset-centric. Shows only `kind=Task`. These are candidates; task creation remains a separate confirmed action.

### Processed

Signal-centric. Shows reviewed/archived source signals.

## Persistence

Notion database `LifeMap AI Inbox` contains:

- `Extracted assets` — JSON array of assets;
- `AI processing version` — policy/version marker;
- existing signal-level fields remain for source-level classification and review.

New signals are enriched during Telegram ingestion and persisted immediately.

## Backend endpoints

### `GET /api/life-os/inbox/assets`

Returns signal records with parsed `assets` arrays.

### `POST /api/life-os/inbox/reprocess`

Securely reprocesses old signals. Requires `X-LifeMap-Assistant-Secret`.

Payload:

```json
{
  "limit": 30,
  "onlyMissing": true
}
```

The default migration path should reprocess only signals without extracted assets.

## Frontend acceptance test

Given one Telegram post containing:

- a design prompt;
- a productivity prompt;
- three different tools;
- one repeatable workflow;

The UI must show:

- 2 Prompt cards in the appropriate category subtabs;
- 3 separate Tool cards;
- 1 Workflow card;
- 1 source Signal in Incoming until it is processed;
- no duplicated source-post card used as a fake Prompt/Tool/Workflow item.
