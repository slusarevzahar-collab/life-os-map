const SECRET_KEY = 'lifemap.assistant.writeSecret.session';
let rejectedAccessKey = '';
let accessPromptSuppressedUntil = 0;
let accessPromptPromise = null;

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
  if (typeof window === 'undefined') return Promise.resolve('');
  if (accessPromptPromise) return accessPromptPromise;
  accessPromptPromise = new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'lifemapAccessOverlay';
    overlay.setAttribute('role', 'presentation');

    const dialog = document.createElement('form');
    dialog.className = 'lifemapAccessDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'lifemap-access-title');

    const eyebrow = document.createElement('span');
    eyebrow.className = 'lifemapAccessEyebrow';
    eyebrow.textContent = 'SECURE ACCESS';
    const title = document.createElement('h2');
    title.id = 'lifemap-access-title';
    title.textContent = 'Доступ к LifeMap';
    const description = document.createElement('p');
    description.textContent = 'Введите ключ этого окружения. Он сохраняется только в текущей вкладке браузера.';

    const field = document.createElement('label');
    field.className = 'lifemapAccessField';
    const label = document.createElement('span');
    label.textContent = 'Ключ доступа';
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.required = true;
    input.setAttribute('aria-label', 'Ключ доступа LifeMap');
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'lifemapAccessReveal';
    reveal.textContent = 'Показать';
    reveal.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      reveal.textContent = input.type === 'password' ? 'Показать' : 'Скрыть';
      input.focus();
    });
    field.append(label, input, reveal);

    const note = document.createElement('small');
    note.textContent = 'Ключ не передаётся сторонним сервисам и не записывается в localStorage.';
    const actions = document.createElement('div');
    actions.className = 'lifemapAccessActions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'lifemapAccessCancel';
    cancel.textContent = 'Отмена';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'lifemapAccessSubmit';
    submit.textContent = 'Продолжить';
    actions.append(cancel, submit);
    dialog.append(eyebrow, title, description, field, note, actions);
    overlay.append(dialog);

    const finish = (value = '') => {
      overlay.remove();
      accessPromptPromise = null;
      resolve(String(value || '').trim());
    };
    dialog.addEventListener('submit', (event) => { event.preventDefault(); finish(input.value); });
    cancel.addEventListener('click', () => finish(''));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(''); });
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(''); });
    document.body.append(overlay);
    window.setTimeout(() => input.focus(), 0);
  });
  return accessPromptPromise;
}

async function environmentConfigurationError(url) {
  if (typeof window === 'undefined') return null;
  try {
    const requestUrl = new URL(url, window.location.origin);
    const healthUrl = new URL('/api/life-os/health', requestUrl.origin);
    const response = await fetch(healthUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json')) return null;
    const health = await response.json();
    if (health?.assistant?.actionSecret !== false) return null;
    const error = new Error('Vercel Preview не настроен: отсутствует LIFEMAP_ASSISTANT_API_SECRET. По данным health endpoint также не подключены Notion Tasks и Sessions. Добавьте переменные в Preview Environment и выполните redeploy.');
    error.apiResponse = true;
    error.status = 503;
    error.code = 'preview-environment-missing';
    return error;
  } catch {
    return null;
  }
}

function vercelLoginError(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const responseUrl = String(response.url || '');
  if (!contentType.includes('text/html')) return null;
  const previewHost = typeof window !== 'undefined' ? window.location.host : '';
  const error = new Error(`Vercel Preview требует отдельного входа. Откройте https://${previewHost}/api/life-os/health, войдите в Vercel и затем перезагрузите LifeMap.`);
  error.apiResponse = true;
  error.status = response.status || 401;
  error.code = responseUrl.includes('vercel.com') ? 'vercel-preview-login' : 'unexpected-html';
  return error;
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
        const loginError = vercelLoginError(response);
        if (loginError) throw loginError;
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
          if (response.status === 403 && needsSecret && !prompted) {
            const configurationError = await environmentConfigurationError(url);
            if (configurationError) throw configurationError;
            const latestSecret = readAccessSecret();
            if (latestSecret && latestSecret !== secret) {
              secret = latestSecret;
              continue;
            }
            if (!secret && Date.now() < accessPromptSuppressedUntil) {
              const error = new Error('Ключ уже был отклонён этим окружением. Для Vercel Preview проверьте вход в Vercel и наличие LIFEMAP_ASSISTANT_API_SECRET в Preview Environment.');
              error.apiResponse = true;
              error.status = 403;
              error.code = 'access-key-rejected';
              throw error;
            }
            prompted = true;
            if (secret) {
              rejectedAccessKey = secret;
              writeAccessSecret('');
            }
            secret = await promptForAccessKey();
            if (secret) {
              if (secret === rejectedAccessKey) accessPromptSuppressedUntil = Date.now() + 15000;
              writeAccessSecret(secret);
              continue;
            }
          }
          if (response.status === 403 && secret) {
            rejectedAccessKey = secret;
            accessPromptSuppressedUntil = Date.now() + 15000;
            if (readAccessSecret() === secret) writeAccessSecret('');
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
