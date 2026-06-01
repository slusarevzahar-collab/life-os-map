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

app.use(express.json());

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    const notionSnapshot = await getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId });
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
    },
  });
});

app.listen(port, () => {
  console.log(`Life OS API listening on http://localhost:${port}`);
  console.log(notionToken ? 'NOTION_TOKEN is set' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is set' : 'NOTION_TASKS_DB_ID is not set; using mock snapshot');
  console.log(goalsDbId ? 'NOTION_GOALS_DB_ID is set' : 'NOTION_GOALS_DB_ID is not set; goals disabled');
  console.log(sessionsDbId ? 'NOTION_SESSIONS_DB_ID is set' : 'NOTION_SESSIONS_DB_ID is not set; sessions disabled');
});
