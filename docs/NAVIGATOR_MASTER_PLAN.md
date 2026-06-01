# Life OS Map — Navigator Master Plan

This document fixes the product logic we developed in canvas and turns it into an implementation plan.

## Core idea

Life OS Map is not just a dashboard. It is a visual navigator for Zachary's goals, projects, tasks, time, sessions, and AI-assisted next actions.

The map should behave like a living operating system:

1. Center: AI-first Life OS / main mission.
2. First orbit: Goals from Notion Goals DB.
3. Second orbit: active tasks grouped under goals.
4. Third layer: sessions, deadlines, overdue states, time debt, and progress.
5. Copilot layer: recommends the next action based on goals, dates, status, priority, and recent sessions.

## Product principles

- Map first. Panels are helpers, not the main screen.
- The user must be able to hide panels and navigate the map cleanly.
- Every task should have a goal, status, date, next action, progress, and priority.
- Time matters: created date, planned date, due date, started at, finished at, duration, reschedules, and time debt.
- Notion is the source of truth for now.
- The app should gradually become write-capable: it should not only read Notion, but also write work sessions and task events back to Notion.
- The UI should feel premium, serious, calm, and modern — not toy-like.

## Current state

Implemented:

- React/Vite frontend.
- Express backend.
- Reads Tasks DB, Goals DB, and Work Sessions DB from Notion.
- Shows mission control, active queue, data snapshot, plan panel.
- Supports map filters.
- Uses Goal select as a fallback grouping mechanism when real relation is missing.
- Has partial canvas-like hierarchy: center -> goals -> tasks.

Known gaps:

- Drag/zoom is not implemented yet.
- Map positioning is still not stable enough.
- Goal-task relations are not true Notion relations yet; current fallback uses the Goal select property.
- Calendar view could not be created automatically by connector and needs manual setup.
- The app cannot yet write work sessions/events back to Notion.
- Code is still too concentrated in App.jsx and needs component separation.

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

Required fields:

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

1. Stabilize map layout.
   - Central root stays centered by default.
   - Goals orbit the root.
   - Tasks orbit their goal.
   - Unlinked tasks go to Inbox / Без цели.

2. Implement drag/zoom canvas mode.
   - Drag on empty area and on nodes.
   - Pinch/wheel zoom.
   - Boundaries so the user cannot lose the map in empty space.
   - Reset/center button.

3. Separate code into components.
   - App.jsx should become orchestration only.
   - Components: MapCanvas, MissionDeck, ActiveQueue, BottomNav, NodeBubble, DetailSheet, DataPanel, PlanPanel, CopilotPanel.

4. Separate data adapters.
   - Notion mapping functions move from server.js to a dedicated adapter module.
   - Add tests or at least fixtures for Notion-like payloads.

5. Add write endpoints.
   - POST /api/life-os/sessions
   - POST /api/life-os/task-event
   - PATCH /api/life-os/tasks/:id

6. Add work session flow.
   - Start session.
   - Finish session.
   - Record duration.
   - Save result and next step.
   - Send to Work Sessions DB.

7. Add time intelligence.
   - Highlight overdue tasks.
   - Show rescheduled tasks.
   - Calculate time debt.
   - Weekly done count.
   - Weekly focus minutes.

8. Improve mobile UX.
   - Dashboard mode for phone.
   - Map-only mode.
   - Compact filters.
   - Bottom sheet that does not cover the map too aggressively.

9. Improve visual seriousness.
   - Reduce toy-like bubbles.
   - Use calmer typography.
   - Better spacing.
   - More premium motion.
   - More legible labels.

10. Add Copilot logic.
   - Recommend next action.
   - Explain why this task is next.
   - Detect missing fields in Notion.
   - Suggest cleanup actions.

11. Add Notion hygiene views.
   - By Goal board.
   - Calendar by Due Date.
   - Overdue tasks view.
   - Missing Goal view.
   - Active Today view.

12. Add deployment path.
   - Keep Codespaces for development.
   - Later add Vercel/Render/Railway or another hosting option.
   - Eventually evaluate Telegram Mini App / PWA / APK wrapper.

## Next recommended order

1. Pull latest code.
2. Restart API and frontend.
3. Check if Goal select grouping now works better.
4. Manually create Calendar view in Notion if connector cannot.
5. Implement drag/zoom canvas mode.
6. Split frontend components.
7. Add write endpoints for sessions.
8. Make the navigator usable as a daily work tool.
