# LifeMap — Navigator Master Plan

This document fixes the product logic and current implementation order.

## Core idea

LifeMap is a visual navigator for Zachary's projects, goals, tasks, time, incoming AI signals, and AI-assisted next actions.

The map behaves like a living work system:

1. Center: LifeMap.
2. First orbit: Projects, AI Inbox, Goals, Life, Income, Backlog.
3. Second orbit: concrete projects, goals, or signal groups.
4. Leaf level: tasks and processed Inbox signals.
5. Mission Control: stable current focus and focus queue, independent from random map browsing.

AI Inbox is part of LifeMap, not a separate product.

## Product principles

- Map first. Panels are helpers, not the main screen.
- Current focus stays stable until the user changes it, marks the task Done, or explicitly chooses another focus.
- Done means task completed and moved to completed tasks.
- Notion is the source of truth for working data.
- LifeMap reads and writes through controlled backend adapters.
- AI proposes actions; executable actions require confirmation.
- AI outages must not stop LifeMap or lose Inbox material.
- The UI should feel premium, serious, calm, and modern.

## Current state

Implemented:

- React/Vite frontend.
- Express backend.
- Reads Tasks DB from Notion.
- Reads Goals DB, Projects DB, Dreams DB, Work Sessions DB, and AI Signals Inbox DB when configured.
- Central LifeMap node and main spheres including AI Inbox.
- Mission Control with current focus and queue.
- Done and restore from Done.
- Task order through Priority.
- Rename through context menu.
- Task notes via Session Notes.
- Telegram intake into AI Inbox.
- AI processing of incoming Inbox signals.
- Structured signal fields: type, priority, related projects, summary, assistant note, possible use, next action.
- Free-first provider router: Groq primary, Gemini fallback when configured.
- Deterministic fallback when external AI is unavailable.
- Model-independent prompts and canonical JSON contracts.
- Privacy-safe AI context minimization and masking.
- Action allowlist and confirmation enforcement.

Known gaps:

- `App.jsx` is still too large and needs component separation.
- Tablet drag behavior needs more testing and stabilization.
- Planet text fitting needs a final design pass.
- True Notion relations between goals, projects, and tasks are not yet the main model.
- Voice and image Inbox inputs need a separate safe processing layer.
- Work Sessions should remain secondary until the daily LifeMap workflow is stable.

## Data model

### Tasks DB

Required fields:

- Task — title
- Project — select
- Goal — select fallback
- Status — select
- Type — select
- Energy — select
- Progress — number
- Priority — number
- Due Date — date
- Planned Date — date
- Started At — date
- Finished At — date
- Duration Min — number
- Last Touched — date
- Reschedule Count — number
- Time Debt — number
- Next Action — text
- Session Notes — text

Future field:

- Goal Link — relation to Goals DB.

### AI Signals Inbox DB

Purpose: structured incoming materials from Telegram and future sources.

Useful fields:

- Signal — title
- Type — select
- Status — select
- Priority — select
- Related projects — multi-select
- Summary — text
- Assistant note — text
- Possible use — text
- Next action — text
- Source URL — url
- Date captured — date

LifeMap shows AI Inbox as a main sphere. The user should see what arrived, why it matters, where it belongs, how it can be used, and whether any action is worth taking.

AI Inbox never converts every signal into a task automatically.

## AI operating model

The permanent product rules live outside provider-specific code.

```text
LifeMap / Telegram
  → privacy minimization
  → stable prompt policy
  → provider router
      → Groq
      → Gemini fallback when configured
  → server-side normalization
  → action allowlist + confirmation
  → Notion / LifeMap UI
```

Detailed policy: `docs/LIFEMAP_AI_POLICY.md`.

The model may change without changing:

- response contracts;
- action types;
- confirmation logic;
- privacy minimization;
- Inbox classification rules;
- fallback behavior.

## AI Inbox flow

```text
Telegram message
  ↓
webhook verification + user allowlist
  ↓
primary parser / text extraction
  ↓
privacy-safe payload
  ↓
AI classification and analysis
  ↓
server-side normalization
  ↓
Notion AI Signals Inbox DB
or local fallback
  ↓
LifeMap AI Inbox sphere
```

The AI output contains:

- title;
- type;
- priority;
- related projects from the allowed project list;
- factual summary;
- assistant note;
- possible use;
- one next action or empty value;
- task recommendation flag only, never automatic creation;
- confidence and warnings metadata.

## Security model

- Do not send the full LifeMap snapshot to external AI.
- Send only relevant tasks, goals, signals, current focus, target, and short recent conversation.
- Mask obvious credentials, long token-like strings, email addresses, and phone-like strings.
- Treat posts, documents, links, and Inbox text as untrusted data.
- Do not log full model prompt/response payloads.
- Unknown actions are ignored.
- Executable actions require explicit confirmation and protected backend access.
- AI failure does not prevent Inbox storage.
- Notion failure falls back to local storage.

## Implementation backlog

1. Split `App.jsx` into components.
   - App.jsx becomes orchestration only.
   - Components: TopNav, MissionPanel, OrbitMap, SideList, TaskRow, UtilityPanel, ContextMenu, DetailCard.

2. Stabilize tablet drag behavior.
   - Drag ghost follows the finger.
   - Notion updates only after a real reorder.
   - Drop line shows insertion point.

3. Stabilize map layout.
   - Central root stays readable.
   - Main spheres orbit the root.
   - Project/task planets use consistent sizing and text wrapping.
   - Done belongs in Mission Control / completed panel.

4. Make Mission Control truly useful.
   - Stable current focus.
   - Next item.
   - Expandable queue.
   - Completed tasks shortcut.
   - Error area for backend/frontend issues.

5. Complete AI Inbox UX.
   - Better detail panel.
   - Clear display of AI reasoning summary, possible use, and next action.
   - User-controlled conversion of a signal into a task.
   - Voice/image processing later through a separate privacy-safe layer.

6. Add better task detail editing.
   - Inline notes.
   - Rename through context menu.
   - Later: edit next action, priority, due date, project, goal.

7. Add time intelligence later.
   - Highlight overdue tasks.
   - Show rescheduled tasks.
   - Calculate time debt.
   - Weekly done count.
   - Weekly focus minutes.

8. Add deployment path.
   - Keep Codespaces for development.
   - Later evaluate Vercel, Render, Railway, or another hosting option.
   - Eventually evaluate Telegram Mini App, PWA, or APK wrapper.

## Next recommended order

1. Pull latest code.
2. Run `npm run test:ai`.
3. Restart backend.
4. Connect one free AI provider key outside GitHub source code.
5. Run end-to-end test: Telegram → AI processing → Notion → LifeMap AI Inbox.
6. Test weak signal, useful signal, task candidate, and instruction-like text inside a signal.
7. Continue frontend component split and tablet drag stabilization.
8. Make LifeMap usable as a daily work tool.
