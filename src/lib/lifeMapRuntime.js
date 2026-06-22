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

export async function fetchSnapshot() {
  const errors = [];
  for (const url of apiCandidates('/api/life-os/snapshot')) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      return { ...data, meta: { ...(data.meta || {}), apiUrl: url } };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

export async function patchTask(taskId, payload) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/tasks/${taskId}`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
      return data;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

export async function patchItemTitle(node, title) {
  const errors = [];
  for (const url of apiCandidates(`/api/life-os/items/${node.sourceId}/title`)) {
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind: node.kind, title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `API ${response.status}`);
      return data;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

export function dataState(snapshot, apiState) {
  if (apiState === 'api offline' || snapshot.meta?.source === 'api-offline') return 'api offline';
  if (apiState === 'loading') return 'loading';
  if (snapshot.meta?.source?.includes('mock')) return 'mock data';
  return apiState;
}
