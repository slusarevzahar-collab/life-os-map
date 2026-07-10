import { normalizeStatus } from './lifeOsData.js';

const PROJECT_TYPES = new Set(['project', 'проект', 'meta-system', 'мета-система', 'income stream', 'доход']);
const LIFE_TYPES = new Set(['life area', 'сфера жизни', 'skill', 'навык']);
const LEAF_KINDS = new Set(['task', 'signal', 'dream', 'session']);

const ICON_MAP = [
  ['lifemap', 'LM'], ['life map', 'LM'], ['life os', 'LM'], ['navigator', 'LM'], ['навиг', 'LM'],
  ['sleda', 'SD'], ['след', 'SD'], ['inbox', 'IN'], ['telegram', 'TG'], ['github', 'GH'], ['codex', 'CD'], ['canvas', 'CV'], ['notion', 'NO'],
  ['content', 'CT'], ['контент', 'CT'], ['yandex', 'YA'], ['яндекс', 'YA'], ['4life', '4L'],
  ['oracle', 'OR'], ['body', 'BD'], ['english', 'EN'], ['англий', 'EN'], ['health', 'HL'],
  ['тело', 'BD'], ['деньги', '₽'], ['доход', '₽'], ['мечт', 'DR'], ['dream', 'DR'], ['иде', 'ID'],
];

function clean(value = '') { return String(value || '').trim(); }
function key(value = '') { return clean(value).toLowerCase().replace(/ё/g, 'е'); }
function slug(value = '') { return key(value).replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function typeKey(value = '') { return key(value); }
function hasAny(text = '', tokens = []) { const source = key(text); return tokens.some((token) => source.includes(key(token))); }
function clampPercent(value = 0) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function completionPercent(completed = 0, total = 0, fallback = 0) { return total > 0 ? clampPercent((completed / total) * 100) : clampPercent(fallback); }
function isPlaceholderText(value = '') { return hasAny(value, ['редактируется поле next action', 'editing next action', 'next action в notion']); }
function useful(value = '') { const text = clean(value); return text && !isPlaceholderText(text) ? text : ''; }

function iconFor(title = '', fallback = 'ND') {
  const lower = key(title);
  const match = ICON_MAP.find(([token]) => lower.includes(token));
  if (match) return match[1];
  const words = clean(title).split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function stableThreeDigits(value = '') {
  const source = clean(value) || 'task';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
  return String(100 + (hash % 900)).padStart(3, '0');
}

function stableTaskCode(task) {
  if (task?.code) return task.code;
  const prefix = iconFor(task?.project || task?.goalName || task?.title, 'TS').replace(/[^A-Z0-9А-Я₽]/g, '').slice(0, 3) || 'TS';
  return `${prefix}-${stableThreeDigits(task?.id || task?.title)}`;
}

function statusState(status = '') {
  const normalized = normalizeStatus(status);
  if (normalized === 'now' || normalized === 'progress') return 'active';
  if (normalized === 'next') return 'next';
  if (normalized === 'paused' || normalized === 'waiting') return 'paused';
  if (normalized === 'done') return 'done';
  const lower = key(status);
  if (hasAny(lower, ['finished', 'done', 'achieved', 'готов', 'сделано', 'skipped'])) return 'done';
  if (hasAny(lower, ['active', 'progress', 'в работе', 'сейчас'])) return 'active';
  if (hasAny(lower, ['next', 'planned', 'след'])) return 'next';
  if (hasAny(lower, ['pause', 'paused', 'waiting', 'interrupted', 'пауза', 'ожид'])) return 'paused';
  return 'queue';
}

function isDoneTask(task) { return statusState(task?.status) === 'done'; }
function stateLabel(state) { return ({ active: 'в работе', next: 'следующее', paused: 'пауза', done: 'сделано', queue: 'очередь' })[state] || 'ветка'; }
function stateFromItems(items = []) {
  if (items.some((item) => statusState(item.status) === 'active' || item.state === 'active')) return 'active';
  if (items.some((item) => statusState(item.status) === 'next' || item.state === 'next')) return 'next';
  if (items.some((item) => statusState(item.status) === 'paused' || item.state === 'paused')) return 'paused';
  if (items.length && items.every((item) => statusState(item.status) === 'done' || item.state === 'done')) return 'done';
  if (items.some((item) => statusState(item.status) === 'done' || item.state === 'done')) return 'queue';
  return 'queue';
}

function topTask(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priority = (Number(a.priority) || 999) - (Number(b.priority) || 999);
    if (priority) return priority;
    return (Number(b.progress) || 0) - (Number(a.progress) || 0);
  })[0];
}

function taskToLeaf(task) {
  const note = useful(task.sessionNotes || task.notes || '');
  const nextAction = useful(task.nextAction || '');
  const done = isDoneTask(task);
  return {
    id: `task-${task.id}`, sourceId: task.id, title: task.title || 'Задача', icon: iconFor(task.project || task.goalName || task.title, 'TS'), code: stableTaskCode(task),
    status: task.status || 'задача', state: statusState(task.status), progress: done ? 100 : clampPercent(task.progress || 0), tasks: done ? 0 : 1, completedTasks: done ? 1 : 0, totalTasks: 1,
    summary: nextAction || task.lastSessionNextStep || note || task.title || 'Следующий шаг пока не указан.',
    details: [task.type && `Тип: ${task.type}`, task.energy && `Энергия: ${task.energy}`, task.goalName && `Цель: ${task.goalName}`, task.project && `Проект: ${task.project}`, Number(task.sessionCount || 0) > 0 && `Сессий: ${task.sessionCount}`, Number(task.sessionDurationMin || 0) > 0 && `Время в сессиях: ${task.sessionDurationMin} мин`, task.lastSessionResult && `Последний результат: ${task.lastSessionResult}`, note, task.dueDate && `Срок: ${task.dueDate}`].filter(Boolean),
    children: [], taskList: [], kind: 'task', raw: task,
  };
}

function signalToLeaf(signal) {
  const state = statusState(signal.status);
  const done = state === 'done';
  return {
    id: `signal-${signal.id}`, sourceId: signal.id, title: signal.title || 'Сигнал', icon: 'IN', code: `IN-${stableThreeDigits(signal.id || signal.title)}`,
    status: signal.status || signal.type || 'signal', state, progress: done ? 100 : 0, tasks: done ? 0 : 1, completedTasks: done ? 1 : 0, totalTasks: 1,
    summary: useful(signal.assistantNote) || useful(signal.summary) || useful(signal.possibleUse) || useful(signal.nextAction) || 'Сигнал сохранён в LM Inbox.',
    details: [useful(signal.summary), useful(signal.assistantNote), useful(signal.possibleUse), useful(signal.nextAction), useful(signal.sourceUrl), useful(signal.capturedAt)].filter(Boolean),
    children: [], taskList: [], kind: 'signal', raw: signal,
  };
}

function dreamToLeaf(dream) {
  const state = statusState(dream.status);
  const done = state === 'done' || hasAny(dream.status, ['achieved', 'достиг']);
  return {
    id: `dream-${dream.id}`, sourceId: dream.id, title: dream.title || 'Желание', icon: iconFor(dream.lifeSphere || dream.title, 'DR'), code: `DR-${stableThreeDigits(dream.id || dream.title)}`,
    status: dream.status || dream.type || 'dream', state: done ? 'done' : state, progress: done ? 100 : 0, tasks: done ? 0 : 1, completedTasks: done ? 1 : 0, totalTasks: 1,
    summary: useful(dream.nextStep) || useful(dream.why) || 'Цель, мечта или желание из Notion.',
    details: [dream.lifeSphere && `Сфера: ${dream.lifeSphere}`, dream.type && `Тип: ${dream.type}`, dream.visibility && `Видимость: ${dream.visibility}`, useful(dream.why), useful(dream.nextStep), dream.linkedProject && `Связанный проект: ${dream.linkedProject}`, dream.targetDate && `Целевая дата: ${dream.targetDate}`].filter(Boolean),
    children: [], taskList: [], kind: 'dream', raw: dream,
  };
}

function sessionToLeaf(session) {
  const state = statusState(session.status);
  const done = state === 'done';
  return {
    id: `session-${session.id}`, sourceId: session.id, title: session.title || session.task || 'Рабочая сессия', icon: 'SE', code: `SE-${stableThreeDigits(session.id || session.title)}`,
    status: session.status || 'session', state, progress: done ? 100 : state === 'active' ? 50 : 0, tasks: done ? 0 : 1, completedTasks: done ? 1 : 0, totalTasks: 1,
    summary: useful(session.result) || useful(session.nextStep) || useful(session.task) || 'Рабочая сессия из Notion.',
    details: [session.scope && `Охват: ${session.scope}`, session.project && `Проект: ${session.project}`, session.task && `Задача: ${session.task}`, session.energy && `Энергия: ${session.energy}`, Number(session.durationMin || 0) > 0 && `Длительность: ${session.durationMin} мин`, session.startedAt && `Начало: ${session.startedAt}`, session.finishedAt && `Завершено: ${session.finishedAt}`, useful(session.result), session.nextStep && `Следующий шаг: ${session.nextStep}`].filter(Boolean),
    children: [], taskList: [], kind: 'session', raw: session,
  };
}

function projectTitle(task) {
  const raw = clean(task.project) || clean(task.goalName) || 'Без проекта';
  const projectKey = key(raw);
  if (hasAny(projectKey, ['lifemap', 'life os', 'navigator', 'навигатор'])) return 'LifeMap';
  if (hasAny(projectKey, ['sleda', 'след'])) return 'Sleda.net';
  if (hasAny(projectKey, ['4life', 'for life'])) return '4Life';
  if (hasAny(projectKey, ['telegram', 'inbox', 'бот', 'bot'])) return 'LM Inbox';

  const titleKey = key(task.title);
  if (hasAny(titleKey, ['lifemap', 'life os', 'navigator', 'навигатор'])) return 'LifeMap';
  if (hasAny(titleKey, ['sleda.net', 'sleda', 'следы'])) return 'Sleda.net';
  if (hasAny(titleKey, ['4life'])) return '4Life';
  if (hasAny(titleKey, ['lm inbox', 'ai inbox', 'telegram bot'])) return 'LM Inbox';
  return raw;
}

function isProjectTask(task) {
  const text = `${task.project} ${task.goalName} ${task.title}`;
  return hasAny(text, ['lifemap', 'life os', 'navigator', 'навигатор', 'sleda', 'след', 'inbox', 'telegram', 'github', 'codex', '4life', 'yandex', 'яндекс', 'content', 'контент', 'oracle', 'body', 'проект']);
}

function matchTasks(tasks = [], title = '') {
  const needle = key(title);
  if (!needle) return [];
  return tasks.filter((task) => {
    const canonicalProject = projectTitle(task);
    const projectKey = key(canonicalProject);
    if (projectKey === needle || projectKey.includes(needle) || needle.includes(projectKey)) return true;
    const text = key(`${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`);
    if (text.includes(needle)) return true;
    if (needle.includes('lifemap') && hasAny(text, ['life os', 'lifemap', 'navigator'])) return true;
    if (needle.includes('навиг') && hasAny(text, ['lifemap', 'life os', 'navigator'])) return true;
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
  if (mode === 'active' && Number.isFinite(Number(node.tasks))) return Number(node.tasks) || 0;
  if (mode === 'done' && Number.isFinite(Number(node.completedTasks))) return Number(node.completedTasks) || 0;
  if (mode === 'all' && Number.isFinite(Number(node.totalTasks)) && Number(node.totalTasks) > 0) return Number(node.totalTasks) || 0;
  const list = node.taskList || [];
  if (list.length) {
    if (mode === 'active') return list.filter((item) => item.state !== 'done').length;
    if (mode === 'done') return list.filter((item) => item.state === 'done').length;
    return list.length;
  }
  return (node.children || []).reduce((sum, child) => sum + countLeaves(child, mode), 0);
}

function branchNode({ id, title, icon, subtitle, items = [], children = [], kind = 'branch', summary = '', details = [], raw = null }) {
  const taskList = uniqById(items.map((item) => LEAF_KINDS.has(item.kind) ? item : taskToLeaf(item)));
  const activeCount = taskList.filter((item) => item.state !== 'done').length;
  const doneCount = taskList.filter((item) => item.state === 'done').length;
  const state = stateFromItems(taskList.length ? taskList : children);
  const progress = completionPercent(doneCount, taskList.length, children.length ? completionPercent(children.filter((child) => child.state === 'done').length, children.length) : 0);
  return {
    id, title, icon, subtitle: subtitle || stateLabel(state), status: stateLabel(state), state,
    progress, tasks: activeCount, completedTasks: doneCount, totalTasks: taskList.length,
    summary: summary || (taskList.length ? `${activeCount} активных · ${doneCount} завершено` : `${children.length} направлений`),
    details, children, taskList, kind, raw,
  };
}

function goalNode(goal, tasks = []) {
  const taskLeaves = tasks.map(taskToLeaf);
  const state = statusState(goal.status) === 'queue' ? stateFromItems(taskLeaves) : statusState(goal.status);
  const done = taskLeaves.filter((item) => item.state === 'done').length;
  return {
    id: `goal-${goal.id}`, sourceId: goal.id, title: goal.title || goal.area || 'Цель', icon: iconFor(goal.area || goal.title, 'GL'),
    status: goal.status || stateLabel(state), state, progress: taskLeaves.length ? completionPercent(done, taskLeaves.length, goal.progress) : clampPercent(goal.progress || 0),
    tasks: taskLeaves.filter((item) => item.state !== 'done').length, completedTasks: done, totalTasks: taskLeaves.length,
    summary: useful(goal.nextAction) || useful(goal.successCriteria) || useful(goal.why) || goal.horizon || 'Цель из Notion.',
    details: [goal.area && `Сфера: ${goal.area}`, goal.horizon && `Горизонт: ${goal.horizon}`, goal.targetDate && `Целевая дата: ${goal.targetDate}`, useful(goal.why), useful(goal.successCriteria), useful(goal.nextAction)].filter(Boolean),
    children: [], taskList: taskLeaves, kind: 'goal', raw: goal,
  };
}

function focusRank(value = '') {
  const normalized = key(value);
  if (normalized === 'primary') return 0;
  if (normalized === 'secondary') return 1;
  if (normalized === 'background') return 2;
  return 3;
}

function projectNode(item, taskList = [], linkedDreams = []) {
  const taskLeaves = taskList.map(taskToLeaf);
  const dreamLeaves = linkedDreams.map(dreamToLeaf);
  const children = dreamLeaves;
  const state = statusState(item.status) === 'queue' ? stateFromItems([...taskLeaves, ...dreamLeaves]) : statusState(item.status);
  const doneTasks = taskLeaves.filter((task) => task.state === 'done').length;
  const totalTasks = taskLeaves.length;
  return {
    id: `project-${slug(item.name)}`, sourceId: item.id, title: item.name || 'Проект', icon: iconFor(item.name, 'PR'),
    status: item.status || stateLabel(state), state, progress: completionPercent(doneTasks, totalTasks),
    tasks: taskLeaves.filter((task) => task.state !== 'done').length, completedTasks: doneTasks, totalTasks,
    summary: useful(item.nextAction) || useful(item.currentState) || useful(item.goal) || useful(item.why) || 'Проект или сфера из Notion.',
    details: [item.type && `Тип: ${item.type}`, item.focusLevel && `Фокус: ${item.focusLevel}`, useful(item.goal), useful(item.currentState), useful(item.nextAction), useful(item.why)].filter(Boolean),
    children, taskList: taskLeaves, kind: typeKey(item.type) && LIFE_TYPES.has(typeKey(item.type)) ? 'lifeArea' : 'project', raw: item,
  };
}

function fallbackProjectNodes(tasks = []) {
  const names = [...new Set(tasks.filter(isProjectTask).map(projectTitle).filter(Boolean))];
  return names.map((name) => projectNode({ id: `fallback-${slug(name)}`, name, type: 'Project', status: '', focusLevel: '' }, matchTasks(tasks, name), []));
}

function declaredProjectNodes(projectAreas = [], tasks = [], dreams = []) {
  const projects = projectAreas.filter((item) => PROJECT_TYPES.has(typeKey(item.type)));
  const nodes = projects.map((item) => {
    const linkedDreams = dreams.filter((dream) => clean(dream.linkedProject) && key(dream.linkedProject) === key(item.name) && key(dream.visibility) !== 'hidden until later');
    return projectNode(item, matchTasks(tasks, item.name), linkedDreams);
  });
  return nodes.sort((a, b) => {
    const focus = focusRank(a.raw?.focusLevel) - focusRank(b.raw?.focusLevel);
    if (focus) return focus;
    const taskCount = b.totalTasks - a.totalTasks;
    if (taskCount) return taskCount;
    return clean(a.title).localeCompare(clean(b.title), 'ru');
  });
}

function lifeAreaNodes(projectAreas = [], dreams = []) {
  const explicit = projectAreas.filter((item) => LIFE_TYPES.has(typeKey(item.type))).map((item) => {
    const areaDreams = dreams.filter((dream) => key(dream.lifeSphere) === key(item.name) && key(dream.visibility) !== 'hidden until later' && !clean(dream.linkedProject));
    return branchNode({
      id: `life-${slug(item.name)}`, sourceId: item.id, title: item.name, icon: iconFor(item.name, 'LF'), subtitle: item.type || 'сфера', items: areaDreams.map(dreamToLeaf), kind: 'lifeArea',
      summary: useful(item.nextAction) || useful(item.currentState) || useful(item.goal) || useful(item.why),
      details: [item.focusLevel && `Фокус: ${item.focusLevel}`, useful(item.goal), useful(item.currentState), useful(item.nextAction), useful(item.why)].filter(Boolean), raw: item,
    });
  });

  const explicitNames = new Set(explicit.map((node) => key(node.title)));
  const derivedNames = [...new Set(dreams.filter((dream) => key(dream.visibility) !== 'hidden until later' && !clean(dream.linkedProject)).map((dream) => clean(dream.lifeSphere)).filter(Boolean))].filter((name) => !explicitNames.has(key(name)));
  const derived = derivedNames.map((name) => branchNode({ id: `life-${slug(name)}`, title: name, icon: iconFor(name, 'LF'), subtitle: 'сфера жизни', items: dreams.filter((dream) => key(dream.lifeSphere) === key(name) && key(dream.visibility) !== 'hidden until later' && !clean(dream.linkedProject)).map(dreamToLeaf), kind: 'lifeArea' }));
  return [...explicit, ...derived];
}

function signalBranch(signals = []) {
  const leaves = signals.map(signalToLeaf);
  return branchNode({ id: 'inbox-signals', title: 'Сигналы', icon: 'IN', subtitle: 'LM Inbox', items: leaves, kind: 'branch', summary: `${leaves.filter((item) => item.state !== 'done').length} активных сигналов` });
}

function orphanGoalBranch(tasks = []) {
  return branchNode({ id: 'goal-unlinked', title: 'Без цели', icon: 'UL', subtitle: 'нужно связать', items: tasks.map(taskToLeaf), kind: 'goal', summary: 'Задачи без связи с целью.' });
}

function laterBranch(dreams = []) {
  const hidden = dreams.filter((dream) => key(dream.visibility) === 'hidden until later');
  return branchNode({ id: 'later-dreams', title: 'Позже', icon: 'LT', subtitle: 'не сейчас', items: hidden.map(dreamToLeaf), kind: 'branch', summary: `${hidden.length} отложенных желаний` });
}

export function buildActionMap(snapshot = {}) {
  const tasks = snapshot.tasks || [];
  const goals = snapshot.goals || [];
  const sessions = snapshot.sessions || [];
  const projectAreas = snapshot.projectAreas || [];
  const dreams = snapshot.dreams || [];
  const signals = snapshot.signals || [];

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const tasksByGoal = new Map();
  const unlinkedTasks = [];
  tasks.forEach((task) => {
    const goalIds = (task.goalIds || []).filter((id) => goalsById.has(id));
    if (!goalIds.length) {
      unlinkedTasks.push(task);
      return;
    }
    goalIds.forEach((goalId) => { const list = tasksByGoal.get(goalId) || []; list.push(task); tasksByGoal.set(goalId, list); });
  });

  const goalNodes = goals.map((goal) => goalNode(goal, tasksByGoal.get(goal.id) || []));
  if (unlinkedTasks.length) goalNodes.push(orphanGoalBranch(unlinkedTasks));

  let projectNodes = declaredProjectNodes(projectAreas, tasks, dreams);
  if (!projectNodes.length) projectNodes = fallbackProjectNodes(tasks);

  const lifeNodes = lifeAreaNodes(projectAreas, dreams);
  const sessionLeaves = sessions.map(sessionToLeaf);
  const inboxChildren = signals.length ? [signalBranch(signals)] : [];
  const hiddenDreams = laterBranch(dreams);

  const spheres = [
    branchNode({ id: 'sphere-goals', title: 'Цели', icon: 'GO', subtitle: 'результаты', children: goalNodes, kind: 'sphere', summary: `${goals.length} целей` }),
    branchNode({ id: 'sphere-projects', title: 'Проекты', icon: 'PR', subtitle: 'активная работа', children: projectNodes, kind: 'sphere', summary: `${projectNodes.length} проектов` }),
    branchNode({ id: 'sphere-sessions', title: 'Сессии', icon: 'SE', subtitle: 'рабочий журнал', items: sessionLeaves, kind: 'sphere', summary: `${sessionLeaves.length} рабочих сессий` }),
    branchNode({ id: 'sphere-life', title: 'Жизнь', icon: 'LF', subtitle: 'сферы', children: lifeNodes, kind: 'sphere', summary: `${lifeNodes.length} сфер жизни` }),
    branchNode({ id: 'sphere-inbox', title: 'LM Inbox', icon: 'IN', subtitle: 'входящие', children: inboxChildren, kind: 'sphere', summary: `${signals.length} сигналов` }),
    branchNode({ id: 'sphere-backlog', title: 'Идеи / потом', icon: 'ID', subtitle: 'не сейчас', children: hiddenDreams.totalTasks ? [hiddenDreams] : [], kind: 'sphere', summary: `${hiddenDreams.totalTasks} отложено` }),
  ];

  const activeTasks = tasks.filter((task) => !isDoneTask(task)).length;
  const doneTasks = tasks.filter(isDoneTask).length;
  const root = {
    id: 'root', title: 'LifeMap', icon: 'LM', subtitle: 'личная система', status: 'система', state: stateFromItems(spheres),
    progress: completionPercent(doneTasks, tasks.length), tasks: activeTasks, completedTasks: doneTasks, totalTasks: tasks.length,
    summary: snapshot.currentFocus?.nextAction || snapshot.currentFocus?.title || 'Карта решений, проектов и действий.',
    details: [snapshot.currentFocus?.title && `Фокус: ${snapshot.currentFocus.title}`, snapshot.currentFocus?.project && `Проект: ${snapshot.currentFocus.project}`, snapshot.currentFocus?.nextAction].filter(Boolean),
    children: spheres, taskList: [], kind: 'root', raw: snapshot,
  };
  return root;
}

export function findNode(node, id) {
  if (!node || !id) return null;
  if (node.id === id) return node;
  for (const item of node.taskList || []) if (item.id === id) return item;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function isLeafNode(node) { return Boolean(node && LEAF_KINDS.has(node.kind)); }

export function isDoneNode(node) { return Boolean(node && node.state === 'done'); }
