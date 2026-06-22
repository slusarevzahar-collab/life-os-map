# LifeMap progress logic

LifeMap progress is calculated from completed tasks.

```text
progress = completed tasks / total tasks * 100
```

Examples:

- 10 tasks in a goal: each completed task adds 10%.
- 100 tasks in a project: each completed task adds 1%.
- A leaf task is 0% while active and 100% when Done.
- A project, goal, sphere, or the LifeMap root aggregates all tasks below it.

This keeps progress grounded in real Done items instead of a vague manual estimate.

Current implementation:

- `src/lib/actionMapModel.js` calculates `tasks`, `completedTasks`, `totalTasks`, and `progress`.
- `src/components/OrbitMap.jsx` displays progress on planets.
- `src/components/SideList.jsx` displays progress in branch task lists.
- `src/lifemap-progress.css` styles progress pills and planet progress visuals.
