import { Client } from '@notionhq/client';

const RICH_TEXT_LIMIT = 1900;

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
    { id: 'goal_lifemap_mvp', title: 'Собрать рабочую LifeMap + AI Inbox MVP', area: 'LifeMap', horizon: '1 month', progress: 38, targetDate: '2026-06-30', status: 'active', nextAction: 'Заменить mock snapshot на Notion workspace snapshot.' },
  ],
  tasks: [
    { id: 'task_lifemap', code: 'LM-100', title: 'Подготовить Notion data adapter для LifeMap', project: 'LifeMap', goalName: 'LifeMap', status: 'in_progress', progress: 55, priority: 1, dueDate: '2026-06-04', nextAction: 'Заменить mock data на backend response.', sessionNotes: '' },
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

function findProp(props, names) { for (const name of names) if (props[name]) return props[name]; return undefined; }
function firstTitle(props, names) { return titleText(findProp(props, names)); }
function firstRichText(props, names) { return richText(findProp(props, names)); }
function firstSelect(props, names) { return selectName(findProp(props, names)); }
function firstMultiSelect(props, names) { return multiSelectNames(findProp(props, names)); }
function firstNumber(props, names) { return numberValue(findProp(props, names)); }
function firstDate(props, names) { return dateStart(findProp(props, names)); }
function firstUrl(props, names) { return urlValue(findProp(props, names)); }

function chunkText(value = '') {
  const content = String(value || '');
  if (!content) return [];
  const chunks = [];
  for (let index = 0; index < content.length; index += RICH_TEXT_LIMIT) chunks.push(content.slice(index, index + RICH_TEXT_LIMIT));
  return chunks;
}
function textProperty(value = '') {
  const chunks = chunkText(value);
  return chunks.length ? { rich_text: chunks.map((content) => ({ text: { content } })) } : { rich_text: [] };
}
function titleProperty(value = '') { return { title: [{ text: { content: String(value || 'Untitled').slice(0, 1900) } }] }; }
function selectProperty(value) { return value ? { select: { name: String(value) } } : undefined; }
function uniqueList(values = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(',');
  const seen = new Set();
  return source.map((name) => String(name || '').trim()).filter(Boolean).filter((name) => {
    const key = normalizeKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function multiSelectProperty(values = []) { const clean = uniqueList(values); return clean.length ? { multi_select: clean.map((name) => ({ name })) } : undefined; }
function numberProperty(value) { const number = Number(value); return Number.isFinite(number) ? { number } : undefined; }
function dateProperty(value) { return value ? { date: { start: value } } : undefined; }
function urlProperty(value) { return value ? { url: String(value) } : undefined; }
function cleanProperties(properties) { return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null)); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }

function normalizeKey(value = '') { return String(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
function useful(value = '') { return String(value || '').trim(); }

function stableThreeDigits(value = '') {
  const source = String(value || 'task');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
  return String(100 + (hash % 900)).padStart(3, '0');
}

function codePrefix(project = '', title = '', goalName = '') {
  const text = normalizeKey(`${project} ${goalName} ${title}`);
  if (text.includes('lifemap') || text.includes('life os') || text.includes('navigator') || text.includes('навиг')) return 'LM';
  if (text.includes('sleda') || text.includes('след')) return 'SD';
  if (text.includes('inbox') || text.includes('telegram') || text.includes('бот')) return 'IN';
  if (text.includes('content') || text.includes('контент')) return 'CT';
  if (text.includes('github') || text.includes('codex')) return 'GH';
  if (text.includes('4life') || text.includes('for life')) return '4L';
  if (text.includes('yandex') || text.includes('яндекс')) return 'YA';
  const words = String(project || goalName || title || 'task').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || 'T'}${words[1][0] || 'S'}`.toUpperCase();
  return (words[0] || 'TS').slice(0, 2).toUpperCase();
}

function firstTaskCode(props) { return firstRichText(props, ['Code', 'Task Code', 'Код', 'ID', 'Short ID']) || firstTitle(props, ['Code', 'Task Code', 'Код', 'ID', 'Short ID']); }
function makeTaskCode(pageId, props, { project, title, goalName }) { const explicit = firstTaskCode(props); return explicit || `${codePrefix(project, title, goalName)}-${stableThreeDigits(pageId || title)}`; }

function mapNotionTask(page) {
  const props = page.properties || {};
  const title = firstTitle(props, ['Task', 'Name', 'Название', 'Задача']) || 'Untitled task';
  const project = firstSelect(props, ['Project', 'Проект']) || 'LifeMap';
  const goalName = firstSelect(props, ['Goal', 'Цель']) || '';
  return {
    id: page.id,
    code: makeTaskCode(page.id, props, { project, title, goalName }),
    title,
    project,
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
  return { id: page.id, title, area, goalKey: normalizeKey(area || title), titleKey: normalizeKey(title), status: firstSelect(props, ['Status', 'Статус']) || 'unknown', horizon: firstSelect(props, ['Horizon', 'Период', 'Горизонт']) || firstRichText(props, ['Horizon', 'Период', 'Горизонт']) || '', progress: firstNumber(props, ['Progress', 'Прогресс', 'Progress %']) || 0, targetDate: firstDate(props, ['Target Date', 'Due Date', 'Дата', 'Срок', 'Deadline']) || null, nextAction: firstRichText(props, ['Next Action', 'Следующее действие', 'Следующий шаг']) || '', taskIds: relationIds(findProp(props, ['Tasks', 'Task', 'Задачи', 'Задача'])) };
}

function mapNotionProjectArea(page) {
  const props = page.properties || {};
  return { id: page.id, name: firstTitle(props, ['Name', 'Название']) || 'Untitled area', type: firstSelect(props, ['Type']) || '', status: firstSelect(props, ['Status']) || '', focusLevel: firstSelect(props, ['Focus level']) || '', goal: firstRichText(props, ['Goal']) || '', currentState: firstRichText(props, ['Current state']) || '', nextAction: firstRichText(props, ['Next action', 'Next Action']) || '', why: firstRichText(props, ['Why it matters']) || '', updatedAt: firstDate(props, ['Date updated']) || null };
}

function mapNotionDream(page) {
  const props = page.properties || {};
  return { id: page.id, title: firstTitle(props, ['Goal / Dream']) || 'Untitled dream', type: firstSelect(props, ['Type']) || '', status: firstSelect(props, ['Status']) || '', visibility: firstSelect(props, ['Visibility']) || '', lifeSphere: firstSelect(props, ['Life sphere']) || '', linkedProject: firstRichText(props, ['Linked project']) || '', nextStep: firstRichText(props, ['Next gentle step']) || '', why: firstRichText(props, ['Why I want it']) || '', targetDate: firstDate(props, ['Target date']) || null, capturedAt: firstDate(props, ['Date captured']) || null };
}

function signalTextFromProps(props) {
  return firstRichText(props, ['Summary', 'Original text', 'Original Text', 'Raw text', 'Raw Text', 'Telegram text', 'Telegram Text', 'Message', 'Content', 'Full text', 'Full Text', 'Assistant note', 'Assistant Note']) || '';
}

function mapNotionSignal(page) {
  const props = page.properties || {};
  const assistantNote = firstRichText(props, ['Assistant note', 'Assistant Note']) || '';
  const summary = signalTextFromProps(props);
  return {
    id: page.id,
    title: firstTitle(props, ['Signal']) || 'Untitled signal',
    type: firstSelect(props, ['Type']) || firstSelect(props, ['AI Category']) || '',
    aiCategory: firstSelect(props, ['AI Category']) || '',
    assetTypes: firstMultiSelect(props, ['Asset type', 'Asset Type']),
    decision: firstSelect(props, ['Decision']) || '',
    status: firstSelect(props, ['Status']) || '',
    priority: firstSelect(props, ['Priority']) || '',
    relatedProjects: firstMultiSelect(props, ['Related projects']),
    summary,
    assistantNote,
    nextAction: firstRichText(props, ['Next action', 'Next Action']) || '',
    possibleUse: firstRichText(props, ['Possible use']) || '',
    sourceUrl: firstUrl(props, ['Source URL']) || '',
    capturedAt: firstDate(props, ['Date captured']) || null,
  };
}

function mapNotionSession(page) {
  const props = page.properties || {};
  return { id: page.id, title: firstTitle(props, ['Session', 'Name', 'Название', 'Сессия']) || 'Work session', task: firstRichText(props, ['Task', 'Задача']) || '', project: firstSelect(props, ['Project', 'Проект']) || 'LifeMap', status: firstSelect(props, ['Status', 'Статус']) || 'unknown', startedAt: firstDate(props, ['Started At', 'Start', 'Начало']) || null, finishedAt: firstDate(props, ['Finished At', 'Finish', 'Конец', 'Завершено']) || null, durationMin: firstNumber(props, ['Duration Min', 'Duration', 'Минуты', 'Длительность']) || 0, result: firstRichText(props, ['Result', 'Результат']) || '', nextStep: firstRichText(props, ['Next Step', 'Next Action', 'Следующий шаг']) || '' };
}

function attachGoalsToTasks(tasks, goals) {
  const byKey = new Map();
  goals.forEach((goal) => { if (goal.goalKey) byKey.set(goal.goalKey, goal.id); if (goal.titleKey) byKey.set(goal.titleKey, goal.id); });
  return tasks.map((task) => { if (task.goalIds?.length) return task; const matchedGoalId = byKey.get(task.goalKey) || byKey.get(normalizeKey(task.project)); return matchedGoalId ? { ...task, goalIds: [matchedGoalId] } : task; });
}

function buildPlanning(tasks) {
  return tasks.reduce((acc, task) => { const status = String(task.status || '').toLowerCase(); if (status.includes('done') || status.includes('готово')) acc.done += 1; else if (status.includes('overdue') || status.includes('просроч')) acc.overdue += 1; else if (status.includes('waiting') || status.includes('ожид')) acc.waiting += 1; else if (status.includes('next') || status.includes('след')) acc.next += 1; else acc.onTrack += 1; return acc; }, { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 });
}

const reportedDatabaseWarnings = new Set();
function isObjectNotFound(error) { return error?.code === 'object_not_found' || /could not find database/i.test(error?.message || ''); }
function databaseAccessMessage(label, databaseId) { return `${label}: база ${databaseId} не найдена или не открыта для интеграции Life OS Map Backend.`; }

async function queryAllDatabasePages(notion, databaseId) {
  const results = [];
  let cursor;
  do {
    const response = await notion.databases.query({ database_id: databaseId, page_size: 100, start_cursor: cursor });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

async function queryDatabase(notion, databaseId, mapper, label, warnings, options = {}) {
  if (!databaseId) return [];
  const required = Boolean(options.required);
  try {
    const pages = await queryAllDatabasePages(notion, databaseId);
    return pages.map(mapper);
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

function chooseCurrentFocus(tasks) { return tasks.find((task) => String(task.status).toLowerCase().includes('now')) || tasks.find((task) => String(task.status).toLowerCase().includes('сейчас')) || tasks.find((task) => String(task.status).toLowerCase().includes('in progress')) || tasks.find((task) => String(task.status).toLowerCase().includes('в работе')) || tasks[0]; }

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
    meta: { source: 'notion-live-workspace', version: '0.8.5', updatedAt: new Date().toISOString(), warnings, connected: { tasks: Boolean(tasksDbId && !warnings.some((item) => item.startsWith('Tasks DB:'))), goals: Boolean(goalsDbId && !warnings.some((item) => item.startsWith('Goals DB:'))), sessions: Boolean(sessionsDbId && !warnings.some((item) => item.startsWith('Work Sessions DB:'))), projectAreas: Boolean(projectsDbId && !warnings.some((item) => item.startsWith('Projects & Life Areas DB:'))), dreams: Boolean(dreamsDbId && !warnings.some((item) => item.startsWith('Goals, Dreams & Desires DB:'))), signals: Boolean(signalsDbId && !warnings.some((item) => item.startsWith('AI Signals Inbox DB:'))) } },
    currentFocus: currentFocus ? { id: currentFocus.id, code: currentFocus.code, title: currentFocus.title, project: currentFocus.project, status: currentFocus.status, progress: currentFocus.progress, nextAction: currentFocus.nextAction } : null,
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
  properties['Last Touched'] = dateProperty(hasOwn(event, 'lastTouched') ? event.lastTouched : new Date().toISOString());
  await notion.pages.update({ page_id: taskId, properties: cleanProperties(properties) });
  return { id: taskId, updated: true };
}

export async function createWorkSession({ notionToken, sessionsDbId, payload = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!sessionsDbId) throw new Error('NOTION_SESSIONS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const properties = cleanProperties({ Session: titleProperty(payload.title || payload.session || 'LifeMap session'), Task: textProperty(payload.task || ''), Project: selectProperty(payload.project || 'LifeMap'), Status: selectProperty(payload.status || 'Done'), 'Started At': dateProperty(payload.startedAt), 'Finished At': dateProperty(payload.finishedAt || new Date().toISOString()), 'Duration Min': numberProperty(payload.durationMin), Result: textProperty(payload.result || ''), 'Next Step': textProperty(payload.nextStep || '') });
  const page = await notion.pages.create({ parent: { database_id: sessionsDbId }, properties });
  return { id: page.id, created: true };
}

function normalizedSignalStatus(status = 'Inbox') { const value = String(status || 'Inbox'); return value === 'New' ? 'Inbox' : value; }

export async function createSignal({ notionToken, signalsDbId, payload = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalsDbId) throw new Error('NOTION_SIGNALS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const title = payload.title || 'Telegram signal';
  const fullText = payload.rawText || payload.summary || '';
  const baseProperties = {
    Signal: titleProperty(title),
    Type: selectProperty(payload.type || 'Telegram'),
    Status: selectProperty(normalizedSignalStatus(payload.status)),
    Priority: selectProperty(payload.priority || 'Normal'),
    'Related projects': multiSelectProperty(payload.relatedProjects || []),
    Summary: textProperty(fullText),
    'Assistant note': textProperty(payload.assistantNote || payload.summary || fullText),
    'Next action': textProperty(payload.nextAction || ''),
    'Possible use': textProperty(payload.possibleUse || ''),
    'Source URL': urlProperty(payload.sourceUrl || ''),
    'Date captured': dateProperty(payload.capturedAt || new Date().toISOString()),
  };
  const richProperties = cleanProperties(baseProperties);
  const minimalProperties = cleanProperties({ Signal: titleProperty(title), Summary: textProperty(fullText), 'Assistant note': textProperty(payload.assistantNote || payload.summary || fullText), 'Source URL': urlProperty(payload.sourceUrl || ''), 'Date captured': dateProperty(payload.capturedAt || new Date().toISOString()) });

  try { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: richProperties }); return { id: page.id, created: true, mode: 'rich' }; }
  catch (error) {
    try { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: minimalProperties }); return { id: page.id, created: true, mode: 'text-safe', fallbackFrom: error.message }; }
    catch (fallbackError) { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: { Signal: titleProperty(title) } }); return { id: page.id, created: true, mode: 'title-only', fallbackFrom: fallbackError.message }; }
  }
}

function signalDuplicateKey(signal) {
  if (signal.sourceUrl) return `url:${signal.sourceUrl}`;
  const title = normalizeKey(signal.title);
  const body = normalizeKey(signal.summary || signal.assistantNote || signal.possibleUse).slice(0, 120);
  const day = String(signal.capturedAt || '').slice(0, 10);
  return `${title}:${body}:${day}`;
}

function signalQuality(signal) {
  return useful(signal.summary).length * 3 + useful(signal.assistantNote).length * 2 + useful(signal.possibleUse).length + (signal.sourceUrl ? 500 : 0);
}

export async function archiveDuplicateSignals({ notionToken, signalsDbId }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalsDbId) throw new Error('NOTION_SIGNALS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const pages = await queryAllDatabasePages(notion, signalsDbId);
  const rows = pages.map((page) => ({ page, signal: mapNotionSignal(page) }));
  const groups = new Map();
  rows.forEach((row) => { const key = signalDuplicateKey(row.signal); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); });
  const duplicates = [];
  [...groups.values()].filter((group) => group.length > 1).forEach((group) => {
    const sorted = [...group].sort((a, b) => signalQuality(b.signal) - signalQuality(a.signal));
    sorted.slice(1).forEach((row) => duplicates.push(row.page.id));
  });
  for (const pageId of duplicates) await notion.pages.update({ page_id: pageId, properties: { Status: selectProperty('Archived') } });
  return { archived: duplicates.length };
}

export async function updateItemTitle({ notionToken, itemId, kind, title }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!itemId) throw new Error('Item id is missing.');
  if (!title) throw new Error('Title is missing.');
  const notion = new Client({ auth: notionToken });
  const property = kind === 'task' ? 'Task' : kind === 'goal' ? 'Goal' : kind === 'dream' ? 'Goal / Dream' : kind === 'project' ? 'Name' : kind === 'signal' ? 'Signal' : null;
  if (!property) throw new Error(`Unsupported item kind: ${kind}`);
  await notion.pages.update({ page_id: itemId, properties: { [property]: titleProperty(title) } });
  return { id: itemId, updated: true, title };
}
