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
    goals: [],
    tasks: [],
    sessions: [],
    projectAreas: [],
    dreams: [],
    signals: [],
    planning: { onTrack: 0, next: 0, waiting: 0, overdue: 0, done: 0 },
  };
}

export function apiCandidates(path) {
  if (typeof window === 'undefined') return [path];
  const origin = window.location.origin;
  const candidates = [path];
  const codespaceApiOrigin = origin.replace(/-\d+\.app\.github\.dev$/i, '-3001.app.github.dev');
  if (codespaceApiOrigin !== origin) candidates.push(`${codespaceApiOrigin}${path}`);
  return [...new Set(candidates)];
}

async function requestJson(path, options = {}) {
  const errors = [];
  for (const url of apiCandidates(path)) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || data.details || `API ${response.status}`);
      return data;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

export async function fetchSnapshot() {
  const data = await requestJson('/api/life-os/snapshot');
  return { ...data, meta: { ...(data.meta || {}), apiUrl: data.meta?.apiUrl || '/api/life-os/snapshot' } };
}

export async function patchTask(taskId, payload) {
  return requestJson(`/api/life-os/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

function notionSignalStatus(status = 'Inbox') {
  if (status === 'New') return 'Inbox';
  if (status === 'Reviewed') return 'Processed';
  if (status === 'Archived') return 'Processed';
  return status || 'Inbox';
}

export async function patchSignal(signalId, payload) {
  return patchTask(signalId, { status: notionSignalStatus(payload.status) });
}

export async function patchItemTitle(node, title) {
  return requestJson(`/api/life-os/items/${node.sourceId}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: node.kind, title }),
  });
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
