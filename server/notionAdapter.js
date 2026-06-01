import { Client } from '@notionhq/client';

export const mockSnapshot = {
  meta: {
    source: 'mock-backend-snapshot',
    version: '0.1.0',
    updatedAt: new Date().toISOString(),
    warnings: [],
  },
  currentFocus: {
    id: 'task_life_os_map',
    title: 'Life OS Map',
    project: 'Life OS',
    status: 'in_progress',
    progress: 55,
    nextAction: 'Подключить карту к данным через backend snapshot.',
  },
  goals: [
    {
      id: 'goal_life_os_mvp',
      title: 'Собрать рабочую Life OS Map + AI Inbox MVP',
      area: 'Life OS',
      horizon: '1 month',
      progress: 38,
      targetDate: '2026-06-30',
      status: 'active',
      nextAction: 'Заменить mock snapshot на Notion workspace snapshot.',
    },
  ],
  tasks: [
    {
      id: 'task_life_os_map',
      title: 'Подготовить Notion data adapter для Life OS Map',
      project: 'Life OS',
      goalName: 'Life OS',
      status: 'in_progress',
      progress: 55,
      priority: 1,
      dueDate: '2026-06-04',
      nextAction: 'Заменить mock data на backend response.',
    },
  ],
  sessions: [],
  planning: { onTrack: 1, next: 1, waiting: 0, overdue: 0, done: 0 },
};

function plainText(richText = []) {
  return richText.map((item) => item.plain_text || '').join('').trim();
}

function selectName(property) {
  return property?.select?.name || property?.status?.name || null;
}

function multiSelectNames(property) {
  return Array.isArray(property?.multi_select) ? property.multi_select.map((item) => item.name) : [];
}

function titleText(property) {
  return plainText(property?.title || []);
}

function richText(property) {
  return plainText(property?.rich_text || []);
}

function numberValue(property) {
  return typeof property?.number === 'number' ? property.number : 0;
}

function dateStart(property) {
  return property?.date?.start || null;
}

function relationIds(property) {
  return Array.isArray(property?.relation) ? property.relation.map((item) => item.id) : [];
}

function findProp(props, names) {
  for (const name of names) {
    if (props[name]) return props[name];
  }
  return undefined;
}

function firstTitle(props, names) {
  return titleText(findProp(props, names));
}

function firstRichText(props, names) {
  return richText(findProp(props, names));
}

function firstSelect(props, names) {
  return selectName(findProp(props, names));
}

function firstNumber(props, names) {
  return numberValue(findProp(props, names));
}

function firstDate(props, names) {
  return dateStart(findProp(props, names));
}

function normalizeKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
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
    goalIds: relationIds(findProp(props, ['Goal Link', 'Goals Relation', 'Goals', 'Цель-связь', 'Цели'])),
    tags: multiSelectNames(findProp(props, ['Tags', 'Теги'])),
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
  return tasks.reduce(
    (acc, task) => {
      const status = String(task.status || '').toLowerCase();
      if (status.includes('done') || status.includes('готово')) acc.done += 1;
      else if (status.includes('overdue') || status.includes('просроч')) acc.overdue += 1;
      else if (status.includes('waiting') || status.includes('ожид')) acc.waiting += 1;
      else if (status.includes('next') || status.includes('след')) acc.next += 1;
      else acc.onTrack += 1;
      return acc;
    },
    { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  );
}

async function queryDatabase(notion, databaseId, mapper, label, warnings) {
  if (!databaseId) return [];

  try {
    const response = await notion.databases.query({ database_id: databaseId, page_size: 50 });
    return response.results.map(mapper);
  } catch (error) {
    const message = `${label}: ${error.message}`;
    warnings.push(message);
    console.warn(`Life OS ${message}`);
    return [];
  }
}

function chooseCurrentFocus(tasks) {
  return (
    tasks.find((task) => String(task.status).toLowerCase().includes('now')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('сейчас')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('in progress')) ||
    tasks.find((task) => String(task.status).toLowerCase().includes('в работе')) ||
    tasks[0]
  );
}

export async function getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId }) {
  if (!notionToken || !tasksDbId) return null;

  const notion = new Client({ auth: notionToken });
  const warnings = [];
  const rawTasks = (await queryDatabase(notion, tasksDbId, mapNotionTask, 'Tasks DB', warnings))
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  const goals = (await queryDatabase(notion, goalsDbId, mapNotionGoal, 'Goals DB', warnings))
    .sort((a, b) => (b.progress || 0) - (a.progress || 0));
  const tasks = attachGoalsToTasks(rawTasks, goals);
  const sessions = (await queryDatabase(notion, sessionsDbId, mapNotionSession, 'Work Sessions DB', warnings))
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));

  const currentFocus = chooseCurrentFocus(tasks);

  return {
    meta: {
      source: goalsDbId || sessionsDbId ? 'notion-live-workspace' : 'notion-live-tasks-db',
      version: '0.5.0',
      updatedAt: new Date().toISOString(),
      warnings,
      connected: {
        tasks: Boolean(tasksDbId),
        goals: Boolean(goalsDbId) && goals.length > 0,
        sessions: Boolean(sessionsDbId) && sessions.length > 0,
      },
    },
    currentFocus: currentFocus
      ? {
          id: currentFocus.id,
          title: currentFocus.title,
          project: currentFocus.project,
          status: currentFocus.status,
          progress: currentFocus.progress,
          nextAction: currentFocus.nextAction || 'Следующий шаг не указан.',
        }
      : mockSnapshot.currentFocus,
    goals,
    tasks,
    sessions,
    planning: buildPlanning(tasks),
  };
}
