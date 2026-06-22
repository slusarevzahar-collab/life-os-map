import { Client } from '@notionhq/client';

export const mockSnapshot = {
  meta: {
    source: 'mock-backend-snapshot',
    version: '0.1.0',
    updatedAt: new Date().toISOString(),
    warnings: [],
  },
  currentFocus: {
    id: 'task_lifemap',
    title: 'LifeMap',
    project: 'LifeMap',
    status: 'in_progress',
    progress: 55,
    nextAction: 'Подключить карту к данным через backend snapshot.',
  },
  goals: [
    {
      id: 'goal_lifemap_mvp',
      title: 'Собрать рабочую LifeMap + AI Inbox MVP',
      area: 'LifeMap',
      horizon: '1 month',
      progress: 38,
      targetDate: '2026-06-30',
      status: 'active',
      nextAction: 'Заменить mock snapshot на Notion workspace snapshot.',
    },
  ],
  tasks: [
    {
      id: 'task_lifemap',
      title: 'Подготовить Notion data adapter для LifeMap',
      project: 'Life OS',
      goalName: 'Life OS',
      status: 'in_progress',
      progress: 55,
      priority: 1,
      dueDate: '2026-06-04',
      nextAction: 'Заменить mock data на backend response.',
      sessionNotes: '',
    },
  ],
  sessions: [],
  projectAreas: [],
  dreams: [],
  signals: [],
  planning: { onTrack: 1, next: 1, waiting: 0, overdue: 0, done: 0 },
};

function plainText(richText = []) { return richText.map((item) => item.plain_text || '').join('').trim(); }
function selectName(property) { return property?.select?.name || property?.status?.name || null; }
function multiSelectNames(property) { return Array.isArray(property?.multi_select) ? property.multi_select.map((item) => item.name) : []; }
function titleText(property) { return plainText(property?.title || []); }
function richText(property) { return plainText(property?.rich_text || []); }
function numberValue(property) { return typeof property?.number === 'number' ? property.number : 0; }
function dateStart(property) { return property?.date?.start || null; }
function urlValue(property) { return property?.url || null; }
function relationIds(property) { return Array.isArray(property?.relation) ? property.relation.map((item) => item.id) : []; }

function findProp(props, names) {
  for (const name of names) if (props[name]) return props[name];
  return undefined;
}
function firstTitle(props, names) { return titleText(findProp(props, names)); }
function firstRichText(props, names) { return richText(findProp(props, names)); }
function firstSelect(props, names) { return selectName(findProp(props, names)); }
function firstMultiSelect(props, names) { return multiSelectNames(findProp(props, names)); }
function firstNumber(props, names) { return numberValue(findProp(props, names)); }
function firstDate(props, names) { return dateStart(findProp(props, names)); }
function firstUrl(props, names) { return urlValue(findProp(props, names)); }

function textProperty(value = '') {
  const content = String(value || '');
  return content ? { rich_text: [{ text: { content } }] } : { rich_text: [] };
}
function titleProperty(value = '') { return { title: [{ text: { content: String(value || 'Untitled') } }] }; }
function selectProperty(value) { return value ? { select: { name: String(value) } } : undefined; }
function numberProperty(value) { const number = Number(value); return Number.isFinite(number) ? { number } : undefined; }
function dateProperty(value) { return value ? { date: { start: value } } : undefined; }
function cleanProperties(properties) { return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null)); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }

function normalizeKey(value = '') {
  return String(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function mapNotionTask(page) {
  const props = page.properties || {};
  const goalName = firstSelect(props, ['Goal', 'Цель']) || '';
  return {
    id: page.id,
    title: firstTitle(props, ['Task', 'Name', 'Название', 'Задача']) || 'Untitled task',
    project: firstSelect(props, ['Project', 'Проект']) || 'Life OS',
    goalName,
    goalKey: normalizeKey(goalName),
    status: firstSelect(props, ['Status', 'Статус']) || 'unknown',
    progress: firstNumber(props, ['Progress', 'Прогресс', 'Progress %']) || 0,
    priority: firstNumber(props, ['Priority', 'Приоритет']) || 0,
    dueDate: firstDate(props, ['Due Date', 'Дата', 'Срок', 'Deadline']) || null,
    plannedDate: firstDate(props, ['Planned Date', 'Плановая дата']) || null,
    lastTouched: firstDate(props, ['Last Touched', 'Последнее касание']) || null,
    startedAt: firstDate(props, ['Started At', 'Start', 'Начало']) || null,
    finishedAt: firstDate(props, ['Finished At', 'Finish', 'Конец', 'Завершено']) || null,
    durationMin: firstNumber(props, ['Duration Min', 'Duration', 'Минуты', 'Длительность']) || 0,
    timeDebt: firstNumber(props, ['Time Debt', 'Долг времени']) || 0,
    rescheduleCount: firstNumber(props, ['Reschedule Count', 'Переносы']) || 0,
    nextAction: firstRichText(props, ['Next Action', 'Следующее действие', 'Следующий шаг']) || '',
    sessionNotes: firstRichText(props, ['Session Notes', 'Notes', 'Заметки', 'Заметка']) || '',
    goalIds: relationIds(findProp(props, ['Goal Link', 'Goals Relation', 'Goals', 'Цель-связь', 'Цели'])),
    tags: firstMultiSelect(props, ['Tags', 'Теги']),
  };
}

function mapNotionGoal(page) {
  const props = page.properties || {};
  const title = firstTitle(props, ['Goal', 'Name', 'Название', 'Цель']) || 'Untitled goal';
  const area = firstSelect(props, ['Area', 'Направление']) || title;
  return {
    id: page.id,
    title,
    area,
    goalKey: normalizeKey(area || title),
    titleKey: normalizeKey(title),
    status: firstSelect(props, ['Status', 'Статус']) || 'unknown',
    horizon: firstSelect(props, ['Horizon', 'Период', 'Горизонт']) || firstRichText(props, ['Horizon', 'Период', 'Горизонт']) || '',
    progress: firstNumber(props, ['Progress', 'Прогресс', 'Progress %']) || 0,
    targetDate: firstDate(props, ['Target Date', 'Due Date', 'Дата', 'Срок', 'Deadline']) || null,
    nextAction: firstRichText(props, ['Next Action', 'Следующее действие', 'Следующий шаг']) || '',
    taskIds: relationIds(findProp(props, ['Tasks', 'Task', 'Задачи', 'Задача'])),
  };
}

function mapNotionProjectArea(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    name: firstTitle(props, ['Name', 'Название']) || 'Untitled area',
    type: firstSelect(props, ['Type']) || '',
    status: firstSelect(props, ['Status']) || '',
    focusLevel: firstSelect(props, ['Focus level']) || '',
    goal: firstRichText(props, ['Goal']) || '',
    currentState: firstRichText(props, ['Current state']) || '',
    nextAction: firstRichText(props, ['Next action', 'Next Action']) || '',
    why: firstRichText(props, ['Why it matters']) || '',
    updatedAt: firstDate(props, ['Date updated']) || null,
  };
}

function mapNotionDream(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: firstTitle(props, ['Goal / Dream']) || 'Untitled dream',
    type: firstSelect(props, ['Type']) || '',
    status: firstSelect(props, ['Status']) || '',
    visibility: firstSelect(props, ['Visibility']) || '',
    lifeSphere: firstSelect(props, ['Life sphere']) || '',
    linkedProject: firstRichText(props, ['Linked project']) || '',
    nextStep: firstRichText(props, ['Next gentle step']) || '',
    why: firstRichText(props, ['Why I want it']) || '',
    targetDate: firstDate(props, ['Target date']) || null,
    capturedAt: firstDate(props, ['Date captured']) || null,
  };
}

function mapNotionSignal(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: firstTitle(props, ['Signal']) || 'Untitled signal',
    type: firstSelect(props, ['Type']) || '',
    status: firstSelect(props, ['Status']) || '',
    priority: firstSelect(props, ['Priority']) || '',
    relatedProjects: firstMultiSelect(props, ['Related projects']),
    summary: firstRichText(props, ['Summary']) || '',
    nextAction: firstRichText(props, ['Next action', 'Next Action']) || '',
    possibleUse: firstRichText(props, ['Possible use']) || '',
    sourceUrl: firstUrl(props, ['Source URL']) || '',
    capturedAt: firstDate(props, ['Date captured']) || null,
  };
}

function mapNotionSession(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: firstTitle(props, ['Session', 'Name', 'Название', 'Сессия']) || 'Work session',
    task: firstRichText(props, ['Task', 'Задача']) || '',
    project: firstSelect(props, ['Project', 'Проект']) || 'Life OS',
    status: firstSelect(props, ['Status', 'Статус']) || 'unknown',
    startedAt: firstDate(props, ['Started At', 'Start', 'Начало']) || null,
    finishedAt: firstDate(props, ['Finished At', 'Finish', 'Конец', 'Завершено']) || null,
    durationMin: firstNumber(props, ['Duration Min', 'Duration', 'Минуты', 'Длительность']) || 0,
    result: firstRichText(props, ['Result', 'Результат']) || '',
    nextStep: firstRichText(props, ['Next Step', 'Next Action', 'Следующий шаг']) || '',
  };
}

function attachGoalsToTasks(tasks, goals) {
  const byKey = new Map();
  goals.forEach((goal) => {
    if (goal.goalKey) byKey.set(goal.goalKey, goal.id);
    if (goal.titleKey) byKey.set(goal.titleKey, goal.id);
  });
  return tasks.map((task) => {
    if (task.goalIds?.length) return task;
    const matchedGoalId = byKey.get(task.goalKey) || byKey.get(normalizeKey(task.project));
    return matchedGoalId ? { ...task, goalIds: [matchedGoalId] } : task;
  });
}

function buildPlanning(tasks) {
  return tasks.reduce((acc, task) => {
    const status = String(task.status || '').toLowerCase();
    if (status.includes('done') || status.includes('готово')) acc.done += 1;
    else if (status.includes('overdue') || status.includes('просроч')) acc.overdue += 1;
    else if (status.includes('waiting') || status.includes('ожид')) acc.waiting += 1;
    else if (status.includes('next') || status.includes('след')) acc.next += 1;
    else acc.onTrack += 1;
    return acc;
  }, { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 });
}

const reportedDatabaseWarnings = new Set();

function isObjectNotFound(error) {
  return error?.code === 'object_not_found' || /could not find database/i.test(error?.message || '');
}

function databaseAccessMessage(label, databaseId) {
  return `${label}: база ${databaseId} не найдена или не открыта для интеграции Life OS Map Backend.`;
}

async function queryDatabase(notion, databaseId, mapper, label, warnings, options = {}) {
  if (!databaseId) return [];
  const required = Boolean(options.required);
  try {
    const response = await notion.databases.query({ database_id: databaseId, page_size: 50 });
    return response.results.map(mapper);
  } catch (error) {
    const message = isObjectNotFound(error) ? databaseAccessMessage(label, databaseId) : `${label}: ${error.message}`;
    warnings.push(message);

    const warningKey = `${label}:${databaseId}:${error?.code || error?.message}`;
    if (!reportedDatabaseWarnings.has(warningKey)) {
      reportedDatabaseWarnings.add(warningKey);
      const log = required ? console.warn : console.info;
      log(`LifeMap ${message}`);
    }
    return [];
  }
}

function chooseCurrentFocus(tasks) {
  return tasks.find((task) => String(task.status).toLowerCase().includes('now')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('сейчас')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('in progress')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('в работе')) ||
    tasks[0];
}

export async function getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId }) {
  if (!notionToken || !tasksDbId) return null;
  const notion = new Client({ auth: notionToken });
  const warnings = [];
  const rawTasks = (await queryDatabase(notion, tasksDbId, mapNotionTask, 'Tasks DB', warnings, { required: true })).sort((a, b) => (a.priority || 999) - (b.priority || 999));
  const goals = (await queryDatabase(notion, goalsDbId, mapNotionGoal, 'Goals DB', warnings)).sort((a, b) => (b.progress || 0) - (a.progress || 0));
  const tasks = attachGoalsToTasks(rawTasks, goals);
  const sessions = (await queryDatabase(notion, sessionsDbId, mapNotionSession, 'Work Sessions DB', warnings)).sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  const projectAreas = await queryDatabase(notion, projectsDbId, mapNotionProjectArea, 'Projects & Life Areas DB', warnings);
  const dreams = await queryDatabase(notion, dreamsDbId, mapNotionDream, 'Goals, Dreams & Desires DB', warnings);
  const signals = await queryDatabase(notion, signalsDbId, mapNotionSignal, 'AI Signals Inbox DB', warnings);
  const currentFocus = chooseCurrentFocus(tasks);
  return {
    meta: {
      source: 'notion-live-workspace',
      version: '0.8.1',
      updatedAt: new Date().toISOString(),
      warnings,
      connected: {
        tasks: Boolean(tasksDbId && !warnings.some((item) => item.startsWith('Tasks DB:'))),
        goals: Boolean(goalsDbId && !warnings.some((item) => item.startsWith('Goals DB:'))),
        sessions: Boolean(sessionsDbId && !warnings.some((item) => item.startsWith('Work Sessions DB:'))),
        projectAreas: Boolean(projectsDbId && !warnings.some((item) => item.startsWith('Projects & Life Areas DB:'))),
        dreams: Boolean(dreamsDbId && !warnings.some((item) => item.startsWith('Goals, Dreams & Desires DB:'))),
        signals: Boolean(signalsDbId && !warnings.some((item) => item.startsWith('AI Signals Inbox DB:'))),
      },
    },
    currentFocus: currentFocus ? {
      id: currentFocus.id,
      title: currentFocus.title,
      project: currentFocus.project,
      status: currentFocus.status,
      progress: currentFocus.progress,
      nextAction: currentFocus.nextAction,
    } : null,
    tasks,
    goals,
    sessions,
    projectAreas,
    dreams,
    signals,
    planning: buildPlanning(tasks),
  };
}

export async function updateTaskEvent({ notionToken, taskId, event }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!taskId) throw new Error('Task id is missing.');
  const notion = new Client({ auth: notionToken });
  const properties = {};
  if (hasOwn(event, 'status')) properties.Status = selectProperty(event.status);
  if (hasOwn(event, 'progress')) properties.Progress = numberProperty(event.progress);
  if (hasOwn(event, 'priority')) properties.Priority = numberProperty(event.priority);
  if (hasOwn(event, 'dueDate')) properties['Due Date'] = dateProperty(event.dueDate);
  if (hasOwn(event, 'plannedDate')) properties['Planned Date'] = dateProperty(event.plannedDate);
  if (hasOwn(event, 'startedAt')) properties['Started At'] = dateProperty(event.startedAt);
  if (hasOwn(event, 'finishedAt')) properties['Finished At'] = dateProperty(event.finishedAt);
  if (hasOwn(event, 'durationMin')) properties['Duration Min'] = numberProperty(event.durationMin);
  if (hasOwn(event, 'timeDebt')) properties['Time Debt'] = numberProperty(event.timeDebt);
  if (hasOwn(event, 'rescheduleCount')) properties['Reschedule Count'] = numberProperty(event.rescheduleCount);
  if (hasOwn(event, 'nextAction')) properties['Next Action'] = textProperty(event.nextAction);
  if (hasOwn(event, 'sessionNotes')) properties['Session Notes'] = textProperty(event.sessionNotes);
  if (hasOwn(event, 'title')) properties.Task = titleProperty(event.title);
  await notion.pages.update({ page_id: taskId, properties: cleanProperties(properties) });
  return { id: taskId, updated: true };
}

export async function createWorkSession({ notionToken, sessionsDbId, payload = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!sessionsDbId) throw new Error('NOTION_SESSIONS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const properties = cleanProperties({
    Session: titleProperty(payload.title || payload.session || 'LifeMap session'),
    Task: textProperty(payload.task || ''),
    Project: selectProperty(payload.project || 'LifeMap'),
    Status: selectProperty(payload.status || 'Done'),
    'Started At': dateProperty(payload.startedAt),
    'Finished At': dateProperty(payload.finishedAt || new Date().toISOString()),
    'Duration Min': numberProperty(payload.durationMin),
    Result: textProperty(payload.result || ''),
    'Next Step': textProperty(payload.nextStep || ''),
  });
  const page = await notion.pages.create({ parent: { database_id: sessionsDbId }, properties });
  return { id: page.id, created: true };
}

export async function updateItemTitle({ notionToken, itemId, kind, title }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!itemId) throw new Error('Item id is missing.');
  if (!title) throw new Error('Title is missing.');
  const notion = new Client({ auth: notionToken });
  const propertyByKind = {
    task: 'Task',
    goal: 'Goal',
    projectArea: 'Name',
    dream: 'Goal / Dream',
    signal: 'Signal',
    session: 'Session',
  };
  const prop = propertyByKind[kind] || 'Name';
  await notion.pages.update({ page_id: itemId, properties: { [prop]: titleProperty(title) } });
  return { id: itemId, updated: true, title };
}
