import express from 'express';
import { Client } from '@notionhq/client';

const app = express();
const port = process.env.API_PORT || 3001;
const notionToken = process.env.NOTION_TOKEN;
const tasksDbId = process.env.NOTION_TASKS_DB_ID;

const mockSnapshot = {
  meta: {
    source: 'mock-backend-snapshot',
    version: '0.1.0',
    updatedAt: new Date().toISOString(),
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
      horizon: '1 month',
      progress: 38,
      targetDate: '2026-06-30',
      status: 'active',
    },
  ],
  tasks: [
    {
      id: 'task_life_os_map',
      title: 'Подготовить Notion data adapter для Life OS Map',
      project: 'Life OS',
      status: 'in_progress',
      progress: 55,
      priority: 1,
      dueDate: '2026-06-04',
      nextAction: 'Заменить mock data на backend response.',
    },
    {
      id: 'task_mobile_ux',
      title: 'Переработать мобильный UX в dashboard + mini-map',
      project: 'Life OS',
      status: 'next',
      progress: 0,
      priority: 2,
      dueDate: '2026-06-07',
      nextAction: 'Сделать мобильный режим не копией canvas, а рабочей панелью.',
    },
    {
      id: 'task_ai_inbox',
      title: 'AI Inbox: Telegram → Make → Notion MVP',
      project: 'AI Inbox',
      status: 'next',
      progress: 35,
      priority: 3,
      dueDate: '2026-06-05',
      nextAction: 'Проверить создание записей из Telegram-бота.',
    },
  ],
  sessions: [],
  planning: {
    onTrack: 2,
    next: 2,
    waiting: 1,
    overdue: 0,
  },
};

function plainText(richText = []) {
  return richText.map((item) => item.plain_text || '').join('').trim();
}

function selectName(property) {
  return property?.select?.name || property?.status?.name || null;
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

function mapNotionTask(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: titleText(props.Task) || 'Untitled task',
    project: selectName(props.Project) || 'Life OS',
    status: selectName(props.Status) || 'unknown',
    progress: numberValue(props.Progress),
    priority: numberValue(props.Priority),
    dueDate: dateStart(props['Due Date']),
    nextAction: richText(props['Next Action']) || '',
  };
}

function buildPlanning(tasks) {
  return tasks.reduce(
    (acc, task) => {
      const status = String(task.status || '').toLowerCase();
      if (status.includes('done')) acc.done += 1;
      else if (status.includes('overdue')) acc.overdue += 1;
      else if (status.includes('waiting')) acc.waiting += 1;
      else if (status.includes('next')) acc.next += 1;
      else acc.onTrack += 1;
      return acc;
    },
    { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  );
}

async function getNotionSnapshot() {
  if (!notionToken || !tasksDbId) return null;

  const notion = new Client({ auth: notionToken });
  const response = await notion.databases.query({
    database_id: tasksDbId,
    sorts: [{ property: 'Priority', direction: 'ascending' }],
    page_size: 20,
  });

  const tasks = response.results.map(mapNotionTask);
  const currentFocus = tasks.find((task) => String(task.status).toLowerCase().includes('now')) || tasks[0];

  return {
    meta: {
      source: 'notion-live-tasks-db',
      version: '0.2.0',
      updatedAt: new Date().toISOString(),
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
    goals: [],
    tasks,
    sessions: [],
    planning: buildPlanning(tasks),
  };
}

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    const notionSnapshot = await getNotionSnapshot();
    if (notionSnapshot) {
      res.json(notionSnapshot);
      return;
    }

    res.json({
      ...mockSnapshot,
      meta: {
        ...mockSnapshot.meta,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Life OS Notion API error:', error.message);
    res.status(500).json({
      error: 'Failed to build Life OS snapshot',
      details: error.message,
      fallback: mockSnapshot,
    });
  }
});

app.listen(port, () => {
  console.log(`Life OS API listening on http://localhost:${port}`);
  console.log(notionToken ? 'NOTION_TOKEN is set' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is set' : 'NOTION_TASKS_DB_ID is not set; using mock snapshot');
});
