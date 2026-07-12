import { Client } from '@notionhq/client';

const RICH_TEXT_LIMIT = 1900;
const SESSION_STATUS_MAP = new Map([
  ['done', 'Finished'],
  ['finished', 'Finished'],
  ['active', 'Active'],
  ['in progress', 'Active'],
  ['now', 'Active'],
  ['planned', 'Planned'],
  ['next', 'Planned'],
  ['interrupted', 'Interrupted'],
  ['skipped', 'Skipped'],
]);

export const mockSnapshot = {
  meta: { source: 'mock-backend-snapshot', version: '0.1.0', updatedAt: new Date().toISOString(), warnings: [] },
  currentFocus: { id: 'task_lifemap', title: 'LifeMap', project: 'LifeMap', status: 'in_progress', progress: 55, nextAction: 'Подключить карту к данным через backend snapshot.' },
  goals: [{ id: 'goal_lifemap_mvp', title: 'Собрать рабочую LifeMap + LM Inbox MVP', area: 'LifeMap', horizon: '1 month', progress: 38, targetDate: '2026-06-30', status: 'active', nextAction: 'Заменить mock snapshot на Notion workspace snapshot.' }],
  tasks: [{ id: 'task_lifemap', code: 'LM-100', title: 'Подготовить Notion data adapter для LifeMap', project: 'LifeMap', goalName: 'LifeMap', status: 'in_progress', progress: 55, priority: 1, dueDate: '2026-06-04', nextAction: 'Заменить mock data на backend response.', sessionNotes: '' }],
  sessions: [], projectAreas: [], dreams: [], signals: [], planning: { onTrack: 1, next: 1, waiting: 0, overdue: 0, done: 0 },
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
function textProperty(value = '') { const chunks = chunkText(value); return chunks.length ? { rich_text: chunks.map((content) => ({ text: { content } })) } : { rich_text: [] }; }
function titleProperty(value = '') { return { title: [{ text: { content: String(value || 'Untitled').slice(0, 1900) } }] }; }
function selectProperty(value) { return value ? { select: { name: String(value) } } : undefined; }
function normalizeKey(value = '') { return String(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
function uniqueList(values = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(',');
  const seen = new Set();
  return source.map((name) => String(name || '').trim()).filter(Boolean).filter((name) => { const key = normalizeKey(name); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function multiSelectProperty(values = []) { const clean = uniqueList(values); return clean.length ? { multi_select: clean.map((name) => ({ name })) } : undefined; }
function numberProperty(value) { const number = Number(value); return Number.isFinite(number) ? { number } : undefined; }
function dateProperty(value) { return value ? { date: { start: value } } : undefined; }
function nullableDateProperty(value) { return value ? { date: { start: value } } : { date: null }; }
function urlProperty(value) { return value ? { url: String(value) } : undefined; }
function relationProperty(values = []) { const ids = uniqueList(values); return ids.length ? { relation: ids.map((id) => ({ id })) } : undefined; }
function cleanProperties(properties) { return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null)); }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
function useful(value = '') { return String(value || '').trim(); }
function safeParseJson(value = '', fallback = null) { if (value && typeof value === 'object') return value; const raw = String(value || '').trim(); if (!raw) return fallback; try { return JSON.parse(raw); } catch { return fallback; } }
function canonicalProjectName(value = '') {
  const text = useful(value);
  const key = normalizeKey(text);
  if (['lifemap', 'life os', 'live os', 'life os map', 'live os map'].includes(key)) return 'LifeMap';
  if (['lm inbox', 'ai inbox', 'ai signals inbox'].includes(key)) return 'LM Inbox';
  return text;
}
function notionSessionProjectName(value = '') { return canonicalProjectName(value || 'LifeMap') || 'LifeMap'; }
function normalizeSessionStatus(value = 'Finished') { const raw = useful(value) || 'Finished'; return SESSION_STATUS_MAP.get(normalizeKey(raw)) || raw; }
function looksLikePageId(value = '') { return /^[0-9a-f]{32}$/i.test(String(value).replace(/-/g, '')); }

function stableThreeDigits(value = '') { const source = String(value || 'task'); let hash = 0; for (let index = 0; index < source.length; index += 1) hash = ((hash * 31) + source.charCodeAt(index)) >>> 0; return String(100 + (hash % 900)).padStart(3, '0'); }
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
  const project = canonicalProjectName(firstSelect(props, ['Project', 'Проект']) || 'LifeMap') || 'LifeMap';
  const goalName = canonicalProjectName(firstSelect(props, ['Goal', 'Цель']) || '');
  return {
    id: page.id, code: makeTaskCode(page.id, props, { project, title, goalName }), title, project, goalName, goalKey: normalizeKey(goalName),
    status: firstSelect(props, ['Status', 'Статус']) || 'unknown', type: firstSelect(props, ['Type', 'Тип']) || '', energy: firstSelect(props, ['Energy', 'Энергия']) || '',
    progress: firstNumber(props, ['Progress', 'Прогресс', 'Progress %']) || 0, priority: firstNumber(props, ['Priority', 'Приоритет']) || 0,
    dueDate: firstDate(props, ['Due Date', 'Дата', 'Срок', 'Deadline']) || null, plannedDate: firstDate(props, ['Planned Date', 'Плановая дата']) || null,
    lastTouched: firstDate(props, ['Last Touched', 'Последнее касание']) || null, startedAt: firstDate(props, ['Started At', 'Start', 'Начало']) || null,
    finishedAt: firstDate(props, ['Finished At', 'Finish', 'Конец', 'Завершено']) || null, durationMin: firstNumber(props, ['Duration Min', 'Duration', 'Минуты', 'Длительность']) || 0,
    timeDebt: firstNumber(props, ['Time Debt', 'Долг времени']) || 0, rescheduleCount: firstNumber(props, ['Reschedule Count', 'Переносы']) || 0,
    nextAction: firstRichText(props, ['Next Action', 'Следующее действие', 'Следующий шаг']) || '', sessionNotes: firstRichText(props, ['Session Notes', 'Notes', 'Заметки', 'Заметка']) || '',
    goalIds: relationIds(findProp(props, ['Goal Link', 'Goals Relation', 'Goals', 'Цель-связь', 'Цели'])), tags: firstMultiSelect(props, ['Tags', 'Теги']),
  };
}

function mapNotionGoal(page) {
  const props = page.properties || {};
  const title = firstTitle(props, ['Goal', 'Name', 'Название', 'Цель']) || 'Untitled goal';
  const area = canonicalProjectName(firstSelect(props, ['Area', 'Направление']) || title) || title;
  return {
    id: page.id, title, area, goalKey: normalizeKey(area || title), titleKey: normalizeKey(title), status: firstSelect(props, ['Status', 'Статус']) || 'unknown',
    horizon: firstSelect(props, ['Horizon', 'Период', 'Горизонт']) || firstRichText(props, ['Horizon', 'Период', 'Горизонт']) || '', progress: firstNumber(props, ['Progress', 'Прогресс', 'Progress %']) || 0,
    targetDate: firstDate(props, ['Target Date', 'Due Date', 'Дата', 'Срок', 'Deadline']) || null, nextAction: firstRichText(props, ['Next Action', 'Следующее действие', 'Следующий шаг']) || '',
    why: firstRichText(props, ['Why', 'Почему', 'Зачем']) || '', successCriteria: firstRichText(props, ['Success Criteria', 'Критерий успеха', 'Критерии успеха']) || '',
    taskIds: relationIds(findProp(props, ['Tasks', 'Task', 'Задачи', 'Задача'])),
  };
}

function mapNotionProjectArea(page) {
  const props = page.properties || {};
  return { id: page.id, name: canonicalProjectName(firstTitle(props, ['Name', 'Название']) || 'Untitled area') || 'Untitled area', type: firstSelect(props, ['Type']) || '', status: firstSelect(props, ['Status']) || '', focusLevel: firstSelect(props, ['Focus level']) || '', goal: firstRichText(props, ['Goal']) || '', currentState: firstRichText(props, ['Current state']) || '', nextAction: firstRichText(props, ['Next action', 'Next Action']) || '', why: firstRichText(props, ['Why it matters']) || '', updatedAt: firstDate(props, ['Date updated']) || null };
}

function mapNotionDream(page) {
  const props = page.properties || {};
  return { id: page.id, title: firstTitle(props, ['Goal / Dream']) || 'Untitled dream', type: firstSelect(props, ['Type']) || '', status: firstSelect(props, ['Status']) || '', visibility: firstSelect(props, ['Visibility']) || '', lifeSphere: firstSelect(props, ['Life sphere']) || '', linkedProject: canonicalProjectName(firstRichText(props, ['Linked project']) || ''), nextStep: firstRichText(props, ['Next gentle step']) || '', why: firstRichText(props, ['Why I want it']) || '', targetDate: firstDate(props, ['Target date']) || null, capturedAt: firstDate(props, ['Date captured']) || null };
}

function signalTextFromProps(props) { return firstRichText(props, ['Summary', 'Original text', 'Original Text', 'Raw text', 'Raw Text', 'Telegram text', 'Telegram Text', 'Message', 'Content', 'Full text', 'Full Text', 'Assistant note', 'Assistant Note']) || ''; }
function mapNotionSignal(page) {
  const props = page.properties || {};
  const assistantNote = firstRichText(props, ['Assistant note', 'Assistant Note']) || '';
  const summary = signalTextFromProps(props);
  const originalText = firstRichText(props, ['Original text', 'Original Text']) || '';
  const assets = safeParseJson(firstRichText(props, ['Extracted assets']), []);
  const aiProcessingVersion = firstRichText(props, ['AI processing version']) || '';
  return {
    id: page.id, title: firstTitle(props, ['Signal']) || 'Untitled signal', type: firstSelect(props, ['Type']) || firstSelect(props, ['AI Category']) || '', aiCategory: firstSelect(props, ['AI Category']) || '',
    assetTypes: firstMultiSelect(props, ['Asset type', 'Asset Type']), decision: firstSelect(props, ['Decision']) || '', status: firstSelect(props, ['Status']) || '', priority: firstSelect(props, ['Priority']) || '',
    relatedProjects: firstMultiSelect(props, ['Related projects']).map(canonicalProjectName), summary, originalText, assistantNote,
    nextAction: firstRichText(props, ['Next action', 'Next Action']) || '', possibleUse: firstRichText(props, ['Possible use']) || '', sourceUrl: firstUrl(props, ['Source URL']) || '', capturedAt: firstDate(props, ['Date captured']) || null,
    assets: Array.isArray(assets) ? assets : [], attachment: safeParseJson(firstRichText(props, ['Attachment metadata']), null), aiProcessingVersion, storedAiProcessingVersion: aiProcessingVersion,
    needsReprocessing: !aiProcessingVersion && !(Array.isArray(assets) && assets.length) && !assistantNote,
  };
}

function mapNotionSession(page) {
  const props = page.properties || {};
  const startedAtExact = firstRichText(props, ['Started At Exact']) || null;
  const taskIds = relationIds(findProp(props, ['Task', 'Задача']));
  const finishedAt = firstDate(props, ['Finished At', 'Finish', 'Конец', 'Завершено']) || null;
  const durationMin = firstNumber(props, ['Duration Min', 'Duration', 'Минуты', 'Длительность']) || 0;
  return {
    id: page.id,
    userId: firstRichText(props, ['User ID']) || null,
    title: firstTitle(props, ['Session', 'Name', 'Название', 'Сессия']) || 'Work session',
    taskIds,
    taskId: taskIds[0] || firstRichText(props, ['Task ID']) || null,
    projectId: firstRichText(props, ['Project ID']) || null,
    scope: firstSelect(props, ['Scope']) || '',
    task: firstRichText(props, ['Task name', 'Task Name', 'Задача текстом']) || '',
    project: canonicalProjectName(firstSelect(props, ['Project', 'Проект']) || 'LifeMap') || 'LifeMap',
    status: firstSelect(props, ['Status', 'Статус']) || 'unknown',
    energy: firstSelect(props, ['Energy', 'Энергия']) || '',
    startedAt: startedAtExact || firstDate(props, ['Started At', 'Start', 'Начало']) || null,
    startedAtExact,
    endedAt: finishedAt,
    finishedAt,
    durationSeconds: firstNumber(props, ['Duration Seconds']) || Math.max(0, Math.round(durationMin * 60)),
    durationMin,
    dateKey: firstRichText(props, ['Date Key']) || '',
    timezone: firstRichText(props, ['Timezone']) || 'UTC',
    source: firstSelect(props, ['Source']) || 'lifemap',
    result: firstRichText(props, ['Result', 'Результат']) || '',
    nextStep: firstRichText(props, ['Next Step', 'Next Action', 'Следующий шаг']) || '',
    createdAt: page.created_time || null,
    updatedAt: page.last_edited_time || null,
  };
}

function attachGoalsToTasks(tasks, goals) {
  const byKey = new Map();
  goals.forEach((goal) => [goal.goalKey, goal.titleKey].filter(Boolean).forEach((key) => { const list = byKey.get(key) || []; if (!list.includes(goal.id)) list.push(goal.id); byKey.set(key, list); }));
  return tasks.map((task) => {
    if (task.goalIds?.length) return task;
    const direct = byKey.get(task.goalKey) || [];
    const projectFallback = byKey.get(normalizeKey(task.project)) || [];
    const candidates = direct.length ? direct : projectFallback;
    return candidates.length === 1 ? { ...task, goalIds: [candidates[0]] } : task;
  });
}

function attachTasksToSessions(sessions, tasks) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return sessions.map((session) => {
    const relatedTasks = (session.taskIds || []).map((id) => tasksById.get(id)).filter(Boolean);
    const primaryTask = relatedTasks[0] || null;
    return { ...session, task: session.task || primaryTask?.title || '', taskCode: primaryTask?.code || '', taskProject: primaryTask?.project || '', taskTitles: relatedTasks.map((task) => task.title), project: canonicalProjectName(session.project || primaryTask?.project || 'LifeMap') || 'LifeMap' };
  });
}

function attachSessionsToTasks(tasks, sessions) {
  const byTaskId = new Map();
  sessions.forEach((session) => (session.taskIds || []).forEach((taskId) => { const list = byTaskId.get(taskId) || []; list.push(session); byTaskId.set(taskId, list); }));
  return tasks.map((task) => {
    const taskSessions = (byTaskId.get(task.id) || []).sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    const lastSession = taskSessions[0] || null;
    return { ...task, sessionCount: taskSessions.length, sessionDurationMin: taskSessions.reduce((sum, session) => sum + Number(session.durationMin || 0), 0), lastSessionAt: lastSession?.startedAt || null, lastSessionResult: lastSession?.result || '', lastSessionNextStep: lastSession?.nextStep || '' };
  });
}

function buildPlanning(tasks) {
  return tasks.reduce((acc, task) => { const status = String(task.status || '').toLowerCase(); if (status.includes('done') || status.includes('готово')) acc.done += 1; else if (status.includes('overdue') || status.includes('просроч')) acc.overdue += 1; else if (status.includes('waiting') || status.includes('ожид')) acc.waiting += 1; else if (status.includes('next') || status.includes('след')) acc.next += 1; else acc.onTrack += 1; return acc; }, { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 });
}

const reportedDatabaseWarnings = new Set();
function isObjectNotFound(error) { return error?.code === 'object_not_found' || /could not find database/i.test(error?.message || ''); }
function databaseAccessMessage(label, databaseId) { return `${label}: база ${databaseId} не найдена или не открыта для интеграции LifeMap Backend.`; }
async function queryAllDatabasePages(notion, databaseId) {
  const results = [];
  let cursor;
  do { const response = await notion.databases.query({ database_id: databaseId, page_size: 100, start_cursor: cursor }); results.push(...response.results); cursor = response.has_more ? response.next_cursor : null; } while (cursor);
  return results;
}
const sessionSchemaCache = new Map();
async function sessionSchema(notion, sessionsDbId) {
  const cached = sessionSchemaCache.get(sessionsDbId);
  if (cached && cached.expiresAt > Date.now()) return cached.names;
  const database = await notion.databases.retrieve({ database_id: sessionsDbId });
  const names = new Set(Object.keys(database.properties || {}));
  sessionSchemaCache.set(sessionsDbId, { names, expiresAt: Date.now() + 5 * 60 * 1000 });
  return names;
}
function knownSessionProperties(properties, names) {
  return Object.fromEntries(Object.entries(cleanProperties(properties)).filter(([name]) => names.has(name)));
}
async function queryDatabase(notion, databaseId, mapper, label, warnings, options = {}) {
  if (!databaseId) return [];
  const required = Boolean(options.required);
  try { const pages = await queryAllDatabasePages(notion, databaseId); return pages.map(mapper); }
  catch (error) {
    const message = isObjectNotFound(error) ? databaseAccessMessage(label, databaseId) : `${label}: ${error.message}`;
    warnings.push(message);
    const warningKey = `${label}:${databaseId}:${error?.code || error?.message}`;
    if (!reportedDatabaseWarnings.has(warningKey)) { reportedDatabaseWarnings.add(warningKey); const log = required ? console.warn : console.info; log(`LifeMap ${message}`); }
    return [];
  }
}
function chooseCurrentFocus(tasks) { return tasks.find((task) => String(task.status).toLowerCase().includes('now')) || tasks.find((task) => String(task.status).toLowerCase().includes('сейчас')) || tasks.find((task) => String(task.status).toLowerCase().includes('in progress')) || tasks.find((task) => String(task.status).toLowerCase().includes('в работе')) || tasks[0]; }
function snapshotDataQuality({ tasks, goals, sessions, projectAreas, dreams, signals }) {
  return {
    counts: { tasks: tasks.length, goals: goals.length, sessions: sessions.length, projectAreas: projectAreas.length, dreams: dreams.length, signals: signals.length },
    unlinkedSessions: sessions.filter((session) => !(session.taskIds || []).length && !['project', 'historical'].includes(normalizeKey(session.scope))).length,
    standaloneSessions: sessions.filter((session) => !(session.taskIds || []).length && ['project', 'historical'].includes(normalizeKey(session.scope))).length,
    tasksWithoutNextAction: tasks.filter((task) => !useful(task.nextAction) && !/done|готов/i.test(task.status || '')).length,
    goalsWithoutSuccessCriteria: goals.filter((goal) => !useful(goal.successCriteria)).length,
    goalsWithoutWhy: goals.filter((goal) => !useful(goal.why)).length,
    linkedDreams: dreams.filter((dream) => useful(dream.linkedProject)).length,
    hiddenDreams: dreams.filter((dream) => normalizeKey(dream.visibility) === 'hidden until later').length,
    signalsMissingAnalysis: signals.filter((signal) => signal.needsReprocessing).length,
  };
}

export async function getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId }) {
  if (!notionToken || !tasksDbId) return null;
  const notion = new Client({ auth: notionToken });
  const warnings = [];
  const [rawTasks, rawGoals, rawSessions, projectAreas, dreams, signals] = await Promise.all([
    queryDatabase(notion, tasksDbId, mapNotionTask, 'Tasks DB', warnings, { required: true }),
    queryDatabase(notion, goalsDbId, mapNotionGoal, 'Goals DB', warnings),
    queryDatabase(notion, sessionsDbId, mapNotionSession, 'Sessions DB', warnings),
    queryDatabase(notion, projectsDbId, mapNotionProjectArea, 'Projects & Areas DB', warnings),
    queryDatabase(notion, dreamsDbId, mapNotionDream, 'Dreams DB', warnings),
    queryDatabase(notion, signalsDbId, mapNotionSignal, 'LM Inbox DB', warnings),
  ]);
  const goals = rawGoals.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  let tasks = attachGoalsToTasks(rawTasks, goals);
  const sessions = attachTasksToSessions(rawSessions, tasks).sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  tasks = attachSessionsToTasks(tasks, sessions).sort((a, b) => (a.priority || 999) - (b.priority || 999));
  const currentFocus = chooseCurrentFocus(tasks);
  const dataQuality = snapshotDataQuality({ tasks, goals, sessions, projectAreas, dreams, signals });
  const connected = {
    tasks: Boolean(tasksDbId && !warnings.some((item) => item.startsWith('Tasks DB:'))), goals: Boolean(goalsDbId && !warnings.some((item) => item.startsWith('Goals DB:'))),
    sessions: Boolean(sessionsDbId && !warnings.some((item) => item.startsWith('Sessions DB:'))), projectAreas: Boolean(projectsDbId && !warnings.some((item) => item.startsWith('Projects & Areas DB:'))),
    dreams: Boolean(dreamsDbId && !warnings.some((item) => item.startsWith('Dreams DB:'))), signals: Boolean(signalsDbId && !warnings.some((item) => item.startsWith('LM Inbox DB:'))),
  };
  return {
    meta: { source: 'notion-live-workspace', version: '0.9.0', updatedAt: new Date().toISOString(), warnings, connected, dataQuality },
    currentFocus: currentFocus ? { id: currentFocus.id, code: currentFocus.code, title: currentFocus.title, project: currentFocus.project, status: currentFocus.status, progress: currentFocus.progress, nextAction: currentFocus.nextAction } : null,
    tasks, goals, sessions, projectAreas, dreams, signals, planning: buildPlanning(tasks),
  };
}

export async function updateTaskEvent({ notionToken, taskId, event }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!taskId) throw new Error('Task id is missing.');
  const notion = new Client({ auth: notionToken });
  const properties = {};
  if (hasOwn(event, 'status')) properties.Status = selectProperty(event.status);
  if (hasOwn(event, 'type')) properties.Type = selectProperty(event.type);
  if (hasOwn(event, 'energy')) properties.Energy = selectProperty(event.energy);
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
  const schema = await sessionSchema(notion, sessionsDbId);
  const status = normalizeSessionStatus(payload.status || 'Finished');
  const startedAt = payload.startedAt || (['Active', 'Finished'].includes(status) ? new Date().toISOString() : null);
  const finishedAt = payload.endedAt || payload.finishedAt || (status === 'Finished' ? new Date().toISOString() : null);
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(finishedAt).getTime();
  const computedSeconds = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : null;
  const durationSeconds = status === 'Active' ? null : computedSeconds;
  const rawTaskIds = [...(Array.isArray(payload.taskIds) ? payload.taskIds : []), payload.taskId, looksLikePageId(payload.task) ? payload.task : ''].filter(Boolean);
  const taskIds = uniqueList(rawTaskIds);
  const scope = payload.scope || (taskIds.length ? 'Task' : 'Project');
  const properties = knownSessionProperties({
    Session: titleProperty(payload.title || payload.session || 'LifeMap session'), Task: relationProperty(taskIds), Scope: selectProperty(scope), Project: selectProperty(notionSessionProjectName(payload.project || 'LifeMap')),
    Status: selectProperty(status), Energy: selectProperty(payload.energy), 'Started At': dateProperty(startedAt), 'Started At Exact': textProperty(startedAt), 'Finished At': dateProperty(finishedAt),
    'Duration Min': durationSeconds === null ? undefined : numberProperty(durationSeconds / 60), 'Duration Seconds': durationSeconds === null ? undefined : numberProperty(durationSeconds),
    'Date Key': textProperty(payload.dateKey || ''), Timezone: textProperty(payload.timezone || 'UTC'), Source: selectProperty(payload.source || 'lifemap'),
    'User ID': textProperty(payload.userId || ''), 'Project ID': textProperty(payload.projectId || ''), 'Task ID': textProperty(payload.taskId || ''),
    Result: textProperty(payload.result || ''), 'Next Step': textProperty(payload.nextStep || ''),
  }, schema);
  const page = await notion.pages.create({ parent: { database_id: sessionsDbId }, properties });
  return { ...mapNotionSession(page), taskIds, scope, status, startedAt, startedAtExact: startedAt, endedAt: finishedAt, finishedAt, durationSeconds, dateKey: payload.dateKey || '', timezone: payload.timezone || 'UTC', source: payload.source || 'lifemap', created: true };
}

export async function listWorkSessions({ notionToken, sessionsDbId, status = null, userId = null }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!sessionsDbId) throw new Error('NOTION_SESSIONS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const sessions = (await queryAllDatabasePages(notion, sessionsDbId)).map(mapNotionSession);
  return sessions.filter((session) => (!status || normalizeSessionStatus(session.status) === normalizeSessionStatus(status)) && (!userId || !session.userId || session.userId === userId));
}

export async function getWorkSession({ notionToken, sessionId }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!sessionId) return null;
  const notion = new Client({ auth: notionToken });
  try { return mapNotionSession(await notion.pages.retrieve({ page_id: sessionId })); }
  catch (error) { if (isObjectNotFound(error)) return null; throw error; }
}

export async function updateWorkSession({ notionToken, sessionsDbId, sessionId, patch = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!sessionsDbId) throw new Error('NOTION_SESSIONS_DB_ID is missing.');
  if (!sessionId) throw new Error('Work session id is missing.');
  const notion = new Client({ auth: notionToken });
  const schema = await sessionSchema(notion, sessionsDbId);
  const duration = hasOwn(patch, 'durationSeconds') ? Math.max(0, Number(patch.durationSeconds) || 0) : undefined;
  const properties = knownSessionProperties({
    Status: hasOwn(patch, 'status') ? selectProperty(normalizeSessionStatus(patch.status)) : undefined,
    'Finished At': hasOwn(patch, 'endedAt') ? nullableDateProperty(patch.endedAt) : undefined,
    'Duration Seconds': hasOwn(patch, 'durationSeconds') ? numberProperty(duration) : undefined,
    'Duration Min': hasOwn(patch, 'durationSeconds') ? numberProperty(duration / 60) : undefined,
    Result: hasOwn(patch, 'result') ? textProperty(patch.result || '') : undefined,
    'Next Step': hasOwn(patch, 'nextStep') ? textProperty(patch.nextStep || '') : undefined,
  }, schema);
  const page = await notion.pages.update({ page_id: sessionId, properties });
  return { ...mapNotionSession(page), ...patch, id: sessionId, finishedAt: patch.endedAt ?? mapNotionSession(page).finishedAt, updatedAt: page.last_edited_time || new Date().toISOString() };
}

function normalizedSignalStatus(status = 'Inbox') { const value = String(status || 'Inbox'); return value === 'New' ? 'Inbox' : value; }
export async function createSignal({ notionToken, signalsDbId, payload = {} }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalsDbId) throw new Error('NOTION_SIGNALS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const title = payload.title || 'Telegram signal';
  const fullText = payload.rawText || payload.summary || '';
  const baseProperties = {
    Signal: titleProperty(title), Type: selectProperty(payload.type || 'Telegram'), Status: selectProperty(normalizedSignalStatus(payload.status)), Priority: selectProperty(payload.priority || 'Normal'),
    'Related projects': multiSelectProperty((payload.relatedProjects || []).map(canonicalProjectName)), Summary: textProperty(fullText), 'Original text': textProperty(payload.rawText || ''),
    'Assistant note': textProperty(payload.assistantNote || payload.summary || fullText), 'Next action': textProperty(payload.nextAction || ''), 'Possible use': textProperty(payload.possibleUse || ''),
    'Source URL': urlProperty(payload.sourceUrl || ''), 'Date captured': dateProperty(payload.capturedAt || new Date().toISOString()), 'Attachment metadata': payload.attachment ? textProperty(JSON.stringify(payload.attachment)) : undefined,
  };
  const richProperties = cleanProperties(baseProperties);
  const minimalProperties = cleanProperties({ Signal: titleProperty(title), Summary: textProperty(fullText), 'Assistant note': textProperty(payload.assistantNote || payload.summary || fullText), 'Source URL': urlProperty(payload.sourceUrl || ''), 'Date captured': dateProperty(payload.capturedAt || new Date().toISOString()) });
  try { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: richProperties }); return { id: page.id, created: true, mode: 'rich' }; }
  catch (error) {
    try { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: minimalProperties }); return { id: page.id, created: true, mode: 'text-safe', fallbackFrom: error.message }; }
    catch (fallbackError) { const page = await notion.pages.create({ parent: { database_id: signalsDbId }, properties: { Signal: titleProperty(title) } }); return { id: page.id, created: true, mode: 'title-only', fallbackFrom: fallbackError.message }; }
  }
}

function signalDuplicateKey(signal) { if (signal.sourceUrl) return `url:${signal.sourceUrl}`; const title = normalizeKey(signal.title); const body = normalizeKey(signal.summary || signal.assistantNote || signal.possibleUse).slice(0, 120); const day = String(signal.capturedAt || '').slice(0, 10); return `${title}:${body}:${day}`; }
function signalQuality(signal) { return useful(signal.summary).length * 3 + useful(signal.assistantNote).length * 2 + useful(signal.possibleUse).length + (signal.sourceUrl ? 500 : 0); }
export async function archiveDuplicateSignals({ notionToken, signalsDbId }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!signalsDbId) throw new Error('NOTION_SIGNALS_DB_ID is missing.');
  const notion = new Client({ auth: notionToken });
  const pages = await queryAllDatabasePages(notion, signalsDbId);
  const rows = pages.map((page) => ({ page, signal: mapNotionSignal(page) }));
  const groups = new Map();
  rows.forEach((row) => { const key = signalDuplicateKey(row.signal); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); });
  const duplicates = [];
  [...groups.values()].filter((group) => group.length > 1).forEach((group) => { const sorted = [...group].sort((a, b) => signalQuality(b.signal) - signalQuality(a.signal)); sorted.slice(1).forEach((row) => duplicates.push(row.page.id)); });
  for (const pageId of duplicates) await notion.pages.update({ page_id: pageId, properties: { Status: selectProperty('Archived') } });
  return { archived: duplicates.length };
}

export async function updateItemTitle({ notionToken, itemId, kind, title }) {
  if (!notionToken) throw new Error('NOTION_TOKEN is missing.');
  if (!itemId) throw new Error('Item id is missing.');
  if (!title) throw new Error('Title is missing.');
  const notion = new Client({ auth: notionToken });
  const property = kind === 'task' ? 'Task' : kind === 'goal' ? 'Goal' : kind === 'dream' ? 'Goal / Dream' : kind === 'project' || kind === 'lifeArea' ? 'Name' : kind === 'signal' ? 'Signal' : kind === 'session' ? 'Session' : null;
  if (!property) throw new Error(`Unsupported item kind: ${kind}`);
  await notion.pages.update({ page_id: itemId, properties: { [property]: titleProperty(title) } });
  return { id: itemId, updated: true, title };
}
