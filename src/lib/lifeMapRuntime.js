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
      nextAction: isOffline ? 'Запусти backend: npm run api, затем обнови карту.' : 'Жду ответ backend API.',
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

function readWriteSecret() {
  if (typeof window === 'undefined') return '';
  try { return window.sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function writeWriteSecret(value = '') {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(SECRET_KEY, value);
    else window.sessionStorage.removeItem(SECRET_KEY);
  } catch {}
}

function mutatingMethod(options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function withWriteSecret(options = {}, secret = '') {
  if (!mutatingMethod(options) || !secret) return options;
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-LifeMap-Assistant-Secret': secret,
    },
  };
}

async function requestJson(path, options = {}) {
  const errors = [];
  const isWrite = mutatingMethod(options);
  let writeSecret = isWrite ? readWriteSecret() : '';
  let prompted = false;

  for (const url of apiCandidates(path)) {
    while (true) {
      const effectiveOptions = withWriteSecret(options, writeSecret);
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
          if (isWrite && response.status === 403 && !prompted && typeof window !== 'undefined') {
            prompted = true;
            writeSecret = window.prompt('Введите ключ LifeMap для изменения данных:') || '';
            if (writeSecret) {
              writeWriteSecret(writeSecret);
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

export async function fetchSnapshot() {
  const data = await requestJson('/api/life-os/snapshot');
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
  const data = await requestJson('/api/life-os/inbox/assets');
  return Array.isArray(data.signals) ? data.signals : [];
}

export async function reprocessInboxSignals({ secret = '', onlyMissing = true } = {}) {
  return requestJson('/api/life-os/inbox/reprocess', {
    method: 'POST',
    headers: secret ? { 'X-LifeMap-Assistant-Secret': secret } : {},
    body: JSON.stringify({ onlyMissing }),
  });
}

export async function fetchInboxReprocessStatus() {
  return requestJson('/api/life-os/inbox/reprocess/status');
}

export function attachmentDownloadUrl(signalId) {
  return `/api/life-os/inbox/files/${encodeURIComponent(signalId)}`;
}

export async function fetchAssistantStatus() {
  return requestJson('/api/life-os/assistant/status');
}

export async function postAssistantChat({ message, messages = [], target = null, context = {}, executeActions = false, secret = '' }) {
  return requestJson('/api/life-os/assistant/chat', {
    method: 'POST',
    headers: secret ? { 'X-LifeMap-Assistant-Secret': secret } : {},
    body: JSON.stringify({ message, messages, target, context, executeActions }),
  });
}

export async function executeAssistantActions({ actions = [], secret = '' }) {
  return requestJson('/api/life-os/assistant/actions', {
    method: 'POST',
    headers: secret ? { 'X-LifeMap-Assistant-Secret': secret } : {},
    body: JSON.stringify({ actions }),
  });
}

export function dataState(snapshot, apiState) {
  if (apiState === 'api offline' || snapshot.meta?.source === 'api-offline') return 'api offline';
  if (apiState === 'loading') return 'loading';
  if (snapshot.meta?.source?.includes('mock')) return 'mock data';
  return apiState;
}
