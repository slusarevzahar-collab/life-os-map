import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  createSignal,
  createWorkSession,
  getNotionSnapshot,
  mockSnapshot,
  updateItemTitle,
  updateTaskEvent,
} from './server/notionAdapter.js';
import {
  allowedTelegramUser,
  appendLocalSignal,
  buildSignalFromTelegramUpdate,
  getTelegramWebhookInfo,
  readLocalSignals,
  sendTelegramMessage,
  setTelegramWebhook,
} from './server/telegramAdapter.js';

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
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const telegramAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS || '';
const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

app.use(express.json({ limit: '2mb' }));

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
        telegram: Boolean(telegramBotToken),
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

function computePlanning(tasks = []) {
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

function withComputedPlanning(snapshot) {
  return { ...snapshot, planning: computePlanning(snapshot.tasks || []) };
}

function uniqueSignals(signals = []) {
  const seen = new Set();
  return signals.filter((signal) => {
    const key = signal.id || `${signal.title}:${signal.capturedAt}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withLocalSignals(snapshot) {
  const localSignals = readLocalSignals(50);
  return {
    ...snapshot,
    signals: uniqueSignals([...localSignals, ...(snapshot.signals || [])]),
    meta: {
      ...(snapshot.meta || {}),
      connected: {
        ...(snapshot.meta?.connected || {}),
        telegram: Boolean(telegramBotToken),
        localTelegramInbox: Boolean(localSignals.length),
      },
    },
  };
}

function prepareSnapshot(snapshot) {
  return withComputedPlanning(withLocalSignals(snapshot));
}

function telegramSecretOk(req) {
  if (!telegramWebhookSecret) return true;
  return req.get('X-Telegram-Bot-Api-Secret-Token') === telegramWebhookSecret;
}

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    const notionSnapshot = await getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId });
    if (notionSnapshot) {
      res.json(prepareSnapshot(cleanUiWarnings(notionSnapshot)));
      return;
    }

    res.json(prepareSnapshot(makeMockResponse('NOTION_TOKEN or NOTION_TASKS_DB_ID is missing. API is returning mock data.')));
  } catch (error) {
    console.error('LifeMap Notion API error:', error.message);
    res.status(500).json({
      error: 'Failed to build LifeMap snapshot',
      details: error.message,
      fallback: prepareSnapshot(makeMockResponse(error.message)),
    });
  }
});

app.post('/api/life-os/sessions', async (req, res) => {
  try {
    const result = await createWorkSession({ notionToken, sessionsDbId, payload: req.body || {} });
    res.status(201).json({ ok: true, session: result });
  } catch (error) {
    console.error('LifeMap create session error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch('/api/life-os/tasks/:id', async (req, res) => {
  try {
    const result = await updateTaskEvent({ notionToken, taskId: req.params.id, event: req.body || {} });
    res.json({ ok: true, task: result });
  } catch (error) {
    console.error('LifeMap update task error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch('/api/life-os/items/:id/title', async (req, res) => {
  try {
    const result = await updateItemTitle({ notionToken, itemId: req.params.id, kind: req.body?.kind, title: req.body?.title });
    res.json({ ok: true, item: result });
  } catch (error) {
    console.error('LifeMap update title error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/telegram/webhook', async (req, res) => {
  if (!telegramSecretOk(req)) {
    res.status(403).json({ ok: false, error: 'Bad Telegram webhook secret.' });
    return;
  }

  const signal = buildSignalFromTelegramUpdate(req.body || {});
  if (!signal) {
    res.json({ ok: true, skipped: true });
    return;
  }

  if (!allowedTelegramUser(signal, telegramAllowedUserIds)) {
    console.warn(`LifeMap Telegram rejected message from ${signal.telegram?.userId || signal.telegram?.chatId || 'unknown user'}`);
    res.json({ ok: true, rejected: true });
    return;
  }

  let storage = 'local';
  let notionResult = null;
  try {
    if (!notionToken || !signalsDbId) throw new Error('NOTION_TOKEN or NOTION_SIGNALS_DB_ID is missing.');
    notionResult = await createSignal({ notionToken, signalsDbId, payload: signal });
    storage = `notion:${notionResult.mode}`;
  } catch (error) {
    appendLocalSignal({ ...signal, storageError: error.message });
    storage = 'local-fallback';
    console.warn(`LifeMap Telegram saved signal locally: ${error.message}`);
  }

  sendTelegramMessage({
    botToken: telegramBotToken,
    chatId: signal.telegram?.chatId,
    text: `Принял в LifeMap AI Inbox: ${signal.title}\nХранилище: ${storage}`,
  }).catch((error) => console.warn(`LifeMap Telegram ack failed: ${error.message}`));

  res.json({ ok: true, storage, signal: { id: signal.id, title: signal.title }, notion: notionResult });
});

app.post('/api/telegram/set-webhook', async (req, res) => {
  try {
    const webhookUrl = req.body?.url || telegramWebhookUrl;
    const result = await setTelegramWebhook({ botToken: telegramBotToken, webhookUrl, secretToken: telegramWebhookSecret });
    res.json({ ok: true, webhookUrl, result });
  } catch (error) {
    console.error('LifeMap set Telegram webhook error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/telegram/status', async (_req, res) => {
  try {
    const webhook = telegramBotToken ? await getTelegramWebhookInfo(telegramBotToken) : null;
    res.json({
      ok: true,
      configured: Boolean(telegramBotToken),
      hasSecret: Boolean(telegramWebhookSecret),
      allowedUsersLocked: Boolean(telegramAllowedUserIds),
      signalsDb: Boolean(signalsDbId),
      localSignals: readLocalSignals(50).length,
      webhook,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/life-os/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'lifemap-api',
    port,
    envLoaded,
    endpoints: [
      'GET /api/life-os/snapshot',
      'POST /api/life-os/sessions',
      'PATCH /api/life-os/tasks/:id',
      'PATCH /api/life-os/items/:id/title',
      'POST /api/telegram/webhook',
      'POST /api/telegram/set-webhook',
      'GET /api/telegram/status',
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
    telegram: {
      token: Boolean(telegramBotToken),
      secret: Boolean(telegramWebhookSecret),
      allowedUsersLocked: Boolean(telegramAllowedUserIds),
      webhookUrl: Boolean(telegramWebhookUrl),
      localSignals: readLocalSignals(50).length,
    },
  });
});

app.listen(port, () => {
  console.log(`LifeMap API listening on http://localhost:${port}`);
  console.log(envLoaded ? '.env loaded' : '.env file not found; using shell environment only');
  console.log(notionToken ? 'NOTION_TOKEN is set' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is set' : 'NOTION_TASKS_DB_ID is not set; using mock snapshot');
  console.log(goalsDbId ? 'NOTION_GOALS_DB_ID is set' : 'NOTION_GOALS_DB_ID is not set; goals disabled');
  console.log(sessionsDbId ? 'NOTION_SESSIONS_DB_ID is set' : 'NOTION_SESSIONS_DB_ID is not set; sessions disabled');
  console.log(projectsDbId ? 'NOTION_PROJECTS_DB_ID is set' : 'NOTION_PROJECTS_DB_ID is not set; projects disabled');
  console.log(dreamsDbId ? 'NOTION_DREAMS_DB_ID is set' : 'NOTION_DREAMS_DB_ID is not set; dreams disabled');
  console.log(signalsDbId ? 'NOTION_SIGNALS_DB_ID is set' : 'NOTION_SIGNALS_DB_ID is not set; signals disabled');
  console.log(telegramBotToken ? 'TELEGRAM_BOT_TOKEN is set' : 'TELEGRAM_BOT_TOKEN is not set; Telegram intake disabled');
});
