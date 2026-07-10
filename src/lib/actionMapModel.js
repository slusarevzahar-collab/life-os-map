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
    details: [session.project && `Проект: ${session.project}`, session.task && `Задача: ${session.task}`, session.energy && `Энергия: ${session.energy}`, Number(session.durationMin || 0) > 0 && `Длительность: ${session.durationMin} мин`, session.startedAt && `Начало: ${session.startedAt}`, session.finishedAt && `Завершено: ${session.finishedAt}`, useful(session.result), session.nextStep && `Следующий шаг: ${session.nextStep}`].filter(Boolean),
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
  const childLeaves = (node.children || []).reduce((sum, child) => sum + countLeaves(child, mode), 0);
  return childLeaves || node.tasks || 0;
}

function completionStatsFor(nodes = []) {
  const total = nodes.reduce((sum, node) => sum + countLeaves(node, 'all'), 0);
  const completed = nodes.reduce((sum, node) => sum + countLeaves(node, 'done'), 0);
  return { total, completed, active: Math.max(total - completed, 0), progress: completionPercent(completed, total) };
}

function makeGroupNode({ id, title, icon, items = [], summary, kind = 'group', children = [], status, details = [], sourceId = null, raw = null }) {
  const leafItems = items.map(taskToLeaf);
  const childItems = children.length ? children : leafItems;
  const activeLeaves = leafItems.filter((item) => item.state !== 'done');
  const stats = leafItems.length ? completionStatsFor(leafItems) : completionStatsFor(childItems);
  const activeChildren = childItems.filter((item) => item.state !== 'done');
  const state = stats.total && stats.completed === stats.total
    ? 'done'
    : activeLeaves.length
      ? stateFromItems(activeLeaves.map((leaf) => leaf.raw || leaf))
      : activeChildren.length
        ? stateFromItems(activeChildren)
        : statusState(status);
  return {
    id, sourceId, title, icon, status: status || stateLabel(state), state,
    progress: completionPercent(stats.completed, stats.total, raw?.progress || 0), tasks: stats.active, completedTasks: stats.completed, totalTasks: stats.total,
    summary: useful(summary) || useful(topTask(activeLeaves.map((leaf) => leaf.raw || leaf))?.nextAction) || `${title}: ${stats.completed}/${stats.total} выполнено.`,
    details: details.map(useful).filter(Boolean).length ? details.map(useful).filter(Boolean) : activeLeaves.slice(0, 4).map((task) => task.title),
    children: childItems, taskList: leafItems, kind, raw,
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
    summary: useful(topTask(items.filter((task) => !isDoneTask(task)))?.nextAction) || `Проект: ${title}`,
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
    summary: area.nextAction || area.currentState || area.goal || `Направление: ${title}`,
    status: area.status,
    details: [area.focusLevel && `Фокус: ${area.focusLevel}`, area.goal, area.currentState, area.nextAction, area.why].filter(Boolean),
    kind: LIFE_TYPES.has(typeKey(area.type)) ? 'lifeArea' : 'project',
    raw: area,
  });
}

function focusRank(node) {
  const value = key(node?.raw?.focusLevel || '');
  if (value === 'primary') return 0;
  if (value === 'secondary') return 1;
  if (value === 'background') return 2;
  return 3;
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
    const stats = taskList.length ? completionStatsFor(taskList) : completionStatsFor(childLeaves);
    const activeList = taskList.filter((leaf) => leaf.state !== 'done');
    map.set(id, {
      ...existing,
      sourceId: existing.sourceId || node.sourceId || null,
      raw: existing.raw || node.raw || null,
      summary: useful(existing.summary) || useful(node.summary),
      details: existing.details?.length ? existing.details : uniqById(taskList).slice(0, 4).map((item) => item.title),
      children: childLeaves.length ? childLeaves : taskList,
      taskList,
      tasks: stats.active,
      completedTasks: stats.completed,
      totalTasks: stats.total,
      progress: completionPercent(stats.completed, stats.total, existing.progress || node.progress || 0),
      state: stats.total && stats.completed === stats.total ? 'done' : (activeList.length ? stateFromItems(activeList.map((leaf) => leaf.raw || leaf)) : existing.state),
    });
  });
  return [...map.values()].sort((a, b) => focusRank(a) - focusRank(b) || (b.tasks || 0) - (a.tasks || 0));
}

function attachLinkedDreamsToProjects(projectNodes = [], dreams = []) {
  const claimed = new Set();
  const byProject = new Map();
  projectNodes.forEach((node) => byProject.set(slug(node.title), node));
  const mapped = new Map();
  dreams.forEach((dream) => {
    if (!dream.linkedProject) return;
    const node = byProject.get(slug(dream.linkedProject));
    if (!node) return;
    claimed.add(dream.id);
    const list = mapped.get(node.id) || [];
    list.push(dreamToLeaf(dream));
    mapped.set(node.id, list);
  });
  return {
    nodes: projectNodes.map((node) => ({ ...node, children: uniqById([...(node.children || []), ...(mapped.get(node.id) || [])]) })),
    claimed,
  };
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
      summary: useful(goal.nextAction) || useful(goal.why) || `Цель: ${goal.title}`,
      status: goal.status,
      details: [goal.area && `Область: ${goal.area}`, goal.horizon && `Горизонт: ${goal.horizon}`, goal.targetDate && `Целевая дата: ${goal.targetDate}`, goal.why && `Зачем: ${goal.why}`, goal.successCriteria && `Критерий успеха: ${goal.successCriteria}`, goal.nextAction && `Следующий шаг: ${goal.nextAction}`].filter(Boolean),
      kind: 'goal',
      raw: goal,
    });
  });
}

function byText(tasks, tokens) { return tasks.filter((task) => hasAny(`${task.project} ${task.goalName} ${task.title} ${task.tags?.join(' ')}`, tokens)); }
function makeLeafSphere({ id, title, icon, leaves, summary, kind = 'sphere' }) { return makeGroupNode({ id, title, icon, children: leaves, summary, kind }); }

function classifySnapshot(snapshot) {
  const allTasks = snapshot.tasks || [];
  const activeTasks = allTasks.filter((task) => !isDoneTask(task));
  const goals = snapshot.goals || [];
  const projectAreas = snapshot.projectAreas || [];
  const dreams = snapshot.dreams || [];
  const signals = snapshot.signals || [];
  const sessions = snapshot.sessions || [];

  const declaredProjects = projectAreas.filter((item) => PROJECT_TYPES.has(typeKey(item.type))).map((area) => areaToProjectNode(area, allTasks));
  const fallbackProjectTasks = allTasks.filter(isProjectTask);
  const fallbackProjects = groupByProject(fallbackProjectTasks.length ? fallbackProjectTasks : allTasks);
  const mergedProjects = mergeProjectNodes(declaredProjects, fallbackProjects);
  const visibleDreams = dreams.filter((dream) => key(dream.visibility) !== 'hidden until later');
  const linkedDreams = attachLinkedDreamsToProjects(mergedProjects, visibleDreams);
  const projectNodes = linkedDreams.nodes;
  const lifeAreaNodes = projectAreas.filter((item) => LIFE_TYPES.has(typeKey(item.type))).map((area) => areaToProjectNode(area, allTasks));
  const lifeDreams = visibleDreams.filter((dream) => !linkedDreams.claimed.has(dream.id)).map(dreamToLeaf);
  const hiddenDreams = dreams.filter((dream) => key(dream.visibility) === 'hidden until later').map(dreamToLeaf);
  const goalNodes = buildGoals(goals, allTasks);
  const signalNodes = signals.slice(0, 24).map(signalToLeaf);
  const sessionNodes = sessions.map(sessionToLeaf);
  const incomeTasks = byText(activeTasks, ['доход', 'клиент', 'деньги', 'money', 'sales', 'продаж', '4life', 'парсер']).map(taskToLeaf);
  const backlogTasks = activeTasks.filter((task) => ['queue', 'paused'].includes(statusState(task.status))).map(taskToLeaf);

  const topNodes = [];
  if (projectNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-projects', title: 'Проекты', icon: 'PR', children: projectNodes, summary: 'Рабочие проекты и направления, отсортированные по уровню фокуса.', kind: 'sphere' }));
  topNodes.push(makeLeafSphere({ id: 'sphere-inbox', title: 'LM Inbox', icon: 'IN', leaves: signalNodes, summary: signals.length > signalNodes.length ? `Последние ${signalNodes.length} из ${signals.length} сигналов. Полный архив доступен в LM Inbox.` : 'Входящие из Telegram-бота и других источников: что прислал, когда, что полезно и как применить.' }));
  if (goalNodes.length) topNodes.push(makeGroupNode({ id: 'sphere-goals', title: 'Цели', icon: 'GO', children: goalNodes, summary: 'Цели из Notion вместе с причинами, критериями успеха, прогрессом и связанными задачами.', kind: 'sphere' }));
  if (lifeAreaNodes.length || lifeDreams.length) topNodes.push(makeGroupNode({ id: 'sphere-life', title: 'Жизнь', icon: 'LF', children: [...lifeAreaNodes, ...lifeDreams], summary: 'Личные сферы, мечты, навыки, тело, творчество и баланс.', kind: 'sphere' }));
  if (sessionNodes.length) topNodes.push(makeLeafSphere({ id: 'sphere-sessions', title: 'Сессии', icon: 'SE', leaves: sessionNodes, summary: 'Рабочие сессии: время, результат и следующий шаг.' }));
  if (incomeTasks.length) topNodes.push(makeLeafSphere({ id: 'sphere-income', title: 'Доход', icon: '₽', leaves: incomeTasks, summary: 'Задачи и направления, связанные с клиентами, деньгами и монетизацией.' }));
  if (backlogTasks.length || hiddenDreams.length) topNodes.push(makeLeafSphere({ id: 'sphere-backlog', title: 'Идеи / потом', icon: 'BK', leaves: uniqById([...backlogTasks, ...hiddenDreams]), summary: 'Сохранённые задачи, идеи и мечты на потом, которые не должны сбивать текущий фокус.' }));
  return topNodes;
}

export function buildActionMap(snapshot) {
  const tasks = snapshot.tasks || [];
  const current = snapshot.currentFocus || {};
  const children = classifySnapshot(snapshot);
  const completedTasks = tasks.filter(isDoneTask).length;
  const totalTasks = tasks.length;
  const activeCount = Math.max(totalTasks - completedTasks, 0);
  const progress = completionPercent(completedTasks, totalTasks, current.progress || 0);
  return {
    id: 'root',
    title: 'LifeMap',
    subtitle: 'Центр системы',
    icon: 'LM',
    status: 'центр',
    state: activeCount ? 'active' : 'done',
    progress,
    tasks: activeCount,
    completedTasks,
    totalTasks,
    summary: 'Главная орбита LifeMap: проекты, цели, LM Inbox, жизнь, рабочие сессии, доход и идеи на потом.',
    details: [],
    session: {
      current: current.title || 'LifeMap: сделать карту рабочим навигатором',
      next: useful(current.nextAction) || 'Выбрать сферу и перейти к ближайшему практическому шагу.',
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
