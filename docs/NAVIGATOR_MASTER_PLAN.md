# LifeMap — Navigator Master Plan

This document fixes the product logic we developed and turns it into an implementation plan.

## Core idea

LifeMap is a visual navigator for Zachary's projects, goals, tasks, time, incoming AI signals, and AI-assisted next actions.

The map should behave like a living working system:

1. Center: LifeMap.
2. First orbit: main spheres — Projects, AI Inbox, Goals, Life, Income, Backlog.
3. Second orbit: concrete projects, goals, or signal groups.
4. Leaf level: tasks and processed inbox signals.
5. Mission Control: stable current focus and focus queue, independent from random map browsing.

## Product principles

- Map first. Panels are helpers, not the main screen.
- The user must be able to hide panels and navigate the map cleanly.
- Current focus should stay stable until the user changes it, marks the task Done, or puts another item into focus.
- Done inside LifeMap means only: task is completed and moved to completed tasks. No mandatory session summary inside the app.
- Notion is the source of truth for now.
- The app should gradually become write-capable: it should read Notion and write task changes, notes, focus state, and later sessions/events back to Notion.
- The UI should feel premium, serious, calm, and modern — not toy-like.

## Current state

Implemented:

- React/Vite frontend.
- Express backend.
- Reads Tasks DB from Notion.
- Reads Goals DB, Projects DB, Dreams DB, Work Sessions DB, and AI Signals Inbox DB when IDs are provided and integration access is granted.
- Shows LifeMap as the central node.
- Shows main spheres including AI Inbox.
- Shows Mission Control with current focus and queue.
- Supports Done and restore from Done.
- Supports task order changes through Priority.
- Supports renaming through context menu.
- Supports task notes via `Session Notes`.
- Uses Project/Goal select properties as fallback grouping when relation fields are not ready.

Known gaps:

- `App.jsx` is still too large and needs component separation.
- Tablet drag behavior needs more testing and stabilization.
- Planet text fitting still needs a final design pass.
- True Notion relations between goals/projects/tasks are not yet the main model.
- AI Inbox needs a full ingestion pipeline: Telegram bot → processing → Notion signal → LifeMap display.
- Work Sessions should be postponed until the basic LifeMap workflow is stable.

## Data model

### Tasks DB

Required fields:

- Task — title
- Project — select
- Goal — select fallback used for grouping
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

- Goal Link — relation to Goals DB. Manual creation may be needed if connector blocks schema update.

### AI Signals Inbox DB

Purpose: processed incoming materials from Telegram bot and other sources.

Useful fields:

- Signal — title
- Type — select
- Status — select
- Priority — select
- Related projects — multi-select
- Summary — text
- Possible use — text
- Next action — text
- Source URL — url
- Date captured — date

LifeMap should show AI Inbox as a separate planet/sphere. Inside it, the user should see what was sent, when it was captured, what is useful, how it can be applied, and whether a next action should be created.

### Goals DB

Required fields:

- Goal — title
- Area — select
- Horizon — select
- Status — select
- Progress — number
- Target Date — date
- Next Action — text
- Why — text
- Success Criteria — text
- Tasks — relation to Tasks DB if relation layer is enabled

### Work Sessions DB

Postponed for now. This is useful later for time intelligence, but it should not complicate the first useful LifeMap MVP.

Required fields later:

- Session — title
- Task — text or future relation
- Project — select
- Status — select
- Started At — date
- Finished At — date
- Duration Min — number
- Result — text
- Next Step — text

## Implementation backlog

1. Split `App.jsx` into components.
   - App.jsx should become orchestration only.
   - Components: TopNav, MissionPanel, OrbitMap, SideList, TaskRow, UtilityPanel, ContextMenu, DetailCard.

2. Stabilize tablet drag behavior.
   - Drag ghost should follow the finger.
   - Notion should update only after a real reorder, not after a touch.
   - Drop line should show the insertion point between tasks.

3. Stabilize map layout.
   - Central root stays readable.
   - Main spheres orbit the root.
   - Project/task planets use consistent sizing and text wrapping.
   - No Done planet on the main map; Done belongs in Mission Control / completed panel.

4. Make Mission Control truly useful.
   - Stable current focus.
   - Next item.
   - Expandable queue.
   - Completed tasks shortcut.
   - Error area for backend/frontend issues.

5. Build AI Inbox pipeline.
   - Telegram bot receives links, notes, posts, screenshots, or text.
   - AI processes the incoming item.
   - Notion stores structured signal.
   - LifeMap displays it inside AI Inbox.

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
   - Later add Vercel/Render/Railway or another hosting option.
   - Eventually evaluate Telegram Mini App / PWA / APK wrapper.

## Next recommended order

1. Pull latest code.
2. Restart only the changed process: frontend for UI changes, API for backend changes.
3. Check the basic LifeMap loop: choose focus → see queue → mark Done → restore from completed.
4. Split frontend components.
5. Stabilize tablet drag.
6. Build the AI Inbox pipeline.
7. Make LifeMap usable as a daily work tool.
