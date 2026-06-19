import { normalizeStatus } from './lifeOsData.js';

const PROJECT_TYPES = new Set(['project', 'проект', 'meta-system', 'мета-система', 'income stream', 'доход']);
const LIFE_TYPES = new Set(['life area', 'сфера жизни', 'skill', 'навык']);
const LEAF_KINDS = new Set(['task', 'signal', 'dream']);

const ICON_MAP = [
  ['sleda', 'SD'], ['след', 'SD'], ['life os', 'OS'], ['navigator', 'OS'], ['навиг', 'OS'], ['map', 'OS'],
  ['inbox', 'IN'], ['telegram', 'TG'], ['github', 'GH'], ['codex', 'CD'], ['canvas', 'CV'], ['notion', 'NO'],
  ['content', 'CT'], ['контент', 'CT'], ['yandex', 'YA'], ['яндекс', 'YA'], ['4life', '4L'],
  ['oracle', 'OR'], ['body', 'BD'], ['english', 'EN'], ['англий', 'EN'], ['health', 'HL'],
  ['тело', 'BD'], ['деньги', '₽'], ['доход', '₽'], ['мечт', 'DR'], ['dream', 'DR'], ['иде', 'ID'],
];

function clean(value = '') { return String(value || '').trim(); }
function key(value = '') { return clean(value).toLowerCase().replace(/ё/g, 'е'); }
function slug(value = '') { return key(value).replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function typeKey(value = '') { return key(value); }
function hasAny(text = '', tokens = []) { const source = key(text); return tokens.some((token) => source.includes(key(token))); }

function iconFor(title = '', fallback = 'ND') {
  const lower = key(title);
  const match = ICON_MAP.find(([token]) => lower.includes(token));
  if (match) return match[1];
  const words = clean(title).split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function avg(items = [], field = 'progress') {
  const values = items.map((item) => Number(item?.[field]) || 0).filter((value) => value >= 0);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function statusState(status = '') {
  const normalized = normalizeStatus(status);
  if (normalized === 'now' || normalized === 'progress') return 'active';
  if (normalized === 'next') return 'next';
  if (normalized === 'paused' || normalized === 'waiting') return 'paused';
  if (normalized === 'done') return 'done';
  const lower = key(status);
  if (hasAny(lower, ['active', 'progress', 'в работе', 'сейчас'])) return 'active';
  if (hasAny(lower, ['next', 'след'])) return 'next';
  if (hasAny(lower, ['pause', 'paused', 'waiting', 'пауза', 'ожид'])) return 'paused';
  if (hasAny(lower, ['done', 'achieved', 'готов', 'сделано'])) return 'done';
  return 'queue';
}

function isDoneTask(task) { return statusState(task?.status) === 'done'; }

function stateFromTasks(tasks = []) {
  if (tasks.some((task) => statusState(task.status) === 'active')) return 'active';
  if (tasks.some((task) => statusState(task.status) === 'next')) return 'next';
  if (tasks.some((task) => statusState(task.status) === 'paused')) return 'paused';
  if (tasks.some((task) => statusState(task.status) === 'done')) return 'done';
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

function taskToLeaf(task) {
  return {
    id: `task-${task.id}`,
    sourceId: task.id,
    title: task.title || 'Задача',
    icon: iconFor(task.project || task.goalName || task.title, 'TS'),
    status: task.status || 'задача',
    state: statusState(task.status),
    progress: Number(task.progress) || 0,
    tasks: 1,
    summary: task.nextAction || task.summary || task.title || 'Следующий шаг пока не указан.',
    details: [task.nextAction, task.goalName, task.project, task.dueDate].filter(Boolean),
    children: [],
    taskList: [],
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
    state: statusState(signal.status),
    progress: 0,
    tasks: 1,
    summary: signal.nextAction || signal.possibleUse || signal.summary || 'Сигнал сохранён в AI Inbox.',
    details: [signal.summary, signal.possibleUse, signal.nextAction, signal.sourceUrl].filter(Boolean),
    children: [],
    taskList: [],
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
    state: statusState(dream.status),
    progress: hasAny(dream.status, ['achieved', 'достиг']) ? 100 : 0,
    tasks: 1,
    summary: dream.nextStep || dream.why || 'Цель, мечта или желание из Notion.',
    details: [dream.lifeSphere, dream.type, dream.why, dream.nextStep].filter(Boolean),
    children: [],
    taskList: [],
    kind: 'dream',
    raw: dream,
  };
}

function projectTitle(task) {
  const raw = clean(task.project) || clean(task.goalName) || 'Без проекта';
  const text = `${raw} ${task.title}`;
  if (hasAny(text, ['life os', 'navigator', 'навигатор', 'notion', 'map'])) return 'Навигатор';
  if (hasAny(text, ['sleda', 'след'])) return 'Sleda.net';
  if (hasAny(text, ['4life', 'for life'])) return '4Life';
  if (hasAny(text, ['telegram', 'inbox', 'бот', 'bot'])) return 'AI Inbox';
  return raw;
}

function isProjectTask(task) {
  const text = `${task.project} ${task.goalName} ${task.title}`;
  return hasAny(text, ['life os', 'navigator', 'навигатор', 'sleda', 'след', 'inbox', 'telegram', 'github', 'codex', '4life', 'yandex', 'яндекс', 'content', 'контент', 'oracle', 'body', 'проект']);
}

function matchTasks(tasks = [], title = '') {
  const needle = key(title);
  if (!needle) return [];
  return tasks.filter((task) => {
    const canonicalProject = projectTitle(task);
    const text = key(`${canonicalProject} ${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`);
    if (text.includes(needle) || needle.includes(key(canonicalProject))) return true;
    if (needle.includes('навиг') && hasAny(text, ['life os', 'notion', 'map', 'navigator'])) return true;
    if (needle.includes('след') && hasAny(text, ['sleda', 'след'])) return true;
    return false;
  });
}

function uniqById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function countLeaves(node, mode = 'all') {
  if (!node) return 0;
  if (LEAF_KINDS.has(node.kind)) {
    if (mode === 'active') return node.state === 'done' ? 0 : 1;
    if (mode === 'done') return node.state === 'done' ? 1 : 0;
    return 1;
  }
  const list = node.taskList || [];
  if (list.length) {
    if (mode === 'active') return list.filter((item) => item.state !== 'done').length;
    if (mode === 'done') return list.filter((item) => item.state === 'done').length;
    return list.length;
  }
  const childLeaves = (node.children || []).reduce((sum, child) => sum + countLeaves(child, mode), 0);
  return childLeaves || node.tasks || 0;
}

function makeGroupNode({ id, title, icon, items = [], summary, kind = 'group', children = [], status, details = [], sourceId = null, raw = null }) {
  const leafItems = items.map(taskToLeaf);
  const activeLeaves = leafItems.filter((item) => item.state !== 'done');
  const completedLeaves = leafItems.filter((item) => item.state === 'done');
  const childItems = children.length ? children : leafItems;
  const state = activeLeaves.length ? stateFromTasks(activeLeaves.map((leaf) => leaf.raw || leaf)) : (completedLeaves.length ? 'done' : statusState(status));
  const progress = activeLeaves.length ? avg(activeLeaves) : avg(childItems);
  return {
    id,
    sourceId,
    title,
    icon,
    status: status || stateLabel(state),
    state,
    progress,
    tasks: activeLeaves.length || childItems.reduce((sum, child) => sum + countLeaves(child, 'active'), 0),
    completedTasks: completedLeaves.length || childItems.reduce((sum, child) => sum + countLeaves(child, 'done'), 0),
    totalTasks: leafItems.length || childItems.reduce((sum, child) => sum + countLeaves(child, 'all'), 0),
    summary: summary || topTask(activeLeaves.map((leaf) => leaf.raw || leaf))?.nextAction || `${title}: ${leafItems.length || childItems.length} элементов.`,
    details: details.length ? details : activeLeaves.slice(0, 4).map((task) => task.title),
    children: childItems,
    taskList: leafItems,
    kind,
    raw,
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
    summary: topTask(items.filter((task) => !isDoneTask(task)))?.nextAction || `Проект: ${title}`,
    kind: 'project',
  }));
}

function areaToProjectNode(area, tasks = []) {
  const title = area.name || area.title || 'Без названия';
  const related = matchTasks(tasks, title);
  return makeGroupNode({
    id: `project-${slug(title)}`,
    sourceId: area.id,
    title,
    icon: iconFor(title, 'PR'),
    items: related,
    summary: area.nextAction || area.currentState || area.goal || area.why || `Проект: ${title}`,
    status: area.status,
    details: [area.goal, area.currentState, area.nextAction, area.why].filter(Boolean),
    kind: LIFE_TYPES.has(typeKey(area.type)) ? 'lifeArea' : 'project',
    raw: area,
  });
}

function mergeProjectNodes(declaredNodes = [], fallbackNodes = []) {
  const map = new Map();
  [...declaredNodes, ...fallbackNodes].forEach((node) => {
    const id = `project-${slug(node.title)}`;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, { ...node, id });
      return;
    }
    const taskList = uniqById([...(existing.taskList || []), ...(node.taskList || [])]);
    const childLeaves = uniqById([...(existing.children || []), ...(node.children || [])]);
    const activeList = taskList.filter((leaf) => leaf.state !== 'done');
    const doneList = taskList.filter((leaf) => leaf.state === 'done');
    map.set(id, {
      ...existing,
      sourceId: existing.sourceId || node.sourceId || null,
      raw: existing.raw || node.raw || null,
      summary: existing.summary || node.summary,
      details: uniqById([...activeList, ...doneList]).slice(0, 4).map((item) => item.title),
      children: childLeaves.length ? childLeaves : taskList,
      taskList,
      tasks: activeList.length || childLeaves.reduce((sum, child) => sum + countLeaves(child, 'active'), 0),
      completedTasks: doneList.length || childLeaves.reduce((sum, child) => sum + countLeaves(child, 'done'), 0),
      totalTasks: taskList.length || childLeaves.reduce((sum, child) => sum + countLeaves(child, 'all'), 0),
      progress: activeList.length ? avg(activeList) : existing.progress || node.progress || 0,
      state: activeList.length ? stateFromTasks(activeList.map((leaf) => leaf.raw || leaf)) : (doneList.length ? 'done' : existing.state),
    });
  });
  return [...map.values()].sort((a, b) => (b.tasks || 0) - (a.tasks || 0));
}

function buildGoals(goals = [], tasks = []) {
  return goals.map((goal) => {
    const related = tasks.filter((task) => task.goalIds?.includes(goal.id) || task.goalName === goal.title);
    return makeGroupNode({
      id: `goal-${goal.id}`,
      sourceId: goal.id,
      title: goal.title || 'Цель',
      icon: 'GO',
      items: related,
      summary: goal.nextAction || `Цель: ${goal.title}`,
      status: goal.status,
      details: [goal.horizon, goal.targetDate, goal.nextAction].filter(Boolean),
      kind: 'goal',
      raw: goal,
    });
  });
}

function byText(tasks, tokens) {
  return tasks.filter((task) => hasAny(`${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`, tokens));
}

function makeLeafSphere({ id, title, icon, leaves, summary, kind = 'sphere' }) {
  return makeGroupNode({ id, title, icon, children: leaves, summary, kind });
}

function classifySnapshot(snapshot) {
  const allTasks = snapshot.tasks || [];
  const activeTasks = allTasks.filter((task) => !isDoneTask(task));
  const completedTasks = allTasks.filter(isDoneTask);
  const goals = snapshot.goals || [];
  const projectAreas = snapshot.projectAreas || [];
  const dreams = snapshot.dreams || [];
  const signals = snapshot.signals || [];

  const declaredProjects = projectAreas
    .filter((item) => PROJECT_TYPES.has(typeKey(item.type)))
    .map((area) => areaToProjectNode(area, allTasks));
  const fallbackProjectTasks = allTasks.filter(isProjectTask);
  const fallbackProjects = groupByProject(fallbackProjectTasks.length ? fallbackProjectTasks : allTasks);
  const projectNodes = mergeProjectNodes(declaredProjects, fallbackProjects);

  const lifeAreaNodes = projectAreas
    .filter((item) => LIFE_TYPES.has(typeKey(item.type)))
    .map((area) => areaToProjectNode(area, allTasks));
  const lifeDreams = dreams.filter((dream) => !dream.linkedProject).map(dreamToLeaf);
  const goalNodes = buildGoals(goals, allTasks).filter((goal) => goal.tasks > 0 || goal.completedTasks > 0 || goal.progress > 0).slice(0, 10);
  const signalNodes = signals.slice(0, 12).map(signalToLeaf);
  const incomeTasks = byText(activeTasks, ['доход', 'клиент', 'деньги', 'money', 'sales', 'продаж', '4life', 'парсер']).map(taskToLeaf);
  const backlogTasks = activeTasks.filter((task) => ['queue', 'paused'].includes(statusState(task.status))).slice(0, 24).map(taskToLeaf);
  const completedLeaves = completedTasks.slice(0, 50).map(taskToLeaf);

  const topNodes = [];
  if (projectNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-projects', title: 'Проекты', icon: 'PR', children: projectNodes, summary: 'Сфера проектов: здесь лежат Навигатор, Sleda.net и другие рабочие направления.', kind: 'sphere' }));
  if (goalNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-goals', title: 'Цели', icon: 'GO', children: goalNodes, summary: 'Крупные цели из Notion, связанные с задачами.', kind: 'sphere' }));
  if (signalNodes.length) topNodes.push(makeLeafSphere({ id: 'sphere-inbox', title: 'AI Inbox', icon: 'IN', leaves: signalNodes, summary: 'Входящие AI-сигналы, Telegram-посты, идеи и материалы.' }));
  if (lifeAreaNodes.length || lifeDreams.length) topNodes.push(makeGroupNode({ id: 'sphere-life', title: 'Жизнь', icon: 'LF', children: [...lifeAreaNodes, ...lifeDreams], summary: 'Личные сферы, мечты, навыки, тело, творчество и баланс.', kind: 'sphere' }));
  if (incomeTasks.length) topNodes.push(makeLeafSphere({ id: 'sphere-income', title: 'Доход', icon: '₽', leaves: incomeTasks, summary: 'Задачи и направления, связанные с клиентами, деньгами и монетизацией.' }));
  if (backlogTasks.length) topNodes.push(makeLeafSphere({ id: 'sphere-backlog', title: 'Идеи / потом', icon: 'BK', leaves: backlogTasks, summary: 'Сохранённые задачи и идеи, которые не должны сбивать фокус.' }));
  if (completedLeaves.length) topNodes.push(makeLeafSphere({ id: 'sphere-done', title: 'Выполнено', icon: 'OK', leaves: completedLeaves, summary: 'Архив выполненных задач. Их можно вернуть обратно в работу.' }));
  return topNodes.slice(0, 8);
}

export function buildActionMap(snapshot) {
  const tasks = snapshot.tasks || [];
  const current = snapshot.currentFocus || {};
  const children = classifySnapshot(snapshot);
  const activeCount = tasks.filter((task) => !isDoneTask(task)).length;
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
    completedTasks: tasks.filter(isDoneTask).length,
    summary: 'Главная орбита. Здесь крупные сферы: проекты, цели, входящие сигналы, жизнь, доход и идеи на потом.',
    details: ['Клик по сфере открывает её как новый центр.', 'Задачи выбранной ветки показываются списком справа.', 'Данные приходят из Notion через backend snapshot.'],
    session: {
      current: current.title || 'Life OS Map: сделать карту рабочим навигатором',
      next: current.nextAction || 'Выбрать сферу и перейти к ближайшему практическому шагу.',
    },
    children,
    taskList: [],
    kind: 'root',
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
export function isLeafNode(node) { return LEAF_KINDS.has(node?.kind); }
export function isDoneNode(node) { return node?.state === 'done'; }

export function shortText(value = '', limit = 52) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}
