import fs from 'node:fs';
import path from 'node:path';
import {
  archiveDuplicateSignals,
  createSignal,
  createWorkSession,
  getNotionSnapshot,
  mockSnapshot,
  updateItemTitle,
  updateTaskEvent,
} from './notionAdapter.js';
import { readLocalSignals } from './telegramAdapter.js';
import { createLifeMapAiService } from './lifemapAi.js';

export function loadLocalEnv() {
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

function uniqueSignals(signals = []) {
  const byKey = new Map();
  signals.forEach((signal) => {
    const key = signal.sourceUrl || signal.id || `${signal.title}:${signal.capturedAt}`;
    const existing = byKey.get(key);
    const score = String(signal.summary || '').length + String(signal.assistantNote || '').length + (signal.sourceUrl ? 500 : 0);
    const oldScore = existing ? String(existing.summary || '').length + String(existing.assistantNote || '').length + (existing.sourceUrl ? 500 : 0) : -1;
    if (!existing || score > oldScore) byKey.set(key, signal);
  });
  return [...byKey.values()];
}

function normalizePayload(payload = {}) {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return {};
    try { return JSON.parse(trimmed); } catch { return { note: trimmed }; }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

export function createLifeMapRuntime({ envLoaded = false } = {}) {
  const config = {
    port: Number(process.env.API_PORT || 3001),
    notionToken: process.env.NOTION_TOKEN,
    tasksDbId: process.env.NOTION_TASKS_DB_ID,
    goalsDbId: process.env.NOTION_GOALS_DB_ID,
    sessionsDbId: process.env.NOTION_SESSIONS_DB_ID,
    projectsDbId: process.env.NOTION_PROJECTS_DB_ID,
    dreamsDbId: process.env.NOTION_DREAMS_DB_ID,
    signalsDbId: process.env.NOTION_SIGNALS_DB_ID,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    telegramAllowedUserIds: process.env.TELEGRAM_ALLOWED_USER_IDS || '',
    telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    assistantSecret: process.env.LIFEMAP_ASSISTANT_API_SECRET || '',
    envLoaded,
  };
  const ai = createLifeMapAiService(process.env);

  function makeMockResponse(reason) {
    return {
      ...mockSnapshot,
      meta: {
        ...mockSnapshot.meta,
        source: 'mock-backend-snapshot',
        updatedAt: new Date().toISOString(),
        warnings: [reason].filter(Boolean),
        connected: { tasks: false, goals: false, sessions: false, projectAreas: false, dreams: false, signals: false, telegram: Boolean(config.telegramBotToken) },
      },
    };
  }

  function prepareSnapshot(snapshot) {
    const localSignals = readLocalSignals(50);
    const warnings = snapshot.meta?.warnings || [];
    const critical = warnings.filter((message) => /Tasks DB|NOTION_TOKEN|NOTION_TASKS_DB_ID/i.test(message));
    return {
      ...snapshot,
      planning: computePlanning(snapshot.tasks || []),
      signals: uniqueSignals([...localSignals, ...(snapshot.signals || [])]),
      meta: {
        ...(snapshot.meta || {}),
        warnings: critical,
        notices: warnings.filter((message) => !critical.includes(message)),
        connected: {
          ...(snapshot.meta?.connected || {}),
          telegram: Boolean(config.telegramBotToken),
          localTelegramInbox: Boolean(localSignals.length),
        },
      },
    };
  }

  async function buildLiveSnapshot() {
    const snapshot = await getNotionSnapshot({
      notionToken: config.notionToken,
      tasksDbId: config.tasksDbId,
      goalsDbId: config.goalsDbId,
      sessionsDbId: config.sessionsDbId,
      projectsDbId: config.projectsDbId,
      dreamsDbId: config.dreamsDbId,
      signalsDbId: config.signalsDbId,
    });
    if (snapshot) return prepareSnapshot(snapshot);
    return prepareSnapshot(makeMockResponse('NOTION_TOKEN or NOTION_TASKS_DB_ID is missing. API is returning mock data.'));
  }

  function telegramSecretOk(req) {
    if (!config.telegramWebhookSecret) return true;
    return req.get('X-Telegram-Bot-Api-Secret-Token') === config.telegramWebhookSecret;
  }

  function assistantSecretOk(req) {
    if (!config.assistantSecret) return false;
    return req.get('X-LifeMap-Assistant-Secret') === config.assistantSecret;
  }

  async function executeAction(action = {}) {
    const type = action.type || action.name || '';
    const payload = normalizePayload(action.payload);
    if (type === 'update_task') return updateTaskEvent({ notionToken: config.notionToken, taskId: payload.taskId || payload.id, event: payload.event || payload });
    if (type === 'rename_item') return updateItemTitle({ notionToken: config.notionToken, itemId: payload.itemId || payload.id, kind: payload.kind, title: payload.title });
    if (type === 'create_session') return createWorkSession({ notionToken: config.notionToken, sessionsDbId: config.sessionsDbId, payload });
    if (type === 'create_signal') return createSignal({ notionToken: config.notionToken, signalsDbId: config.signalsDbId, payload });
    if (type === 'dedupe_signals') return archiveDuplicateSignals({ notionToken: config.notionToken, signalsDbId: config.signalsDbId });
    return { skipped: true, reason: 'Planning or unsupported action.' };
  }

  async function executeActions({ actions = [], req }) {
    if (!actions.length) return [];
    if (!assistantSecretOk(req)) throw new Error('Write actions require LifeMap assistant secret.');
    const results = [];
    for (const action of actions) {
      if (action.requiresConfirmation !== false && action.confirmed !== true) {
        results.push({ action, skipped: true, reason: 'Action requires confirmation.' });
        continue;
      }
      results.push({ action, result: await executeAction(action) });
    }
    return results;
  }

  return { config, ai, buildLiveSnapshot, makeMockResponse, prepareSnapshot, telegramSecretOk, executeActions };
}
