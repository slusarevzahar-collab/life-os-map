# LifeMap agent handoff rules

This file is the local project checkpoint for AI agents working on LifeMap. It mirrors the shared Notion handoff page: `Контекст для ИИ-ассистентов: журнал передачи`.

Before starting work, any agent should:

1. Read the shared Notion handoff page, especially `Текущая задача` and the latest bottom row in `Лог сессий`.
2. Pull the latest repository state.
3. Check recent commits if another agent has just worked on the project.
4. Commit only a coherent, scoped change with a clear prefix.
5. Leave a short handoff update in Notion when the session ends.

## Current main project

LifeMap is the user's current main project. It is a web navigator / work operating system for projects, goals, tasks, AI Inbox, and a future context-aware AI assistant.

Telegram is not a replacement for LifeMap. Telegram bot is an input channel for AI Inbox.

Notion is the live working source of truth for operational data and handoffs.

Google Drive / AI Second Brain is a portable context mirror, archive, and cross-AI bridge. It must not replace Notion until the user explicitly decides to migrate a specific workflow.

## Current responsibility mode

Previous hard file-zone separation between GPT and Claude Code is currently lifted by the user.

Any agent may work across backend and frontend when the task requires it, but must still:

- avoid overwriting another agent's unpulled work;
- keep commits small and clearly described;
- mention which files changed in the handoff;
- preserve the architecture: Notion is the live data layer, GitHub is the code layer, Google Drive is the portable context mirror.

Historical responsibility zones are still useful as preference hints, but they are no longer hard restrictions.

## Claude naming clarification

In the shared Notion log, `Claude` can mean two different tools:

- `Claude chat` is the normal conversational Claude. It can discuss architecture and product logic, but it does not have repository, terminal, or file-system access for LifeMap.
- `Claude Code` is the coding agent with repository access and can work on code.

Any instruction like `git pull`, file changes, commits, or repository operations must be addressed to `Claude Code`, not to Claude chat.

If a handoff says `Передать Claude` in a repository context, interpret it as `Передать Claude Code` unless the user says otherwise.

## Historical responsibility zones

These zones were previously active and can still help with coordination, but they are not hard limits right now.

### ChatGPT / GPT historical zone

- `server.js`
- `server/notionAdapter.js`
- `server/telegramAdapter.js`
- Notion integration
- Telegram webhook
- `package.json` when required for backend or integration work
- root-level coordination docs such as this `AGENTS.md`

### Claude Code historical zone

- `src/`
- React components
- styles and animations
- `index.html`
- `vite.config.js`

### Future Codex zone

Codex should follow:

1. the shared Notion handoff page;
2. this local project file;
3. the Google Drive AI Second Brain index and relevant project docs when the task involves cross-AI context, project briefs, archives, or migration planning.

Until direct Notion access for Codex is configured, this file is the local bridge between Notion and Codex.

Codex should not treat Google Drive as the new live database for LifeMap. Drive is the portable mirror and archive; Notion remains the live operating layer, and GitHub remains the code layer.

## Commit rules

Use clear commit prefixes:

- `[GPT] ...`
- `[Claude] ...`
- `[Codex] ...`

After one agent commits, the user tells the other agent:

`GPT/Claude/Codex закоммитил, сделай git pull`

## Notion handoff notes

Old Notion log entries must not be rewritten.

Preferred handoff format is a new bottom log entry with date, tool, work done, status, and next step.

If a tool cannot safely edit the existing table, append a new simple block at the bottom or add a page-level comment, then state clearly that it was not inserted into the original table.

## Google Drive / AI Second Brain notes

Google Drive contains the AI Second Brain hub. Its current role is context portability between different AI tools.

Use Drive in this order:

1. `README — AI Second Brain` for the hub purpose and folder structure.
2. `AI Projects Master Map — Захар` for project priorities and active directions.
3. `Notion Core Mirror` for summarized high-value Notion context.
4. `Notion Mirror Control Panel` for export/mirror status and what still needs raw export.
5. Project-specific docs in `02_Projects` when they exist.

Accept the useful part of the Drive/Codex idea: keep a neutral, AI-readable mirror so ChatGPT, Claude, Gemini, Codex, and future agents can share context.

Change or constrain the risky part: do not move live work away from Notion just because Drive exists. Notion remains the active workspace for tasks, goals, AI Inbox, and handoff. Drive should hold summaries, raw exports, project briefs, session logs, and audits.

Before relying on a Drive summary, check whether raw export exists. Summaries are useful for orientation, but raw Markdown/CSV/HTML exports are needed for full fidelity.

## Working principles

- Do not ask the user to act like a programmer when the agent can reason through the technical step.
- Prefer simple checks first: running process, port visibility, restart, recreated Codespaces port, environment variables, webhook status.
- Do not rewrite old Notion log rows. Append a new row at the bottom.
- Treat LifeMap as a product-owner tool: the user describes desired behavior; agents translate it into implementation steps.
- Keep LifeMap moving toward useful work and future revenue. Avoid endless visual polishing unless it blocks usability.

## Current LifeMap architecture

- Frontend: React and Vite, usually port `3000`.
- Backend: Node and Express, usually port `3001`.
- Notion: database layer for tasks, goals, AI signals, sessions, and handoff context.
- Telegram bot: sends posts, links, documents, prompts, tools, and ideas into AI Inbox.
- AI Inbox: incoming signal triage layer, not a task list.
- Future AI assistant: context-aware chat attached to tasks, projects, planets, and AI Inbox signals.
- Google Drive: portable AI context hub, mirror, raw export archive, and audit layer.

## AI Inbox target behavior

AI Inbox should help classify incoming signals into prompts, tools, workflows, code material, design or UX material, research or news, business or monetization, security or legal, project ideas, and archive.

The assistant should never automatically convert every signal into a task. It should first identify what the signal is, why it matters, where it belongs, and what the next action should be.

## Future AI assistant target behavior

Every task, signal, project, or planet should eventually have `Чат с AI`.

When opened from a task or signal, the assistant must know object code, title, status, parent project or branch, notes, next action, related AI Inbox signals, context files, and previous discussion for this object.

The user should not need to re-explain which task they mean.
