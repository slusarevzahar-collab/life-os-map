import { normalizeStatus } from './lifeOsData.js';

const PROJECT_ICONS = [
  ['inbox', '📥'],
  ['telegram', '🤖'],
  ['sleda', '🔎'],
  ['след', '🔎'],
  ['life os', '☀️'],
  ['github', '💻'],
  ['codex', '💻'],
  ['canvas', '🧪'],
  ['content', '🎬'],
  ['контент', '🎬'],
  ['yandex', '⚡'],
  ['яндекс', '⚡'],
  ['4life', '🌿'],
  ['oracle', '🔮'],
  ['body', '🧍'],
  ['english', '🇬🇧'],
];

function clean(value = '') {
  return String(value || '').trim();
}

function slug(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function iconFor(title = '') {
  const key = clean(title).toLowerCase();
  const match = PROJECT_ICONS.find(([token]) => key.includes(token));
  return match?.[1] || '🪐';
}

function avg(items, field = 'progress') {
  if (!items.length) return 0;
  const sum = items.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
  return Math.round(sum / items.length);
}

function stateFromTasks(tasks = []) {
  if (tasks.some((task) => normalizeStatus(task.status) === 'now')) return 'active';
  if (tasks.some((task) => normalizeStatus(task.status) === 'progress')) return 'active';
  if (tasks.some((task) => normalizeStatus(task.status) === 'next')) return 'next';
  if (tasks.some((task) => ['paused', 'waiting'].includes(normalizeStatus(task.status)))) return 'paused';
  if (tasks.some((task) => normalizeStatus(task.status) === 'done')) return 'done';
  return 'queue';
}

function stateLabel(state) {
  const labels = {
    active: 'в работе',
    next: 'следующий шаг',
    queue: 'очередь',
    idea: 'идея',
    done: 'сделано',
    paused: 'пауза',
  };
  return labels[state] || 'область';
}

function sortByAttention(a, b) {
  const weight = { active: 0, next: 1, queue: 2, paused: 3, idea: 4, done: 5 };
  const stateDiff = (weight[a.state] ?? 9) - (weight[b.state] ?? 9);
  if (stateDiff) return stateDiff;
  const taskDiff = (b.tasks || 0) - (a.tasks || 0);
  if (taskDiff) return taskDiff;
  return (b.progress || 0) - (a.progress || 0);
}

function topTask(tasks = []) {
  return [...tasks].sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))[0];
}

function taskSummary(task) {
  return task?.nextAction || task?.summary || task?.title || 'Следующий шаг пока не указан.';
}

function taskToNode(task, index) {
  const status = normalizeStatus(task.status);
  return {
    id: task.id,
    title: task.title || 'Задача',
    icon: iconFor(task.project || task.title),
    status: task.status || 'задача',
    state: status === 'now' || status === 'progress' ? 'active' : status === 'next' ? 'next' : status === 'paused' || status === 'waiting' ? 'paused' : status === 'done' ? 'done' : 'queue',
    progress: Number(task.progress) || 0,
    tasks: 1,
    summary: taskSummary(task),
    details: [task.project, task.goalName, task.nextAction].filter(Boolean),
    raw: task,
    index,
  };
}

function groupTasks(tasks = [], goals = []) {
  const activeTasks = tasks.filter((task) => normalizeStatus(task.status) !== 'done');
  const groups = new Map();

  activeTasks.forEach((task) => {
    const key = clean(task.project) || clean(task.goalName) || 'Life OS';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });

  const goalByTitle = new Map(goals.map((goal) => [slug(goal.title), goal]));

  return [...groups.entries()].map(([title, group]) => {
    const first = topTask(group);
    const goal = goalByTitle.get(slug(title));
    const state = stateFromTasks(group);

    return {
      id: `area-${slug(title)}`,
      title,
      icon: iconFor(title),
      status: goal?.status || stateLabel(state),
      state,
      progress: goal?.progress ?? avg(group),
      tasks: group.length,
      summary: goal?.nextAction || first?.nextAction || `Ветка ${title}: ${group.length} активных задач.`,
      details: group.slice(0, 4).map((task) => task.title),
      children: group.slice(0, 8).map(taskToNode),
      rawTasks: group,
      goal,
    };
  }).sort(sortByAttention);
}

function makeRoot(snapshot, areas) {
  const current = snapshot.currentFocus || {};
  const tasks = snapshot.tasks || [];
  const progress = Number(current.progress) || avg(tasks) || 0;
  const activeCount = tasks.filter((task) => normalizeStatus(task.status) !== 'done').length;

  return {
    id: 'root',
    title: 'AI-first Life OS',
    subtitle: 'Главная орбита',
    icon: '☀️',
    status: 'центр системы',
    state: 'active',
    progress,
    tasks: activeCount,
    summary: 'Карта жизни, проектов, целей, задач и следующих действий.',
    session: {
      current: current.title || 'Life OS Map: сделать карту рабочим навигатором',
      next: current.nextAction || 'Выбрать ветку и закрыть ближайший практический шаг.',
      recommendation: 'Смотри на карту как на навигатор: центр → ветка → задача → следующий шаг.',
    },
    children: areas,
  };
}

export function buildActionMap(snapshot) {
  const areas = groupTasks(snapshot.tasks || [], snapshot.goals || []);
  return makeRoot(snapshot, areas);
}

export function findNode(root, nodeId) {
  if (!nodeId || nodeId === 'root') return root;
  const stack = [root];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === nodeId) return node;
    if (node.children?.length) stack.push(...node.children);
  }
  return root;
}

export function getChildMap(root, nodeId) {
  const node = findNode(root, nodeId);
  if (!node || node.id === 'root') return root;
  return {
    ...node,
    subtitle: node.status || 'ветка',
    children: node.children || [],
    session: {
      current: node.title,
      next: node.summary,
      recommendation: node.details?.[0] || 'Выбери подзадачу или вернись в центр.',
    },
  };
}

export function shortText(value = '', limit = 52) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}
