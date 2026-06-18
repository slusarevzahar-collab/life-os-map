import express from 'express';
import {
  createWorkSession,
  getNotionSnapshot,
  mockSnapshot,
  updateTaskEvent,
} from './server/notionAdapter.js';

const app = express();
const port = process.env.API_PORT || 3001;
const notionToken = process.env.NOTION_TOKEN;
const tasksDbId = process.env.NOTION_TASKS_DB_ID;
const goalsDbId = process.env.NOTION_GOALS_DB_ID;
const sessionsDbId = process.env.NOTION_SESSIONS_DB_ID;
const projectsDbId = process.env.NOTION_PROJECTS_DB_ID || '9a210761ffc04000bf80657525fca6a1';
const dreamsDbId = process.env.NOTION_DREAMS_DB_ID || '5745b6741c7d43de8c4418d530d8f9f1';
const signalsDbId = process.env.NOTION_SIGNALS_DB_ID || '30ba34adf8e54957886f5741e975e6ad';

app.use(express.json());

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    const notionSnapshot = await getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId });
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

app.post('/api/life-os/sessions', async (req, res) => {
  try {
    const result = await createWorkSession({ notionToken, sessionsDbId, payload: req.body || {} });
    res.status(201).json({ ok: true, session: result });
  } catch (error) {
    console.error('Life OS create session error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch('/api/life-os/tasks/:id', async (req, res) => {
  try {
    const result = await updateTaskEvent({ notionToken, taskId: req.params.id, event: req.body || {} });
    res.json({ ok: true, task: result });
  } catch (error) {
    console.error('Life OS update task error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/life-os/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'life-os-api',
    port,
    endpoints: [
      'GET /api/life-os/snapshot',
      'POST /api/life-os/sessions',
      'PATCH /api/life-os/tasks/:id',
      'GET /api/life-os/health',
    ],
    notion: {
      token: Boolean(notionToken),
      tasks: Boolean(tasksDbId),
      goals: Boolean(goalsDbId),
      sessions: Boolean(sessionsDbId),
      projects: Boolean(projectsDbId),
      dreams: Boolean(dreamsDbId),
      signals: Boolean(signalsDbId),
    },
  });
});

app.listen(port, () => {
  console.log(`Life OS API listening on http://localhost:${port}`);
  console.log(notionToken ? 'NOTION_TOKEN is set' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is set' : 'NOTION_TASKS_DB_ID is not set; using mock snapshot');
  console.log(goalsDbId ? 'NOTION_GOALS_DB_ID is set' : 'NOTION_GOALS_DB_ID is not set; goals disabled');
  console.log(sessionsDbId ? 'NOTION_SESSIONS_DB_ID is set' : 'NOTION_SESSIONS_DB_ID is not set; sessions disabled');
  console.log(projectsDbId ? 'NOTION_PROJECTS_DB_ID is available' : 'NOTION_PROJECTS_DB_ID is not set; projects disabled');
  console.log(dreamsDbId ? 'NOTION_DREAMS_DB_ID is available' : 'NOTION_DREAMS_DB_ID is not set; dreams disabled');
  console.log(signalsDbId ? 'NOTION_SIGNALS_DB_ID is available' : 'NOTION_SIGNALS_DB_ID is not set; signals disabled');
});
