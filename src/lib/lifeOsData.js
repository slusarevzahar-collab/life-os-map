export const fallbackSnapshot = {
  meta: { source: 'local-fallback', version: '0.1.0', updatedAt: null, warnings: [] },
  currentFocus: {
    title: 'Life OS Map',
    status: 'in_progress',
    progress: 55,
    nextAction: 'Подключить карту к данным через backend snapshot.',
  },
  goals: [
    {
      id: 'goal_life_os',
      title: 'Life OS',
      status: 'active',
      progress: 38,
      targetDate: '2026-06-30',
      nextAction: 'Собрать рабочий навигатор.',
    },
  ],
  sessions: [],
  tasks: [
    {
      id: 'task_life_os_map',
      title: 'Life OS Map',
      project: 'Life OS',
      status: 'in_progress',
      progress: 55,
      priority: 1,
      summary: 'Центр системы.',
      goalIds: ['goal_life_os'],
    },
    {
      id: 'task_mobile_ux',
      title: 'Mobile UX',
      project: 'Life OS',
      status: 'next',
      progress: 0,
      priority: 2,
      summary: 'Сделать мобильный режим dashboard + mini-map.',
      goalIds: ['goal_life_os'],
    },
    {
      id: 'task_ai_inbox',
      title: 'AI Inbox',
      project: 'AI Inbox',
      status: 'next',
      progress: 35,
      priority: 3,
      summary: 'Telegram → Make → Notion.',
    },
  ],
  planning: { onTrack: 1, next: 2, waiting: 1, overdue: 0, done: 0 },
};

export const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'now', label: 'Сейчас' },
  { id: 'next', label: 'Следующее' },
  { id: 'progress', label: 'В работе' },
  { id: 'paused', label: 'Пауза' },
];

export const STATUS_WEIGHT = {
  now: 0,
  progress: 1,
  next: 2,
  overdue: 3,
  waiting: 4,
  paused: 5,
  neutral: 6,
  done: 7,
};

export function normalizeStatus(status = '') {
  const value = String(status).toLowerCase();

  if (value.includes('now') || value.includes('сейчас')) return 'now';
  if (value.includes('in progress') || value.includes('progress') || value.includes('в работе')) return 'progress';
  if (value.includes('next') || value.includes('след')) return 'next';
  if (value.includes('done') || value.includes('готово') || value.includes('finished')) return 'done';
  if (value.includes('paused') || value.includes('пауза')) return 'paused';
  if (value.includes('waiting') || value.includes('ожид')) return 'waiting';
  if (value.includes('overdue') || value.includes('просроч')) return 'overdue';

  return 'neutral';
}

export function statusLabel(status = '') {
  const key = normalizeStatus(status);
  const labels = {
    now: 'Сейчас',
    progress: 'В работе',
    next: 'Следующее',
    done: 'Готово',
    paused: 'Пауза',
    waiting: 'Ожидает',
    overdue: 'Просрочено',
    neutral: status || 'Без статуса',
  };

  return labels[key] || status || 'Без статуса';
}

export function compactTitle(title = '', fallback = 'Задача', limit = 28) {
  const clean = String(title || fallback).replace(/^(Milestone:\s*)/i, '').trim();

  if (clean.length <= limit) return clean;

  const words = clean.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 4).join(' ');

  return `${short.slice(0, limit)}…`;
}

export function formatDate(date) {
  if (!date) return 'без срока';

  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(date));
  } catch {
    return date;
  }
}

export function taskIcon(project = '') {
  const key = String(project).toLowerCase();

  if (key.includes('inbox')) return 'IN';
  if (key.includes('content') || key.includes('контент')) return 'AI';
  if (key.includes('sleda') || key.includes('след')) return 'SD';
  if (key.includes('agent') || key.includes('агент')) return 'AG';
  if (key.includes('github')) return 'GH';
  if (key.includes('yandex') || key.includes('яндекс')) return 'YA';

  return 'OS';
}

export function goalIcon(goal = '') {
  const key = String(goal).toLowerCase();

  if (key.includes('life')) return 'OS';
  if (key.includes('content') || key.includes('контент')) return 'AI';
  if (key.includes('inbox')) return 'IN';
  if (key.includes('sleda') || key.includes('след')) return 'SD';
  if (key.includes('yandex') || key.includes('яндекс')) return 'YA';
  if (key.includes('money') || key.includes('деньги')) return '₽';
  if (key.includes('body') || key.includes('тело')) return 'BD';

  return 'GO';
}

export function minutesLabel(minutes = 0) {
  const value = Number(minutes) || 0;

  if (value <= 0) return '0 мин';
  if (value < 60) return `${value} мин`;

  const hours = Math.floor(value / 60);
  const rest = value % 60;

  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function sortTasksForMap(tasks) {
  return [...tasks].sort((a, b) => {
    const statusDiff = (STATUS_WEIGHT[normalizeStatus(a.status)] ?? 99) - (STATUS_WEIGHT[normalizeStatus(b.status)] ?? 99);
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = (Number(a.priority) || 999) - (Number(b.priority) || 999);
    if (priorityDiff !== 0) return priorityDiff;

    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  });
}

function polar(centerX, centerY, radius, angleDeg) {
  const angle = angleDeg * (Math.PI / 180);

  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function makeGoalLayout(goals, tasks) {
  const goalsWithFallback = goals.length
    ? goals
    : [{ id: 'unlinked-goal', title: 'Life OS', status: 'active', progress: 0, targetDate: null, nextAction: '' }];

  const unlinkedGoal = {
    id: 'unlinked',
    title: 'Без цели',
    status: 'unlinked',
    progress: 0,
    targetDate: null,
    nextAction: 'Связать эти задачи с Goals DB.',
  };

  const hasUnlinked = tasks.some((task) => !task.goalIds?.length);
  const visibleGoals = hasUnlinked ? [...goalsWithFallback, unlinkedGoal] : goalsWithFallback;
  const goalCount = Math.min(visibleGoals.length, 8);
  const orbitRadius = goalCount <= 1 ? 0 : goalCount <= 4 ? 30 : 34;

  return visibleGoals.slice(0, 8).map((goal, index, arr) => {
    const angle = -90 + (360 / Math.max(arr.length, 1)) * index;
    const pos = polar(50, 50, orbitRadius, angle);

    return {
      ...goal,
      x: Math.max(16, Math.min(84, pos.x)),
      y: Math.max(15, Math.min(85, pos.y)),
      angle,
      monogram: goal.id === 'unlinked' ? '??' : goalIcon(goal.title),
    };
  });
}

function buildGoalTaskNodes(goals, tasks, filter) {
  const goalLayouts = makeGoalLayout(goals, tasks);
  const goalById = new Map(goalLayouts.map((goal) => [goal.id, goal]));
  const fallbackGoal = goalLayouts.find((goal) => goal.id === 'unlinked') || goalLayouts[0];
  const filteredTasks = sortTasksForMap(tasks).filter((task) => filter === 'all' || normalizeStatus(task.status) === filter);
  const grouped = new Map();

  filteredTasks.forEach((task) => {
    const primaryGoalId = task.goalIds?.find((id) => goalById.has(id)) || fallbackGoal?.id;
    if (!primaryGoalId) return;

    if (!grouped.has(primaryGoalId)) grouped.set(primaryGoalId, []);
    grouped.get(primaryGoalId).push(task);
  });

  const taskNodes = [];
  const MAX_TASKS_PER_GOAL = 3;

  const goalNodes = goalLayouts.map((goal) => {
    const related = grouped.get(goal.id) || [];
    const visibleRelated = related.slice(0, MAX_TASKS_PER_GOAL);

    visibleRelated.forEach((task, index) => {
      const spread = visibleRelated.length === 1 ? 0 : (index - (visibleRelated.length - 1) / 2) * 22;
      const baseAngle = goal.angle + spread;
      const ring = goal.id === 'unlinked' ? 17 : 13;
      const pos = polar(goal.x, goal.y, ring, baseAngle);
      const statusKey = normalizeStatus(task.status);

      taskNodes.push({
        id: task.id,
        type: 'task',
        title: task.title || 'Без названия',
        shortTitle: compactTitle(task.title, 'Задача', 20),
        monogram: taskIcon(task.project),
        progress: task.progress ?? 0,
        status: task.status || 'unknown',
        statusKey,
        project: task.project || 'Life OS',
        dueDate: task.dueDate || null,
        priority: task.priority ?? 0,
        goalId: goal.id,
        goalTitle: goal.title,
        x: Math.max(8, Math.min(92, pos.x)),
        y: Math.max(8, Math.min(92, pos.y)),
        summary: task.nextAction || task.summary || 'Следующий шаг пока не указан.',
      });
    });

    return {
      id: goal.id,
      type: 'goal',
      title: goal.title || 'Цель',
      shortTitle: compactTitle(goal.title, 'Цель', 24),
      monogram: goal.monogram,
      progress: goal.progress ?? 0,
      status: goal.status || 'goal',
      statusKey: normalizeStatus(goal.status),
      project: 'Goal',
      dueDate: goal.targetDate || null,
      priority: '—',
      x: goal.x,
      y: goal.y,
      taskCount: related.length,
      hiddenTaskCount: Math.max(0, related.length - visibleRelated.length),
      summary: goal.nextAction || 'Цель из Goals DB.',
    };
  });

  return { goalNodes, taskNodes, filteredTasks };
}

function buildPlanning(tasks) {
  return tasks.reduce(
    (acc, task) => {
      const status = normalizeStatus(task.status);

      if (status === 'done') acc.done += 1;
      else if (status === 'overdue') acc.overdue += 1;
      else if (status === 'waiting') acc.waiting += 1;
      else if (status === 'next') acc.next += 1;
      else acc.onTrack += 1;

      return acc;
    },
    { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  );
}

export function buildMapFromSnapshot(snapshot, filter = 'all') {
  const tasks = snapshot.tasks || [];
  const goals = snapshot.goals || [];
  const sessions = snapshot.sessions || [];
  const activeTasks = tasks.filter((task) => normalizeStatus(task.status) !== 'done');
  const { goalNodes, taskNodes, filteredTasks } = buildGoalTaskNodes(goals, activeTasks, filter);
  const nowTask =
    activeTasks.find((task) => normalizeStatus(task.status) === 'now') ||
    activeTasks.find((task) => normalizeStatus(task.status) === 'progress') ||
    activeTasks[0];
  const nextTask =
    activeTasks.find((task) => normalizeStatus(task.status) === 'next') ||
    activeTasks.find((task) => task.id !== nowTask?.id);
  const waitingTasks = activeTasks.filter((task) => ['waiting', 'paused', 'overdue'].includes(normalizeStatus(task.status)));
  const linkedTasksCount = activeTasks.filter((task) => task.goalIds?.length).length;
  const totalSessionMinutes = sessions.reduce((sum, session) => sum + (Number(session.durationMin) || 0), 0);
  const visibleTaskCount = taskNodes.length;
  const hiddenTaskCount = Math.max(0, filteredTasks.length - visibleTaskCount);

  return {
    id: 'root',
    type: 'root',
    title: 'AI-first Life OS',
    icon: 'OS',
    monogram: 'OS',
    progress: snapshot.currentFocus?.progress ?? nowTask?.progress ?? 0,
    status: snapshot.meta?.source || 'snapshot',
    current: snapshot.currentFocus?.title || nowTask?.title || 'Life OS Map',
    next: snapshot.currentFocus?.nextAction || nowTask?.nextAction || 'Следующий шаг не указан.',
    goalNodes,
    taskNodes,
    nodes: [...goalNodes, ...taskNodes],
    planning: snapshot.planning || buildPlanning(tasks),
    rawTasks: tasks,
    activeTasks,
    filteredTasks,
    nowTask,
    nextTask,
    waitingTasks,
    goals,
    sessions,
    linkedTasksCount,
    totalSessionMinutes,
    visibleTaskCount,
    hiddenTaskCount,
  };
}
