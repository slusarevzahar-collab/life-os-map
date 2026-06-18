import { normalizeStatus } from './lifeOsData.js';

const PROJECT_TYPES = new Set(['Project', 'Meta-system', 'Income stream']);
const LIFE_TYPES = new Set(['Life area', 'Skill']);

const PROJECT_ICON_MAP = [
  ['sleda', 'SD'], ['след', 'SD'], ['life os', 'OS'], ['navigator', 'OS'], ['навиг', 'OS'],
  ['inbox', 'IN'], ['telegram', 'TG'], ['github', 'GH'], ['codex', 'CD'], ['canvas', 'CV'],
  ['content', 'CT'], ['контент', 'CT'], ['yandex', 'YA'], ['яндекс', 'YA'], ['4life', '4L'],
  ['oracle', 'OR'], ['body', 'BD'], ['english', 'EN'], ['англий', 'EN'], ['health', 'HL'],
  ['тело', 'BD'], ['деньги', '₽'], ['доход', '₽'], ['мечт', 'DR'], ['dream', 'DR'],
];

function clean(value = '') { return String(value || '').trim(); }
function key(value = '') { return clean(value).toLowerCase().replace(/ё/g, 'е'); }
function slug(value = '') { return key(value).replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }

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

function stateFromStatus(status = '') {
  const lower = key(status);
  if (lower.includes('active') || lower.includes('progress') || lower.includes('в работе')) return 'active';
  if (lower.includes('next') || lower.includes('след')) return 'next';
  if (lower.includes('pause') || lower.includes('waiting') || lower.includes('пауза')) return 'paused';
  if (lower.includes('done') || lower.includes('achieved') || lower.includes('готов')) return 'done';
  return 'queue';
}

function stateFromTasks(tasks = []) {
  if (tasks.some((task) => statusState(task.status) === 'active')) return 'active';
  if (tasks.some((task) => statusState(task.status) === 'next')) return 'next';
  if (tasks.some((task) => statusState(task.status) === 'paused')) return 'paused';
  return 'queue';
}

function stateLabel(state) { return ({ active: 'в работе', next: 'следующее', paused: 'пауза', done: 'сделано', queue: 'очередь' })[state] || 'ветка'; }

function topTask(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priority = (Number(a.priority) || 999) - (Number(b.priority) || 999);
    if (priority) return priority;
    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  })[0];
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

function signalToLeaf(signal) {
  return {
    id: `signal-${signal.id}`,
    sourceId: signal.id,
    title: signal.title || 'Сигнал',
    icon: 'SG',
    status: signal.status || signal.type || 'signal',
    state: stateFromStatus(signal.status),
    progress: 0,
    tasks: 1,
    summary: signal.nextAction || signal.possibleUse || signal.summary || 'Сигнал сохранён в AI Inbox.',
    details: [signal.summary, signal.possibleUse, signal.nextAction].filter(Boolean),
    children: [],
    kind: 'signal',
    raw: signal,
  };
}

function dreamToLeaf(dream) {
  return {
    id: `dream-${dream.id}`,
    sourceId: dream.id,
    title: dream.title || 'Желание',
    icon: iconFor(dream.lifeSphere || dream.title, 'DR'),
    status: dream.status || dream.type || 'dream',
    state: stateFromStatus(dream.status),
    progress: key(dream.status).includes('achieved') ? 100 : 0,
    tasks: 1,
    summary: dream.nextStep || dream.why || 'Цель, мечта или желание из Notion.',
    details: [dream.lifeSphere, dream.type, dream.why, dream.nextStep].filter(Boolean),
    children: [],
    kind: 'dream',
    raw: dream,
  };
}

function projectTitle(task) {
  const raw = clean(task.project) || clean(task.goalName) || 'Без проекта';
  const text = key(`${raw} ${task.title}`);
  if (text.includes('life os') || text.includes('navigator') || text.includes('навигатор') || text.includes('notion')) return 'Навигатор';
  return raw;
}

function isProjectTask(task) {
  const text = key(`${task.project} ${task.goalName} ${task.title}`);
  return ['life os', 'navigator', 'навигатор', 'sleda', 'след', 'inbox', 'telegram', 'github', 'codex', '4life', 'yandex', 'яндекс', 'content', 'контент', 'oracle', 'body'].some((token) => text.includes(token));
}

function matchTasks(tasks = [], title = '') {
  const needle = key(title);
  if (!needle) return [];
  return tasks.filter((task) => {
    const text = key(`${projectTitle(task)} ${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`);
    return text.includes(needle) || needle.includes(key(projectTitle(task)));
  });
}

function makeGroupNode({ id, title, icon, items = [], summary, kind = 'group', children, status, details = [] }) {
  const childItems = children || items.map(taskToLeaf);
  const state = items.length ? stateFromTasks(items) : stateFromStatus(status);
  const childProgress = childItems.length ? avg(childItems) : 0;
  return {
    id,
    title,
    icon,
    status: status || stateLabel(state),
    state,
    progress: items.length ? avg(items) : childProgress,
    tasks: items.length || childItems.reduce((sum, child) => sum + (child.tasks || 1), 0),
    summary: summary || topTask(items)?.nextAction || `${title}: ${items.length || childItems.length} элементов.`,
    details: details.length ? details : items.slice(0, 4).map((task) => task.title),
    children: childItems,
    taskList: items.map(taskToLeaf),
    kind,
  };
}

function groupByProject(tasks = []) {
  const map = new Map();
  tasks.forEach((task) => {
    const title = projectTitle(task);
    if (!map.has(title)) map.set(title, []);
    map.get(title).push(task);
  });
  return [...map.entries()].map(([title, items]) => makeGroupNode({
    id: `project-${slug(title)}`,
    title,
    icon: iconFor(title, 'PR'),
    items,
    summary: topTask(items)?.nextAction || `Проект: ${title}`,
    kind: 'project',
  }));
}

function areaToProjectNode(area, tasks = []) {
  const title = area.name || area.title || 'Без названия';
  const related = matchTasks(tasks, title);
  return makeGroupNode({
    id: `project-${slug(title)}`,
    title,
    icon: iconFor(title, 'PR'),
    items: related,
    summary: area.nextAction || area.currentState || area.goal || area.why || `Проект: ${title}`,
    status: area.status,
    details: [area.goal, area.currentState, area.nextAction, area.why].filter(Boolean),
    kind: area.type === 'Skill' || area.type === 'Life area' ? 'lifeArea' : 'project',
  });
}

function buildGoals(goals = [], tasks = []) {
  return goals.map((goal) => {
    const related = tasks.filter((task) => task.goalIds?.includes(goal.id) || task.goalName === goal.title);
    return makeGroupNode({
      id: `goal-${goal.id}`,
      title: goal.title || 'Цель',
      icon: 'GO',
      items: related,
      summary: goal.nextAction || `Цель: ${goal.title}`,
      status: goal.status,
      kind: 'goal',
    });
  });
}

function byText(tasks, tokens) {
  return tasks.filter((task) => tokens.some((token) => key(`${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`).includes(token)));
}

function classifySnapshot(snapshot) {
  const activeTasks = (snapshot.tasks || []).filter((task) => statusState(task.status) !== 'done');
  const goals = snapshot.goals || [];
  const projectAreas = snapshot.projectAreas || [];
  const dreams = snapshot.dreams || [];
  const signals = snapshot.signals || [];
  const projectAreaNodes = projectAreas.filter((item) => PROJECT_TYPES.has(item.type)).map((area) => areaToProjectNode(area, activeTasks));
  const fallbackProjects = groupByProject(activeTasks.filter(isProjectTask).length ? activeTasks.filter(isProjectTask) : activeTasks);
  const projectNodes = projectAreaNodes.length ? projectAreaNodes : fallbackProjects;
  const lifeAreaNodes = projectAreas.filter((item) => LIFE_TYPES.has(item.type)).map((area) => areaToProjectNode(area, activeTasks));
  const lifeDreams = dreams.filter((dream) => !dream.linkedProject).map(dreamToLeaf);
  const goalNodes = buildGoals(goals, activeTasks).filter((goal) => goal.tasks > 0 || goal.progress > 0).slice(0, 10);
  const signalNodes = signals.slice(0, 12).map(signalToLeaf);
  const incomeTasks = byText(activeTasks, ['доход', 'клиент', 'деньги', 'money', 'sales', 'продаж', '4life', 'парсер']);
  const backlogTasks = activeTasks.filter((task) => ['queue', 'paused'].includes(statusState(task.status))).slice(0, 20);
  const topNodes = [];
  if (projectNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-projects', title: 'Проекты', icon: 'PR', children: projectNodes, summary: 'Сфера проектов: здесь лежат Навигатор, Sleda.net и другие рабочие направления.', kind: 'sphere' }));
  if (goalNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-goals', title: 'Цели', icon: 'GO', children: goalNodes, summary: 'Крупные цели из Notion, связанные с задачами.', kind: 'sphere' }));
  if (signalNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-inbox', title: 'AI Inbox', icon: 'IN', children: signalNodes, summary: 'Входящие AI-сигналы, Telegram-посты, идеи и материалы.', kind: 'sphere' }));
  if (lifeAreaNodes.length || lifeDreams.length) topNodes.push(makeGroupNode({ id: 'sphere-life', title: 'Жизнь', icon: 'LF', children: [...lifeAreaNodes, ...lifeDreams], summary: 'Личные сферы, мечты, навыки, тело, творчество и баланс.', kind: 'sphere' }));
  if (incomeTasks.length) topNodes.push(makeGroupNode({ id: 'sphere-income', title: 'Доход', icon: '₽', items: incomeTasks, summary: 'Задачи и направления, связанные с клиентами, деньгами и монетизацией.', kind: 'sphere' }));
  if (backlogTasks.length) topNodes.push(makeGroupNode({ id: 'sphere-backlog', title: 'Идеи / потом', icon: 'BK', items: backlogTasks, summary: 'Сохранённые задачи и идеи, которые не должны сбивать фокус.', kind: 'sphere' }));
  return topNodes.slice(0, 8);
}

export function buildActionMap(snapshot) {
  const tasks = snapshot.tasks || [];
  const current = snapshot.currentFocus || {};
  const children = classifySnapshot(snapshot);
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
    summary: 'Главная орбита. Здесь должны быть крупные сферы: проекты, цели, входящие сигналы, жизнь, доход и идеи на потом.',
    details: ['Клик по сфере открывает её как новый центр.', 'Задачи выбранной ветки показываются списком справа.', 'Данные приходят из Notion через backend snapshot.'],
    session: {
      current: current.title || 'Life OS Map: сделать карту рабочим навигатором',
      next: current.nextAction || 'Выбрать сферу и перейти к ближайшему практическому шагу.',
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

export function findNode(root, nodeId) { return findRecursive(root, nodeId) || root; }

export function shortText(value = '', limit = 52) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}
