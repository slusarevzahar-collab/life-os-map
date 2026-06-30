# LifeMap agent handoff rules

This file is the local project checkpoint for AI agents working on LifeMap. It mirrors the shared Notion handoff page: `Контекст для ИИ-ассистентов: журнал передачи`.

Before starting work, any agent should:

1. Read the shared Notion handoff page, especially `Текущая задача` and the latest bottom row in `Лог сессий`.
2. Pull the latest repository state.
3. Confirm the responsibility zone before changing files.
4. Commit only a coherent, scoped change with a clear prefix.
5. Leave a short handoff update in Notion when the session ends.

## Current main project

LifeMap is the user's current main project. It is a web navigator / work operating system for projects, goals, tasks, AI Inbox, and a future context-aware AI assistant.

Telegram is not a replacement for LifeMap. Telegram bot is an input channel for AI Inbox.

Notion is the shared source of truth for data and handoffs.

## Claude naming clarification

In the shared Notion log, `Claude` can mean two different tools:

- `Claude chat` is the normal conversational Claude. It can discuss architecture and product logic, but it does not have repository, terminal, or file-system access for LifeMap.
- `Claude Code` is the coding agent with repository access. It owns the frontend zone.

Any instruction like `git pull`, frontend file changes, commits, or repository operations must be addressed to `Claude Code`, not to Claude chat.

If a handoff says `Передать Claude` in a repository context, interpret it as `Передать Claude Code` unless the user says otherwise.

## Responsibility zones

### ChatGPT / GPT zone

GPT owns backend and integrations:

- `server.js`
- `server/notionAdapter.js`
- `server/telegramAdapter.js`
- Notion integration
- Telegram webhook
- `package.json` only when required for backend or integration work
- root-level coordination docs such as this `AGENTS.md`, when the user asks for handoff synchronization

GPT must not change frontend files unless the user explicitly approves after synchronizing Claude Code.

### Claude Code zone

Claude Code owns frontend:

- `src/`
- React components
- styles and animations
- `index.html`
- `vite.config.js`

Claude Code must not change backend files unless the user explicitly approves after synchronizing GPT.

### Future Codex zone

Codex should follow the shared Notion handoff page plus this local project file.

Until direct Notion access for Codex is configured, this file is the local bridge between Notion and Codex.

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

## AI Inbox target behavior

AI Inbox should help classify incoming signals into prompts, tools, workflows, code material, design or UX material, research or news, business or monetization, security or legal, project ideas, and archive.

The assistant should never automatically convert every signal into a task. It should first identify what the signal is, why it matters, where it belongs, and what the next action should be.

## Future AI assistant target behavior

Every task, signal, project, or planet should eventually have `Чат с AI`.

When opened from a task or signal, the assistant must know object code, title, status, parent project or branch, notes, next action, related AI Inbox signals, context files, and previous discussion for this object.

The user should not need to re-explain which task they mean.
