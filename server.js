import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  createWorkSession,
  getNotionSnapshot,
  mockSnapshot,
  updateTaskEvent,
} from './server/notionAdapter.js';

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return false;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (name && process.env[name] === undefined) process.env[name] = value;
  });
  return true;
}

const envLoaded = loadLocalEnv();
const app = express();
const port = process.env.API_PORT || 3001;
const notionToken = process.env.NOTION_TOKEN;
const tasksDbId = process.env.NOTION_TASKS_DB_ID;
const goalsDbId = process.env.NOTION_GOALS_DB_ID;
const sessionsDbId = process.env.NOTION_SESSIONS_DB_ID;
const projectsDbId = process.env.NOTION_PROJECTS_DB_ID;
const dreamsDbId = process.env.NOTION_DREAMS_DB_ID;
const signalsDbId = process.env.NOTION_SIGNALS_DB_ID;

app.use(express.json());

function makeMockResponse(reason) {
  return {
    ...mockSnapshot,
    meta: {
      ...mockSnapshot.meta,
      source: 'mock-backend-snapshot',
      updatedAt: new Date().toISOString(),
      warnings: [reason].filter(Boolean),
      connected: {
        tasks: false,
        goals: false,
        sessions: false,
        projectAreas: false,
        dreams: false,
        signals: false,
      },
    },
  };
}

function cleanUiWarnings(snapshot) {
  const warnings = snapshot.meta?.warnings || [];
  const criticalWarnings = warnings.filter((message) => /Tasks DB|NOTION_TOKEN|NOTION_TASKS_DB_ID/i.test(message));
  return {
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      warnings: criticalWarnings,
      notices: warnings.filter((message) => !criticalWarnings.includes(message)),
    },
  };
}

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    const notionSnapshot = await getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId });
    if (notionSnapshot) {
      res.json(cleanUiWarnings(notionSnapshot));
      return;
    }

    res.json(makeMockResponse('NOTION_TOKEN or NOTION_TASKS_DB_ID is missing. API is returning mock data.'));
  } catch (error) {
    console.error('Life OS Notion API error:', error.message);
    res.status(500).json({
      error: 'Failed to build Life OS snapshot',
      details: error.message,
      fallback: makeMockResponse(error.message),
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
    envLoaded,
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
  console.log(envLoaded ? '.env loaded' : '.env file not found; using shell environment only');
  console.log(notionToken ? 'NOTION_TOKEN is set' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is set' : 'NOTION_TASKS_DB_ID is not set; using mock snapshot');
  console.log(goalsDbId ? 'NOTION_GOALS_DB_ID is set' : 'NOTION_GOALS_DB_ID is not set; goals disabled');
  console.log(sessionsDbId ? 'NOTION_SESSIONS_DB_ID is set' : 'NOTION_SESSIONS_DB_ID is not set; sessions disabled');
  console.log(projectsDbId ? 'NOTION_PROJECTS_DB_ID is set' : 'NOTION_PROJECTS_DB_ID is not set; projects disabled');
  console.log(dreamsDbId ? 'NOTION_DREAMS_DB_ID is set' : 'NOTION_DREAMS_DB_ID is not set; dreams disabled');
  console.log(signalsDbId ? 'NOTION_SIGNALS_DB_ID is set' : 'NOTION_SIGNALS_DB_ID is not set; signals disabled');
});
