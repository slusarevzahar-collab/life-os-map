import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import express from 'express';
import {
  archiveDuplicateSignals,
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
  enrichSignalWithTelegramDocument,
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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
const openaiApiKey = process.env.OPENAI_API_KEY;
const lifemapAiModel = process.env.LIFEMAP_AI_MODEL || 'gpt-4.1';
const lifemapAssistantSecret = process.env.LIFEMAP_ASSISTANT_API_SECRET || '';

app.use(express.json({ limit: '4mb' }));

function makeMockResponse(reason) {
  return {
    ...mockSnapshot,
    meta: {
      ...mockSnapshot.meta,
      source: 'mock-backend-snapshot',
      updatedAt: new Date().toISOString(),
      warnings: [reason].filter(Boolean),
      connected: { tasks: false, goals: false, sessions: false, projectAreas: false, dreams: false, signals: false, telegram: Boolean(telegramBotToken) },
    },
  };
}

function cleanUiWarnings(snapshot) {
  const warnings = snapshot.meta?.warnings || [];
  const criticalWarnings = warnings.filter((message) => /Tasks DB|NOTION_TOKEN|NOTION_TASKS_DB_ID/i.test(message));
  return { ...snapshot, meta: { ...(snapshot.meta || {}), warnings: criticalWarnings, notices: warnings.filter((message) => !criticalWarnings.includes(message)) } };
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

function withComputedPlanning(snapshot) { return { ...snapshot, planning: computePlanning(snapshot.tasks || []) }; }

function uniqueSignals(signals = []) {
  const byKey = new Map();
  signals.forEach((signal) => {
    const key = signal.sourceUrl || signal.id || `${signal.title}:${signal.capturedAt}`;
    const existing = byKey.get(key);
    const score = String(signal.summary || '').length + String(signal.assistantNote || '').length + (signal.sourceUrl ? 500 : 0);
    const existingScore = existing ? String(existing.summary || '').length + String(existing.assistantNote || '').length + (existing.sourceUrl ? 500 : 0) : -1;
    if (!existing || score > existingScore) byKey.set(key, signal);
  });
  return [...byKey.values()];
}

function withLocalSignals(snapshot) {
  const localSignals = readLocalSignals(50);
  return { ...snapshot, signals: uniqueSignals([...localSignals, ...(snapshot.signals || [])]), meta: { ...(snapshot.meta || {}), connected: { ...(snapshot.meta?.connected || {}), telegram: Boolean(telegramBotToken), localTelegramInbox: Boolean(localSignals.length) } } };
}

function prepareSnapshot(snapshot) { return withComputedPlanning(withLocalSignals(snapshot)); }
function telegramSecretOk(req) { if (!telegramWebhookSecret) return true; return req.get('X-Telegram-Bot-Api-Secret-Token') === telegramWebhookSecret; }
function assistantSecretOk(req) { if (!lifemapAssistantSecret) return false; return req.get('X-LifeMap-Assistant-Secret') === lifemapAssistantSecret; }

function codespacesPublicUrl(targetPort = port) {
  if (process.env.TELEGRAM_WEBHOOK_URL) return process.env.TELEGRAM_WEBHOOK_URL;
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  if (!name || process.env.CODESPACES !== 'true') return '';
  return `https://${name}-${targetPort}.${domain}/api/telegram/webhook`;
}

function execGh(args = []) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) { reject(new Error((stderr || stdout || error.message).trim())); return; }
      resolve((stdout || stderr || '').trim());
    });
  });
}

async function publishCodespacesPort() {
  if (process.env.CODESPACES !== 'true') return { skipped: true, reason: 'not-codespaces' };
  try { await execGh(['codespace', 'ports', 'visibility', `${port}:public`]); return { ok: true, port: Number(port) }; }
  catch (error) { console.warn(`LifeMap could not auto-public Codespaces port ${port}: ${error.message}`); return { ok: false, error: error.message }; }
}

async function syncTelegramWebhook() {
  if (!telegramBotToken) return { skipped: true, reason: 'missing-bot-token' };
  const webhookUrl = codespacesPublicUrl(port) || telegramWebhookUrl;
  if (!webhookUrl) return { skipped: true, reason: 'missing-webhook-url' };
  try { const result = await setTelegramWebhook({ botToken: telegramBotToken, webhookUrl, secretToken: telegramWebhookSecret }); console.log(`LifeMap Telegram webhook synced: ${webhookUrl}`); return { ok: true, webhookUrl, result }; }
  catch (error) { console.warn(`LifeMap Telegram webhook sync failed: ${error.message}`); return { ok: false, webhookUrl, error: error.message }; }
}

async function buildLiveSnapshot() {
  const notionSnapshot = await getNotionSnapshot({ notionToken, tasksDbId, goalsDbId, sessionsDbId, projectsDbId, dreamsDbId, signalsDbId });
  if (notionSnapshot) return prepareSnapshot(cleanUiWarnings(notionSnapshot));
  return prepareSnapshot(makeMockResponse('NOTION_TOKEN or NOTION_TASKS_DB_ID is missing. API is returning mock data.'));
}

function compactForAssistant(snapshot = {}, target = {}) {
  const tasks = (snapshot.tasks || []).slice(0, 80).map((task) => ({ id: task.id, code: task.code, title: task.title, project: task.project, goalName: task.goalName, status: task.status, priority: task.priority, progress: task.progress, nextAction: task.nextAction, notes: task.sessionNotes }));
  const signals = (snapshot.signals || []).slice(0, 40).map((signal) => ({ id: signal.id, title: signal.title, type: signal.type, category: signal.aiCategory, status: signal.status, priority: signal.priority, relatedProjects: signal.relatedProjects, summary: String(signal.summary || '').slice(0, 1200), possibleUse: signal.possibleUse, sourceUrl: signal.sourceUrl }));
  const goals = (snapshot.goals || []).slice(0, 30).map((goal) => ({ id: goal.id, title: goal.title, area: goal.area, status: goal.status, progress: goal.progress, nextAction: goal.nextAction }));
  return { meta: snapshot.meta, currentFocus: snapshot.currentFocus, planning: snapshot.planning, target, tasks, goals, signals };
}

function assistantSystemPrompt() {
  return [
    'Ты — LifeMap AI Assistant, встроенный помощник внутри карты Захара.',
    'LifeMap — веб-навигатор для проектов, задач, целей, AI Inbox и будущих AI-агентов.',
    'Отвечай по-русски, коротко, практично, без воды.',
    'Ты видишь контекст карты, текущий фокус, задачи, сигналы AI Inbox и выбранный объект.',
    'Ты можешь предлагать действия, но не должен самовольно превращать каждый входящий сигнал в задачу.',
    'Сейчас жёсткое разделение зон между GPT и Claude Code снято: можно предлагать backend_change_request, frontend_change_request или обычные LifeMap-действия по ситуации.',
    'Возвращай только JSON по схеме: reply, summary, proposedActions, warnings, nextStep.',
    'proposedActions — массив действий с полями type, title, payload, requiresConfirmation, risk. payload должен быть JSON-строкой, например "{}" или "{\"taskId\":\"...\"}". Разрешённые исполняемые type: update_task, rename_item, create_session, create_signal, dedupe_signals. Неисполняемые плановые type: frontend_change_request, backend_change_request, research_request.',
  ].join('\n');
}

function assistantResponseSchema() {
  return {
    type: 'json_schema',
    name: 'lifemap_assistant_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string' },
        summary: { type: 'string' },
        proposedActions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string' },
              title: { type: 'string' },
              payload: { type: 'string' },
              requiresConfirmation: { type: 'boolean' },
              risk: { type: 'string' },
            },
            required: ['type', 'title', 'payload', 'requiresConfirmation', 'risk'],
          },
        },
        warnings: { type: 'array', items: { type: 'string' } },
        nextStep: { type: 'string' },
      },
      required: ['reply', 'summary', 'proposedActions', 'warnings', 'nextStep'],
    },
  };
}

function extractResponseText(data = {}) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  (data.output || []).forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    });
  });
  return chunks.join('\n').trim();
}

function parseAssistantJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Assistant returned empty response.');
  try { return JSON.parse(raw); }
  catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Assistant response is not JSON.');
    return JSON.parse(match[0]);
  }
}

function normalizePayload(payload = {}) {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return {};
    try { return JSON.parse(trimmed); }
    catch (_error) { return { note: trimmed }; }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

async function callOpenAiAssistant({ message, messages = [], target = {}, clientContext = {}, snapshot }) {
  if (!openaiApiKey) {
    return {
      reply: 'AI-ключ ещё не подключён. Добавь OPENAI_API_KEY в .env, перезапусти API, и этот чат начнёт отвечать как настоящий помощник LifeMap.',
      summary: 'OpenAI API key missing.',
      proposedActions: [{ type: 'backend_change_request', title: 'Добавить OPENAI_API_KEY в .env', payload: '{"env":"OPENAI_API_KEY"}', requiresConfirmation: true, risk: 'needs-secret' }],
      warnings: ['OPENAI_API_KEY is missing.'],
      nextStep: 'Добавить OPENAI_API_KEY и перезапустить npm run api.',
      mode: 'mock-missing-openai-key',
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
    body: JSON.stringify({
      model: lifemapAiModel,
      instructions: assistantSystemPrompt(),
      input: JSON.stringify({ message, messages, target, clientContext, lifemap: compactForAssistant(snapshot, target) }),
      max_output_tokens: 2200,
      text: { format: assistantResponseSchema() },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `OpenAI API ${response.status}`);
  return { ...parseAssistantJson(extractResponseText(data)), responseId: data.id, model: data.model };
}

function normalizeAction(action = {}) {
  return {
    type: action.type || action.name || '',
    title: action.title || action.type || 'LifeMap action',
    payload: normalizePayload(action.payload),
    requiresConfirmation: action.requiresConfirmation !== false,
    confirmed: action.confirmed === true,
    risk: action.risk || 'medium',
  };
}

async function executeAssistantAction(action) {
  const normalized = normalizeAction(action);
  const payload = normalized.payload || {};
  if (normalized.type === 'update_task') {
    const taskId = payload.taskId || payload.id;
    const event = payload.event || payload;
    return { action: normalized, result: await updateTaskEvent({ notionToken, taskId, event }) };
  }
  if (normalized.type === 'rename_item') {
    return { action: normalized, result: await updateItemTitle({ notionToken, itemId: payload.itemId || payload.id, kind: payload.kind, title: payload.title }) };
  }
  if (normalized.type === 'create_session') {
    return { action: normalized, result: await createWorkSession({ notionToken, sessionsDbId, payload }) };
  }
  if (normalized.type === 'create_signal') {
    return { action: normalized, result: await createSignal({ notionToken, signalsDbId, payload }) };
  }
  if (normalized.type === 'dedupe_signals') {
    return { action: normalized, result: await archiveDuplicateSignals({ notionToken, signalsDbId }) };
  }
  return { action: normalized, skipped: true, reason: 'Action is not executable by backend yet or is a planning/code request.' };
}

async function executeAssistantActions({ actions = [], req }) {
  if (!actions.length) return [];
  if (!assistantSecretOk(req)) throw new Error('Write actions require LIFEMAP_ASSISTANT_API_SECRET and X-LifeMap-Assistant-Secret header.');
  const results = [];
  for (const action of actions.map(normalizeAction)) {
    if (action.requiresConfirmation !== false && !action.confirmed) {
      results.push({ action, skipped: true, reason: 'Action requires confirmation.' });
      continue;
    }
    results.push(await executeAssistantAction(action));
  }
  return results;
}

app.get('/api/life-os/snapshot', async (_req, res) => {
  try {
    res.json(await buildLiveSnapshot());
  } catch (error) {
    console.error('LifeMap Notion API error:', error.message);
    res.status(500).json({ error: 'Failed to build LifeMap snapshot', details: error.message, fallback: prepareSnapshot(makeMockResponse(error.message)) });
  }
});

app.post('/api/life-os/sessions', async (req, res) => {
  try { const result = await createWorkSession({ notionToken, sessionsDbId, payload: req.body || {} }); res.status(201).json({ ok: true, session: result }); }
  catch (error) { console.error('LifeMap create session error:', error.message); res.status(500).json({ ok: false, error: error.message }); }
});

app.patch('/api/life-os/tasks/:id', async (req, res) => {
  try { const result = await updateTaskEvent({ notionToken, taskId: req.params.id, event: req.body || {} }); res.json({ ok: true, task: result }); }
  catch (error) { console.error('LifeMap update task error:', error.message); res.status(500).json({ ok: false, error: error.message }); }
});

app.patch('/api/life-os/items/:id/title', async (req, res) => {
  try { const result = await updateItemTitle({ notionToken, itemId: req.params.id, kind: req.body?.kind, title: req.body?.title }); res.json({ ok: true, item: result }); }
  catch (error) { console.error('LifeMap update title error:', error.message); res.status(500).json({ ok: false, error: error.message }); }
});

app.post('/api/life-os/signals/dedupe', async (_req, res) => {
  try {
    const result = await archiveDuplicateSignals({ notionToken, signalsDbId });
    res.json({ ok: true, result });
  } catch (error) {
    console.error('LifeMap signal dedupe error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/life-os/assistant/status', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(openaiApiKey),
    model: lifemapAiModel,
    executionProtected: true,
    canExecuteActions: Boolean(lifemapAssistantSecret),
    endpoints: ['POST /api/life-os/assistant/chat', 'POST /api/life-os/assistant/actions', 'GET /api/life-os/assistant/status'],
    executableActions: ['update_task', 'rename_item', 'create_session', 'create_signal', 'dedupe_signals'],
    planningActions: ['frontend_change_request', 'backend_change_request', 'research_request'],
  });
});

app.post('/api/life-os/assistant/chat', async (req, res) => {
  try {
    const snapshot = await buildLiveSnapshot();
    const assistant = await callOpenAiAssistant({ message: req.body?.message || '', messages: req.body?.messages || [], target: req.body?.target || {}, clientContext: req.body?.context || {}, snapshot });
    let executedActions = [];
    if (req.body?.executeActions === true) executedActions = await executeAssistantActions({ actions: assistant.proposedActions || [], req });
    res.json({ ok: true, assistant, executedActions, snapshotMeta: snapshot.meta });
  } catch (error) {
    console.error('LifeMap assistant chat error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/life-os/assistant/actions', async (req, res) => {
  try {
    const executedActions = await executeAssistantActions({ actions: req.body?.actions || [], req });
    res.json({ ok: true, executedActions });
  } catch (error) {
    console.error('LifeMap assistant actions error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/telegram/webhook', async (req, res) => {
  if (!telegramSecretOk(req)) { res.status(403).json({ ok: false, error: 'Bad Telegram webhook secret.' }); return; }
  const baseSignal = buildSignalFromTelegramUpdate(req.body || {});
  if (!baseSignal) { res.json({ ok: true, skipped: true }); return; }
  const signal = await enrichSignalWithTelegramDocument({ signal: baseSignal, botToken: telegramBotToken });
  if (!allowedTelegramUser(signal, telegramAllowedUserIds)) { console.warn(`LifeMap Telegram rejected message from ${signal.telegram?.userId || signal.telegram?.chatId || 'unknown user'}`); res.json({ ok: true, rejected: true }); return; }

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

  sendTelegramMessage({ botToken: telegramBotToken, chatId: signal.telegram?.chatId, text: `Принял в LifeMap AI Inbox: ${signal.title}\nХранилище: ${storage}` }).catch((error) => console.warn(`LifeMap Telegram ack failed: ${error.message}`));
  res.json({ ok: true, storage, signal: { id: signal.id, title: signal.title }, notion: notionResult });
});

app.post('/api/telegram/set-webhook', async (req, res) => {
  try { const webhookUrl = req.body?.url || telegramWebhookUrl || codespacesPublicUrl(port); const result = await setTelegramWebhook({ botToken: telegramBotToken, webhookUrl, secretToken: telegramWebhookSecret }); res.json({ ok: true, webhookUrl, result }); }
  catch (error) { console.error('LifeMap set Telegram webhook error:', error.message); res.status(500).json({ ok: false, error: error.message }); }
});

app.get('/api/telegram/status', async (_req, res) => {
  try {
    const webhook = telegramBotToken ? await getTelegramWebhookInfo(telegramBotToken) : null;
    res.json({ ok: true, configured: Boolean(telegramBotToken), hasSecret: Boolean(telegramWebhookSecret), allowedUsersLocked: Boolean(telegramAllowedUserIds), signalsDb: Boolean(signalsDbId), localSignals: readLocalSignals(50).length, computedWebhookUrl: codespacesPublicUrl(port) || telegramWebhookUrl || '', webhook });
  } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});

app.get('/api/life-os/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'lifemap-api',
    port: Number(port),
    envLoaded,
    endpoints: ['GET /api/life-os/snapshot', 'POST /api/life-os/sessions', 'PATCH /api/life-os/tasks/:id', 'PATCH /api/life-os/items/:id/title', 'POST /api/life-os/signals/dedupe', 'GET /api/life-os/assistant/status', 'POST /api/life-os/assistant/chat', 'POST /api/life-os/assistant/actions', 'POST /api/telegram/webhook', 'POST /api/telegram/set-webhook', 'GET /api/telegram/status', 'GET /api/life-os/health'],
    notion: { token: Boolean(notionToken), tasks: Boolean(tasksDbId), goals: Boolean(goalsDbId), sessions: Boolean(sessionsDbId), projects: Boolean(projectsDbId), dreams: Boolean(dreamsDbId), signals: Boolean(signalsDbId) },
    telegram: { token: Boolean(telegramBotToken), secret: Boolean(telegramWebhookSecret), allowedUsersLocked: Boolean(telegramAllowedUserIds), webhookUrl: Boolean(telegramWebhookUrl || codespacesPublicUrl(port)) },
    assistant: { openai: Boolean(openaiApiKey), model: lifemapAiModel, actionSecret: Boolean(lifemapAssistantSecret) },
  });
});

app.listen(port, async () => {
  console.log(`LifeMap API listening on http://localhost:${port}`);
  console.log(envLoaded ? '.env loaded' : '.env not found; using process env');
  console.log(notionToken ? 'NOTION_TOKEN is available' : 'NOTION_TOKEN is not set; using mock snapshot');
  console.log(tasksDbId ? 'NOTION_TASKS_DB_ID is available' : 'NOTION_TASKS_DB_ID is not set; tasks disabled');
  console.log(goalsDbId ? 'NOTION_GOALS_DB_ID is available' : 'NOTION_GOALS_DB_ID is not set; goals disabled');
  console.log(sessionsDbId ? 'NOTION_SESSIONS_DB_ID is available' : 'NOTION_SESSIONS_DB_ID is not set; sessions disabled');
  console.log(projectsDbId ? 'NOTION_PROJECTS_DB_ID is available' : 'NOTION_PROJECTS_DB_ID is not set; project areas disabled');
  console.log(dreamsDbId ? 'NOTION_DREAMS_DB_ID is available' : 'NOTION_DREAMS_DB_ID is not set; dreams disabled');
  console.log(signalsDbId ? 'NOTION_SIGNALS_DB_ID is available' : 'NOTION_SIGNALS_DB_ID is not set; AI Inbox disabled');
  console.log(openaiApiKey ? `OPENAI_API_KEY is available; LifeMap assistant model: ${lifemapAiModel}` : 'OPENAI_API_KEY is not set; LifeMap assistant returns setup guidance');
  console.log(lifemapAssistantSecret ? 'LIFEMAP_ASSISTANT_API_SECRET is set; assistant write-actions enabled with header secret' : 'LIFEMAP_ASSISTANT_API_SECRET is not set; assistant write-actions are blocked');
  const portResult = await publishCodespacesPort();
  if (portResult?.ok) console.log(`LifeMap Codespaces port ${port} is public.`);
  await syncTelegramWebhook();
});
