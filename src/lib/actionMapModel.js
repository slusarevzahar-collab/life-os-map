import { normalizeStatus } from './lifeOsData.js';

const TOP_AREAS = [
  { id: 'projects', title: 'Проекты', icon: 'PR', summary: 'Все продуктовые и рабочие проекты. Нажми, чтобы открыть вложенную карту проектов.' },
  { id: 'navigator', title: 'Навигатор', icon: 'OS', summary: 'Всё, что относится к Life OS Map, Notion-памяти, структуре и интерфейсу.' },
  { id: 'inbox', title: 'AI Inbox', icon: 'IN', summary: 'Входящий поток: Telegram, посты, сигналы, заметки, материалы и будущий бот.' },
  { id: 'goals', title: 'Цели', icon: 'GO', summary: 'Цели из Notion: крупные направления, к которым привязываются задачи.' },
  { id: 'income', title: 'Доход', icon: '₽', summary: 'Всё, что связано с клиентами, деньгами, продажами, монетизацией и быстрым доходом.' },
  { id: 'life', title: 'Жизнь', icon: 'LF', summary: 'Личные сферы, тело, обучение, творчество, отношения и баланс жизни.' },
  { id: 'backlog', title: 'Идеи / потом', icon: 'BK', summary: 'То, что важно сохранить, но не должно сбивать текущий фокус.' },
];

const PROJECT_ICON_MAP = [
  ['sleda', 'SD'],
  ['след', 'SD'],
  ['life os', 'OS'],
  ['navigator', 'OS'],
  ['навиг', 'OS'],
  ['inbox', 'IN'],
  ['telegram', 'TG'],
  ['github', 'GH'],
  ['codex', 'CD'],
  ['canvas', 'CV'],
  ['content', 'CT'],
  ['контент', 'CT'],
  ['yandex', 'YA'],
  ['яндекс', 'YA'],
  ['4life', '4L'],
  ['oracle', 'OR'],
  ['body', 'BD'],
  ['english', 'EN'],
  ['англий', 'EN'],
  ['health', 'HL'],
  ['тело', 'BD'],
  ['деньги', '₽'],
  ['доход', '₽'],
];

function clean(value = '') {
  return String(value || '').trim();
}

function key(value = '') {
  return clean(value).toLowerCase().replace(/ё/g, 'е');
}

function slug(value = '') {
  return key(value).replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function iconFor(title = '', fallback = 'ND') {
  const lower = key(title);
  const match = PROJECT_ICON_MAP.find(([token]) => lower.includes(token));
  if (match) return match[1];
  const words = clean(title).split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function avg(items, field = 'progress') {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0) / items.length);
}

function statusState(status = '') {
  const normalized = normalizeStatus(status);
  if (normalized === 'now' || normalized === 'progress') return 'active';
  if (normalized === 'next') return 'next';
  if (normalized === 'paused' || normalized === 'waiting') return 'paused';
  if (normalized === 'done') return 'done';
  return 'queue';
}

function stateFromTasks(tasks = []) {
  if (tasks.some((task) => statusState(task.status) === 'active')) return 'active';
  if (tasks.some((task) => statusState(task.status) === 'next')) return 'next';
  if (tasks.some((task) => statusState(task.status) === 'paused')) return 'paused';
  return 'queue';
}

function stateLabel(state) {
  return ({ active: 'в работе', next: 'следующее', paused: 'пауза', done: 'сделано', queue: 'очередь' })[state] || 'ветка';
}

function topTask(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priority = (Number(a.priority) || 999) - (Number(b.priority) || 999);
    if (priority) return priority;
    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  })[0];
}

function isProjectTask(task) {
  const text = key(`${task.project} ${task.goalName} ${task.title}`);
  return ['sleda', 'след', 'oracle', '4life', 'yandex', 'яндекс', 'content', 'контент', 'body', 'pregnancy', 'project', 'продукт'].some((token) => text.includes(token));
}

function taskToLeaf(task) {
  return {
    id: `task-${task.id}`,
    sourceId: task.id,
    title: task.title || 'Задача',
    icon: iconFor(task.project || task.title, 'TS'),
    status: task.status || 'задача',
    state: statusState(task.status),
    progress: Number(task.progress) || 0,
    tasks: 1,
    summary: task.nextAction || task.summary || task.title || 'Следующий шаг пока не указан.',
    details: [task.nextAction, task.goalName, task.project].filter(Boolean),
    children: [],
    kind: 'task',
    raw: task,
  };
}

function makeGroupNode({ id, title, icon, items, summary, kind = 'group', children }) {
  const taskItems = items || [];
  const childItems = children || taskItems.map(taskToLeaf);
  const first = topTask(taskItems);
  const state = taskItems.length ? stateFromTasks(taskItems) : 'queue';
  return {
    id,
    title,
    icon,
    status: stateLabel(state),
    state,
    progress: taskItems.length ? avg(taskItems) : 0,
    tasks: taskItems.length || childItems.length,
    summary: summary || first?.nextAction || `${title}: ${taskItems.length || childItems.length} элементов.`,
    details: taskItems.slice(0, 4).map((task) => task.title),
    children: childItems,
    kind,
  };
}

function groupByProject(tasks = []) {
  const map = new Map();
  tasks.forEach((task) => {
    const title = clean(task.project) || clean(task.goalName) || 'Без проекта';
    if (!map.has(title)) map.set(title, []);
    map.get(title).push(task);
  });
  return [...map.entries()].map(([title, items]) => makeGroupNode({
    id: `project-${slug(title)}`,
    title,
    icon: iconFor(title, 'PR'),
    items,
    kind: 'project',
  }));
}

function buildGoals(goals = [], tasks = []) {
  return goals.map((goal) => {
    const related = tasks.filter((task) => task.goalIds?.includes(goal.id) || task.goalName === goal.title);
    const state = related.length ? stateFromTasks(related) : statusState(goal.status);
    return {
      id: `goal-${goal.id}`,
      sourceId: goal.id,
      title: goal.title || 'Цель',
      icon: 'GO',
      status: goal.status || stateLabel(state),
      state,
      progress: Number(goal.progress) || avg(related),
      tasks: related.length,
      summary: goal.nextAction || `Цель: ${goal.title}`,
      details: related.slice(0, 4).map((task) => task.title),
      children: related.map(taskToLeaf),
      kind: 'goal',
    };
  });
}

function classifyTasks(tasks = [], goals = []) {
  const activeTasks = tasks.filter((task) => statusState(task.status) !== 'done');
  const byText = (tokens) => activeTasks.filter((task) => tokens.some((token) => key(`${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`).includes(token)));
  const projectTasks = activeTasks.filter(isProjectTask);
  const navigatorTasks = byText(['life os', 'navigator', 'навигатор', 'notion', 'github', 'codex', 'map']);
  const inboxTasks = byText(['inbox', 'telegram', 'bot', 'бот', 'signal', 'сигнал']);
  const incomeTasks = byText(['доход', 'клиент', 'деньги', 'money', 'sales', 'продаж', '4life', 'парсер']);
  const lifeTasks = byText(['здоров', 'тело', 'english', 'англий', 'творч', 'отнош', 'семья', 'мечт']);
  const backlogTasks = activeTasks.filter((task) => ['queue', 'paused'].includes(statusState(task.status)) && !navigatorTasks.includes(task) && !inboxTasks.includes(task));

  const topNodes = [];

  if (projectTasks.length) topNodes.push(makeGroupNode({
    id: 'area-projects',
    title: 'Проекты',
    icon: 'PR',
    items: projectTasks,
    summary: 'Нажми, чтобы открыть карту проектов и увидеть ветки внутри.',
    children: groupByProject(projectTasks),
  }));

  if (navigatorTasks.length) topNodes.push(makeGroupNode({ id: 'area-navigator', title: 'Навигатор', icon: 'OS', items: navigatorTasks, summary: TOP_AREAS[1].summary }));
  if (inboxTasks.length) topNodes.push(makeGroupNode({ id: 'area-inbox', title: 'AI Inbox', icon: 'IN', items: inboxTasks, summary: TOP_AREAS[2].summary }));

  const goalNodes = buildGoals(goals, activeTasks).filter((goal) => goal.tasks > 0 || goal.progress > 0).slice(0, 8);
  if (goalNodes.length) topNodes.push(makeGroupNode({ id: 'area-goals', title: 'Цели', icon: 'GO', items: activeTasks.filter((task) => task.goalIds?.length), summary: TOP_AREAS[3].summary, children: goalNodes }));

  if (incomeTasks.length) topNodes.push(makeGroupNode({ id: 'area-income', title: 'Доход', icon: '₽', items: incomeTasks, summary: TOP_AREAS[4].summary }));
  if (lifeTasks.length) topNodes.push(makeGroupNode({ id: 'area-life', title: 'Жизнь', icon: 'LF', items: lifeTasks, summary: TOP_AREAS[5].summary }));
  if (backlogTasks.length) topNodes.push(makeGroupNode({ id: 'area-backlog', title: 'Идеи / потом', icon: 'BK', items: backlogTasks, summary: TOP_AREAS[6].summary }));

  return topNodes.slice(0, 8);
}

export function buildActionMap(snapshot) {
  const tasks = snapshot.tasks || [];
  const goals = snapshot.goals || [];
  const current = snapshot.currentFocus || {};
  const children = classifyTasks(tasks, goals);
  const activeCount = tasks.filter((task) => statusState(task.status) !== 'done').length;
  const progress = Number(current.progress) || avg(tasks) || 0;
  return {
    id: 'root',
    title: 'AI-first Life OS',
    subtitle: 'Центр системы',
    icon: 'OS',
    status: 'центр',
    state: 'active',
    progress,
    tasks: activeCount,
    summary: 'Центр навигатора. Отсюда расходятся сферы, проекты, цели и рабочие ветки.',
    details: ['Выбери планету, чтобы провалиться внутрь ветки.', 'Кнопка назад возвращает на уровень выше.', 'Данные приходят из Notion через backend snapshot.'],
    session: {
      current: current.title || 'Life OS Map: сделать карту рабочим навигатором',
      next: current.nextAction || 'Выбрать ветку и закрыть ближайший практический шаг.',
    },
    children,
  };
}

function findRecursive(node, nodeId) {
  if (!node) return null;
  if (node.id === nodeId) return node;
  for (const child of node.children || []) {
    const found = findRecursive(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function findNode(root, nodeId) {
  return findRecursive(root, nodeId) || root;
}

export function findPath(root, nodeId) {
  const path = [];
  function walk(node) {
    path.push(node.id);
    if (node.id === nodeId) return true;
    for (const child of node.children || []) {
      if (walk(child)) return true;
    }
    path.pop();
    return false;
  }
  walk(root);
  return path.length ? path : ['root'];
}

export function shortText(value = '', limit = 52) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}
