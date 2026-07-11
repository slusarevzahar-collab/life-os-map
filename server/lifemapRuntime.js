import fs from 'node:fs';
import path from 'node:path';
import {
  archiveDuplicateSignals,
  createSignal,
  createWorkSession,
  getWorkSession,
  getNotionSnapshot,
  listWorkSessions,
  mockSnapshot,
  updateWorkSession,
  updateItemTitle,
  updateTaskEvent,
} from './notionAdapter.js';
import { readLocalSignals } from './telegramAdapter.js';
import { createLifeMapAiService } from './lifemapAi.js';
import { getInboxSignalRecord, listInboxSignalRecords, persistSignalAnalysis } from './inboxAssetStore.js';
import { createWorkSessionService } from './workSessionService.js';
import { dateKeyAt, summarizeWorkSessions, validTimezone } from './workTime.js';

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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function signalAnalysisKey(signal = {}) {
  if (signal.sourceUrl) return `url:${signal.sourceUrl}`;
  return `${String(signal.title || '').trim().toLowerCase()}|${String(signal.summary || '').trim().toLowerCase().slice(0, 700)}`;
}

function hasStoredAnalysis(signal = {}) {
  return Boolean(signal.aiProcessingVersion || signal.assistantNote || (Array.isArray(signal.assets) && signal.assets.length));
}

function publicJob(job) { return JSON.parse(JSON.stringify(job)); }

export function decodeLifeMapSecretHeader(value = '') {
  const raw = String(value || '');
  if (!raw.startsWith('uri:')) return raw;
  try { return decodeURIComponent(raw.slice(4)); } catch { return ''; }
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
    userId: process.env.LIFEMAP_USER_ID || null,
    defaultTimezone: process.env.LIFEMAP_DEFAULT_TIMEZONE || 'UTC',
    inboxReprocessDelayMs: Math.max(1200, Number(process.env.INBOX_REPROCESS_DELAY_MS || 3000)),
    envLoaded,
  };
  const ai = createLifeMapAiService(process.env);
  const workSessionStore = {
    list: (options = {}) => listWorkSessions({ notionToken: config.notionToken, sessionsDbId: config.sessionsDbId, ...options }),
    get: (sessionId) => getWorkSession({ notionToken: config.notionToken, sessionId }),
    create: (payload) => createWorkSession({ notionToken: config.notionToken, sessionsDbId: config.sessionsDbId, payload }),
    update: (sessionId, patch) => updateWorkSession({ notionToken: config.notionToken, sessionsDbId: config.sessionsDbId, sessionId, patch }),
  };
  const workSessions = createWorkSessionService({ store: workSessionStore, userId: config.userId });
  let reprocessJob = {
    id: '', status: 'idle', scanned: 0, total: 0, processed: 0, failed: 0, reused: 0,
    current: '', resumeAfter: '', startedAt: '', finishedAt: '', results: [],
  };

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
    const timezone = validTimezone(config.defaultTimezone);
    const now = new Date();
    const from = dateKeyAt(new Date(now.getTime() - (6 * 24 * 60 * 60 * 1000)), timezone);
    const to = dateKeyAt(now, timezone);
    const workTime = summarizeWorkSessions(snapshot.sessions || [], { timezone, from, to, now });
    return {
      ...snapshot,
      planning: computePlanning(snapshot.tasks || []),
      workTime: {
        activeSession: (snapshot.sessions || []).find((session) => String(session.status || '').toLowerCase() === 'active' && !session.finishedAt) || null,
        today: workTime.days.find((day) => day.dateKey === to) || null,
        period: workTime,
      },
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
    const candidate = decodeLifeMapSecretHeader(req.get('X-LifeMap-Assistant-Secret'));
    return candidate === config.assistantSecret;
  }

  async function listInboxAssets() {
    return listInboxSignalRecords({ notionToken: config.notionToken, signalsDbId: config.signalsDbId });
  }

  async function inboxSignal(signalId) {
    return getInboxSignalRecord({ notionToken: config.notionToken, signalsDbId: config.signalsDbId, signalId });
  }

  async function analyzeWithRetry(signal, snapshot, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await ai.analyzeInboxSignal({
          signal: { ...signal, rawText: signal.originalText || signal.summary || signal.assistantNote || signal.possibleUse || '' },
          snapshot,
        });
      } catch (error) {
        lastError = error;
        if (error.status === 429 && Number(error.retryAfterMs || 0) > 60000) break;
        if (attempt >= maxAttempts) break;
        const waitMs = error.retryAfterMs || (error.status === 429 ? 12000 : Math.min(10000, 2000 * attempt));
        await sleep(Math.min(waitMs + 500, 30000));
      }
    }
    throw lastError;
  }

  async function runReprocessJob(jobId, { onlyMissing = true } = {}) {
    try {
      if (!ai.status().configured) throw new Error('AI provider is not configured.');
      const snapshot = await buildLiveSnapshot();
      const records = await listInboxAssets();
      if (reprocessJob.id !== jobId) return;

      const candidates = records.filter((signal) => !onlyMissing || signal.needsReprocessing === true);
      const candidateIds = new Set(candidates.map((signal) => signal.id));
      const cache = new Map();
      records.filter((signal) => !candidateIds.has(signal.id) && hasStoredAnalysis(signal)).forEach((signal) => {
        cache.set(signalAnalysisKey(signal), {
          ...signal,
          assets: Array.isArray(signal.assets) ? signal.assets : [],
          aiProcessing: signal.aiProcessingVersion ? { policyVersion: signal.aiProcessingVersion } : undefined,
        });
      });
      reprocessJob.scanned = records.length;
      reprocessJob.total = candidates.length;

      if (!candidates.length) {
        reprocessJob.status = 'completed';
        reprocessJob.current = '';
        reprocessJob.finishedAt = new Date().toISOString();
        return;
      }

      for (let index = 0; index < candidates.length; index += 1) {
        const signal = candidates[index];
        if (reprocessJob.id !== jobId || !['running', 'waiting_rate_limit'].includes(reprocessJob.status)) return;
        reprocessJob.status = 'running';
        reprocessJob.resumeAfter = '';
        reprocessJob.current = signal.title;
        const key = signalAnalysisKey(signal);

        try {
          let analysis = cache.get(key);
          const wasReused = Boolean(analysis);
          if (wasReused) reprocessJob.reused += 1;
          else {
            analysis = await analyzeWithRetry(signal, snapshot);
            cache.set(key, analysis);
          }
          const stored = await persistSignalAnalysis({ notionToken: config.notionToken, signalId: signal.id, analysis });
          reprocessJob.processed += 1;
          reprocessJob.results.push({ id: signal.id, title: signal.title, ok: true, assets: stored.assets, reused: wasReused });
        } catch (error) {
          const retryMs = Number(error.retryAfterMs || 0);
          if (error.status === 429 && retryMs > 60000) {
            reprocessJob.status = 'waiting_rate_limit';
            reprocessJob.resumeAfter = new Date(Date.now() + retryMs).toISOString();
            reprocessJob.current = signal.title;
            await sleep(retryMs + 1000);
            if (reprocessJob.id !== jobId) return;
            reprocessJob.status = 'running';
            reprocessJob.resumeAfter = '';
            index -= 1;
            continue;
          }
          reprocessJob.failed += 1;
          reprocessJob.results.push({ id: signal.id, title: signal.title, ok: false, error: error.message, status: error.status || 0 });
        }

        if (reprocessJob.processed + reprocessJob.failed < reprocessJob.total) await sleep(config.inboxReprocessDelayMs);
      }

      reprocessJob.status = reprocessJob.failed ? 'completed_with_errors' : 'completed';
      reprocessJob.current = '';
      reprocessJob.resumeAfter = '';
      reprocessJob.finishedAt = new Date().toISOString();
    } catch (error) {
      if (reprocessJob.id !== jobId) return;
      reprocessJob.status = 'failed';
      reprocessJob.current = '';
      reprocessJob.resumeAfter = '';
      reprocessJob.finishedAt = new Date().toISOString();
      reprocessJob.results.push({ ok: false, error: error.message });
    }
  }

  async function startInboxReprocessJob({ onlyMissing = true } = {}) {
    if (['running', 'waiting_rate_limit'].includes(reprocessJob.status)) return publicJob(reprocessJob);
    const jobId = `inbox-${Date.now()}`;
    reprocessJob = {
      id: jobId, status: 'running', scanned: 0, total: 0, processed: 0, failed: 0, reused: 0,
      current: '', resumeAfter: '', startedAt: new Date().toISOString(), finishedAt: '', results: [],
    };
    runReprocessJob(jobId, { onlyMissing }).catch((error) => console.warn(`LifeMap Inbox reprocess job failed: ${error.message}`));
    return publicJob(reprocessJob);
  }

  function inboxReprocessJobStatus() { return publicJob(reprocessJob); }

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

  return {
    config,
    ai,
    buildLiveSnapshot,
    makeMockResponse,
    prepareSnapshot,
    telegramSecretOk,
    assistantSecretOk,
    listInboxAssets,
    inboxSignal,
    startInboxReprocessJob,
    inboxReprocessJobStatus,
    executeActions,
    workSessions,
  };
}
