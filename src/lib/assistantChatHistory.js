const LEGACY_CHAT_PREFIX = 'lifemap.assistant.chat.v3:';
const SESSION_INDEX_KEY = 'lifemap.assistant.sessions.v1';
const SESSION_PREFIX = 'lifemap.assistant.session.v1:';
const ACTIVE_SESSION_KEY = 'lifemap.assistant.activeSession.v1';
const MIGRATION_KEY = 'lifemap.assistant.sessions.v1.migrated';
const MAX_SESSIONS = 30;
const MAX_MESSAGES = 40;

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function readJson(key, fallback) {
  try {
    const value = storage()?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { storage()?.setItem(key, JSON.stringify(value)); } catch {}
}

function makeId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function compactTitle(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Новый чат';
  return text.length > 54 ? `${text.slice(0, 53)}…` : text;
}

function compactTarget(target) {
  if (!target) return null;
  const raw = target.raw || {};
  return {
    id: target.id || '',
    sourceId: target.sourceId || '',
    title: target.title || '',
    status: target.status || '',
    kind: target.kind || '',
    code: target.code || target.icon || '',
    raw: {
      title: raw.title || '',
      summary: raw.summary || '',
      assistantNote: raw.assistantNote || '',
      possibleUse: raw.possibleUse || '',
      nextAction: raw.nextAction || '',
      relatedProjects: Array.isArray(raw.relatedProjects) ? raw.relatedProjects.slice(0, 6) : [],
      sourceUrl: raw.sourceUrl || '',
      project: raw.project || '',
      goalName: raw.goalName || '',
    },
  };
}

function compactContext(context = {}) {
  return {
    mode: context.mode || '',
    mapTitle: context.mapTitle || '',
  };
}

function normalizeSessions(value) {
  return (Array.isArray(value) ? value : [])
    .filter((session) => session?.id)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, MAX_SESSIONS);
}

export function readAssistantSessions() {
  migrateLegacyChats();
  return normalizeSessions(readJson(SESSION_INDEX_KEY, []));
}

export function readActiveAssistantSessionId() {
  try { return storage()?.getItem(ACTIVE_SESSION_KEY) || ''; } catch { return ''; }
}

export function setActiveAssistantSessionId(id = '') {
  try {
    if (id) storage()?.setItem(ACTIVE_SESSION_KEY, id);
    else storage()?.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}

export function readAssistantSessionMessages(id) {
  if (!id) return [];
  const value = readJson(`${SESSION_PREFIX}${id}`, []);
  return Array.isArray(value) ? value : [];
}

export function writeAssistantSessionMessages(id, messages = []) {
  if (!id) return;
  writeJson(`${SESSION_PREFIX}${id}`, (Array.isArray(messages) ? messages : []).slice(-MAX_MESSAGES));
}

export function createAssistantSession({ target = null, targetContext = {}, title = 'Новый чат' } = {}) {
  const createdAt = nowIso();
  const session = {
    id: makeId(),
    title: compactTitle(title),
    targetKey: target?.sourceId || target?.id || 'global',
    target: compactTarget(target),
    targetContext: compactContext(targetContext),
    createdAt,
    updatedAt: createdAt,
  };
  const sessions = normalizeSessions([session, ...readAssistantSessions()]);
  writeJson(SESSION_INDEX_KEY, sessions);
  writeAssistantSessionMessages(session.id, []);
  setActiveAssistantSessionId(session.id);
  return { session, sessions };
}

export function updateAssistantSession(id, patch = {}) {
  const sessions = readAssistantSessions();
  const next = normalizeSessions(sessions.map((session) => session.id === id ? {
    ...session,
    ...patch,
    title: patch.title ? compactTitle(patch.title) : session.title,
    updatedAt: patch.updatedAt || nowIso(),
  } : session));
  writeJson(SESSION_INDEX_KEY, next);
  return next;
}

export function touchAssistantSessionFromMessage(id, text) {
  const sessions = readAssistantSessions();
  const current = sessions.find((session) => session.id === id);
  if (!current) return sessions;
  const patch = {
    updatedAt: nowIso(),
    ...(current.title === 'Новый чат' ? { title: compactTitle(text) } : {}),
  };
  return updateAssistantSession(id, patch);
}

export function findAssistantSessionForTarget(target) {
  const key = target?.sourceId || target?.id || 'global';
  return readAssistantSessions().find((session) => session.targetKey === key) || null;
}

export function clearAssistantSession(id) {
  writeAssistantSessionMessages(id, []);
  return updateAssistantSession(id, { title: 'Новый чат', updatedAt: nowIso() });
}

function migrateLegacyChats() {
  const store = storage();
  if (!store || store.getItem(MIGRATION_KEY)) return;

  const imported = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index) || '';
    if (!key.startsWith(LEGACY_CHAT_PREFIX)) continue;
    const messages = readJson(key, []);
    if (!Array.isArray(messages) || !messages.length) continue;
    const firstUser = messages.find((message) => message?.role === 'user' && message?.text);
    const id = makeId();
    const createdAt = messages[0]?.createdAt || nowIso();
    const updatedAt = messages[messages.length - 1]?.createdAt || createdAt;
    imported.push({
      id,
      title: compactTitle(firstUser?.text || 'Старый чат'),
      targetKey: key.slice(LEGACY_CHAT_PREFIX.length) || 'global',
      target: null,
      targetContext: {},
      createdAt,
      updatedAt,
    });
    writeAssistantSessionMessages(id, messages);
  }

  if (imported.length) {
    writeJson(SESSION_INDEX_KEY, normalizeSessions([...imported, ...readJson(SESSION_INDEX_KEY, [])]));
  }
  try { store.setItem(MIGRATION_KEY, '1'); } catch {}
}
