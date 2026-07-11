const SECRET_KEY = 'lifemap.assistant.writeSecret.session';

export function emptySnapshot(source = 'loading', warning = '') {
  const isOffline = source === 'api-offline';
  return {
    meta: {
      source,
      version: 'empty-ui-state',
      updatedAt: new Date().toISOString(),
      warnings: warning ? [warning] : [],
      connected: { tasks: false, goals: false, sessions: false, projectAreas: false, dreams: false, signals: false },
    },
    currentFocus: {
      id: isOffline ? 'api-offline' : 'loading',
      title: isOffline ? 'API недоступен' : 'Загрузка данных',
      project: 'LifeMap',
      status: isOffline ? 'offline' : 'loading',
      progress: 0,
      nextAction: isOffline ? 'Проверь доступ к LifeMap и состояние backend API.' : 'Жду ответ backend API.',
    },
    goals: [], tasks: [], sessions: [], projectAreas: [], dreams: [], signals: [],
    planning: { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  };
}

export function apiCandidates(path) {
  if (typeof window === 'undefined') return [path];
  const origin = window.location.origin;
  const candidates = [path];
  const codespaceApiOrigin = origin.replace(/-\d+\.app\.github\.dev$/i, '-3001.app.github.dev');
  if (codespaceApiOrigin !== origin) candidates.push(`${codespaceApiOrigin}${path}`);

  const localApiOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001'];
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    localApiOrigins.forEach((apiOrigin) => {
      if (apiOrigin !== origin) candidates.push(`${apiOrigin}${path}`);
    });
  }

  return [...new Set(candidates)];
}

function readAccessSecret() {
  if (typeof window === 'undefined') return '';
  try { return window.sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function writeAccessSecret(value = '') {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(SECRET_KEY, value);
    else window.sessionStorage.removeItem(SECRET_KEY);
  } catch {}
}

export function encodeLifeMapSecretHeader(value = '') {
  const secret = String(value || '');
  return secret ? `uri:${encodeURIComponent(secret)}` : '';
}

function mutatingMethod(options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function requestNeedsSecret(options = {}) {
  return options.requiresSecret === true || mutatingMethod(options);
}

function fetchOptions(options = {}, secret = '') {
  const { requiresSecret: _requiresSecret, ...clean } = options;
  const encodedSecret = encodeLifeMapSecretHeader(secret);
  return {
    ...clean,
    credentials: 'include',
    headers: {
      ...(clean.headers || {}),
      ...(encodedSecret ? { 'X-LifeMap-Assistant-Secret': encodedSecret } : {}),
    },
  };
}

function promptForAccessKey() {
  if (typeof window === 'undefined') return '';
  return window.prompt('Введите ключ доступа LifeMap:') || '';
}

export async function requestJson(path, options = {}) {
  const errors = [];
  const needsSecret = requestNeedsSecret(options);
  let secret = needsSecret ? readAccessSecret() : '';
  let prompted = false;

  for (const url of apiCandidates(path)) {
    while (true) {
      const effectiveOptions = fetchOptions(options, secret);
      try {
        const response = await fetch(url, {
          ...effectiveOptions,
          headers: {
            Accept: 'application/json',
            ...(effectiveOptions.body ? { 'Content-Type': 'application/json' } : {}),
            ...(effectiveOptions.headers || {}),
          },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
          if (response.status === 403 && needsSecret && !prompted) {
            prompted = true;
            if (secret) writeAccessSecret('');
            secret = promptForAccessKey();
            if (secret) {
              writeAccessSecret(secret);
              continue;
            }
          }
          const error = new Error(data.error || data.details || `API ${response.status}`);
          error.apiResponse = true;
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (error) {
        if (error.apiResponse) throw error;
        errors.push(`${url}: ${error.message}`);
        break;
      }
    }
  }
  throw new Error(errors.join(' | '));
}

function normalizedSignalKey(signal = {}) {
  if (signal.sourceUrl) return `url:${String(signal.sourceUrl).trim().toLowerCase()}`;
  const title = String(signal.title || '').trim().toLowerCase();
  const summary = String(signal.summary || signal.originalText || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
  return `text:${title}|${summary}`;
}

function signalQuality(signal = {}) {
  const archivedPenalty = /archived|архив/i.test(String(signal.status || '')) ? -100000 : 0;
  const analysisScore = signal.aiProcessingVersion ? 5000 : 0;
  const assetScore = Array.isArray(signal.assets) ? signal.assets.length * 500 : 0;
  const contentScore = String(signal.summary || '').length + String(signal.assistantNote || '').length + String(signal.possibleUse || '').length;
  return archivedPenalty + analysisScore + assetScore + contentScore;
}

export function dedupeInboxSignals(signals = []) {
  const byKey = new Map();
  signals.forEach((signal) => {
    const key = normalizedSignalKey(signal);
    const existing = byKey.get(key);
    if (!existing || signalQuality(signal) > signalQuality(existing)) byKey.set(key, signal);
  });
  return [...byKey.values()];
}

export async function fetchSnapshot() {
  const data = await requestJson('/api/life-os/snapshot', { requiresSecret: true });
  return { ...data, meta: { ...(data.meta || {}), apiUrl: data.meta?.apiUrl || '/api/life-os/snapshot' } };
}

export async function patchTask(taskId, payload) {
  return requestJson(`/api/life-os/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function patchSignal(signalId, payload) {
  return requestJson(`/api/life-os/signals/${signalId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function patchItemTitle(node, title) {
  return requestJson(`/api/life-os/items/${node.sourceId}/title`, { method: 'PATCH', body: JSON.stringify({ kind: node.kind, title }) });
}

export async function fetchInboxAssets() {
  const data = await requestJson('/api/life-os/inbox/assets', { requiresSecret: true });
  return dedupeInboxSignals(Array.isArray(data.signals) ? data.signals : []);
}

export async function reprocessInboxSignals({ secret = '', onlyMissing = true } = {}) {
  if (secret) writeAccessSecret(secret);
  return requestJson('/api/life-os/inbox/reprocess', {
    method: 'POST',
    body: JSON.stringify({ onlyMissing }),
  });
}

export async function fetchInboxReprocessStatus() {
  return requestJson('/api/life-os/inbox/reprocess/status', { requiresSecret: true });
}

export function attachmentDownloadUrl(signalId) {
  return `/api/life-os/inbox/files/${encodeURIComponent(signalId)}`;
}

export async function fetchAssistantStatus() {
  return requestJson('/api/life-os/assistant/status', { requiresSecret: true });
}

export async function postAssistantChat({ message, messages = [], target = null, context = {}, executeActions = false, secret = '' }) {
  if (secret) writeAccessSecret(secret);
  return requestJson('/api/life-os/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message, messages, target, context, executeActions }),
  });
}

export async function executeAssistantActions({ actions = [], secret = '' }) {
  if (secret) writeAccessSecret(secret);
  return requestJson('/api/life-os/assistant/actions', {
    method: 'POST',
    body: JSON.stringify({ actions }),
  });
}

export function dataState(snapshot, apiState) {
  if (apiState === 'api offline' || snapshot.meta?.source === 'api-offline') return 'api offline';
  if (apiState === 'loading') return 'loading';
  if (snapshot.meta?.source?.includes('mock')) return 'mock data';
  return apiState;
}
