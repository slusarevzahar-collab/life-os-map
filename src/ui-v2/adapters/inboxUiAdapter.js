// LifeMap UI V2 — Inbox UI adapter (Stage 5B1).
// Pure functions only: no fetch, no storage, no timers, no React.
// Maps runtime signal objects into what the InboxWindow renders.
// Relevance / attachment / formatting logic is lifted from the legacy
// AIInboxV2.jsx so behaviour matches the proven panel 1:1.

const MATERIAL_KINDS = ['Research', 'Reference', 'News', 'Instruction', 'File', 'Other'];

export const INBOX_TABS = [
  { id: 'new', label: 'Входящие' },
  { id: 'prompts', label: 'Промпты', kinds: ['Prompt'] },
  { id: 'tools', label: 'Инструменты', kinds: ['Tool'] },
  { id: 'workflow', label: 'Workflow', kinds: ['Workflow'] },
  { id: 'ideas', label: 'Идеи', kinds: ['Idea'] },
  { id: 'materials', label: 'Материалы', kinds: MATERIAL_KINDS },
  { id: 'tasks', label: 'В задачи', kinds: ['Task'] },
  { id: 'done', label: 'Разобрано' },
];

const FILE_NAME_PATTERN = /\.(pdf|md|txt|docx?|xlsx?|pptx?|csv|json|zip|html?)$/i;
const STOP_WORDS = new Set('это как для или что его ее их она они при где когда который которая которые можно может быть чтобы если уже еще очень просто через также такой такая такого только после перед под над без все этой этого этот эти чем том есть использовать использование проект задача работы работа материал инструмент промпт'.split(' '));

export function processedSignal(status = '') {
  return /reviewed|processed|archived|done|обработ|разобран|архив|готов/i.test(String(status || ''));
}

export function activeTask(status = '') {
  return !/done|готово|заверш|archived|архив/i.test(String(status || ''));
}

export function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatTime(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  catch { return ''; }
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

export function inferredAttachment(signal = {}) {
  if (signal.attachment?.fileName) return signal.attachment;
  if (FILE_NAME_PATTERN.test(String(signal.title || '').trim())) {
    return { fileName: signal.title, mimeType: '', fileSize: 0, inferred: true };
  }
  return null;
}

export function attachmentLabel(attachment = {}) {
  const name = String(attachment.fileName || '').toLowerCase();
  const mime = String(attachment.mimeType || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf') ? 'Скачать PDF' : 'Скачать файл';
}

function normalizeWord(value = '') {
  const word = String(value || '').toLowerCase().replace(/ё/g, 'е');
  if (word.length > 9) return word.slice(0, 7);
  if (word.length > 6) return word.slice(0, 6);
  return word;
}

function keywordSet(...values) {
  const text = values.flat(Infinity).filter(Boolean).join(' ').toLowerCase().replace(/ё/g, 'е');
  return new Set(text
    .split(/[^a-zа-я0-9+#.-]+/i)
    .map((word) => word.replace(/^[^a-zа-я0-9]+|[^a-zа-я0-9+#.-]+$/gi, ''))
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .map(normalizeWord));
}

function overlapCount(left = new Set(), right = new Set()) {
  let count = 0;
  left.forEach((token) => { if (right.has(token)) count += 1; });
  return count;
}

function daysOld(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return Infinity;
  return Math.max(0, (Date.now() - time) / 86400000);
}

function uniqueCoreText(signal = {}) {
  const parts = [signal.title, signal.summary]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(parts.map((value) => value.toLowerCase()))].join(' ');
}

function lowInformationSignal(signal = {}) {
  const coreText = uniqueCoreText(signal);
  const coreTokens = keywordSet(coreText);
  const hasResource = Boolean(signal.sourceUrl || inferredAttachment(signal));
  const hasAssets = Array.isArray(signal.assets) && signal.assets.length > 0;
  if (hasResource || hasAssets) return false;
  return coreText.length < 36 || coreTokens.size < 3;
}

export function relevanceForAsset(asset = {}, snapshot = {}, activeFocus = null) {
  const source = asset.sourceSignal || {};
  const focus = activeFocus || snapshot?.currentFocus || {};
  const assetTokens = keywordSet(asset.title, asset.description, asset.suggestedUse, asset.category, source.title, source.summary, source.relatedProjects);
  const focusTokens = keywordSet(focus.title, focus.project, focus.nextAction, focus.summary);
  const reasons = [];
  let relationScore = 0;

  const focusOverlap = overlapCount(assetTokens, focusTokens);
  if (focusOverlap >= 2) {
    relationScore += Math.min(36, focusOverlap * 9);
    reasons.push(`содержательно пересекается с текущим фокусом (${focusOverlap})`);
  }

  const focusProject = String(focus.project || '').trim().toLowerCase();
  const relatedProjects = (source.relatedProjects || []).map((name) => String(name).trim().toLowerCase());
  if (focusProject && relatedProjects.includes(focusProject)) {
    relationScore += 30;
    reasons.push(`напрямую связан с проектом ${focus.project}`);
  }

  const matchingTasks = (snapshot?.tasks || [])
    .filter((task) => activeTask(task.status))
    .filter((task) => {
      const taskTokens = keywordSet(task.title, task.project, task.goalName, task.nextAction);
      const projectMatch = task.project && relatedProjects.includes(String(task.project).trim().toLowerCase());
      return projectMatch || overlapCount(assetTokens, taskTokens) >= 3;
    });

  if (matchingTasks.length) {
    relationScore += Math.min(25, matchingTasks.length * 5);
    reasons.push(`может помочь в ${matchingTasks.length} активн. задачах`);
  }

  if (relationScore === 0) {
    return { score: 0, level: 'low', reasons: ['прямой связи с текущим фокусом и активными задачами пока не найдено'] };
  }

  let score = relationScore;
  const priority = String(source.priority || '').toLowerCase();
  if (priority === 'high') {
    score += 5;
    reasons.push('источник помечен высоким приоритетом');
  }

  const age = daysOld(source.capturedAt);
  if (age <= 14) score += 4;
  else if (age <= 60) score += 1;

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: normalizedScore,
    level: normalizedScore >= 70 ? 'high' : normalizedScore >= 40 ? 'medium' : 'low',
    reasons: reasons.slice(0, 3),
  };
}

export function relevanceForSignal(signal = {}, snapshot = {}, activeFocus = null) {
  if (lowInformationSignal(signal)) {
    return { score: 0, level: 'low', reasons: ['слишком мало содержания для оценки актуальности'] };
  }
  const own = relevanceForAsset({
    title: signal.title,
    description: signal.summary,
    suggestedUse: signal.possibleUse,
    category: signal.type,
    sourceSignal: signal,
  }, snapshot, activeFocus);
  const childScores = (signal.assets || []).map((asset) => relevanceForAsset({ ...asset, sourceSignal: signal }, snapshot, activeFocus));
  return childScores.reduce((best, current) => current.score > best.score ? current : best, own);
}

export function flattenAssets(signals = []) {
  return signals.flatMap((signal) => (Array.isArray(signal.assets) ? signal.assets : []).map((asset, index) => ({
    ...asset,
    category: String(asset.category || 'Другое').trim() || 'Другое',
    sourceSignal: signal,
    key: [signal.id, asset.kind, asset.category, asset.title, index].join('|'),
  })));
}

export function normalizeSignalFromMap(item) {
  const raw = item?.raw || {};
  return {
    id: item?.sourceId || raw.id || item?.id,
    title: item?.title || raw.title || 'Сигнал',
    type: raw.type || '',
    status: item?.status || raw.status || 'Inbox',
    priority: raw.priority || '',
    relatedProjects: raw.relatedProjects || [],
    summary: raw.summary || item?.summary || '',
    assistantNote: raw.assistantNote || '',
    possibleUse: raw.possibleUse || '',
    nextAction: raw.nextAction || '',
    sourceUrl: raw.sourceUrl || '',
    capturedAt: raw.capturedAt || '',
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    aiProcessingVersion: raw.aiProcessingVersion || '',
    needsReprocessing: raw.needsReprocessing === true,
    staleProcessingVersion: raw.staleProcessingVersion === true,
    attachment: raw.attachment || null,
  };
}

// Aggregated "Ресурс AI" percent — same math as CloudQuotaMeter.jsx.
function clampPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

function routePercent(provider = {}) {
  if (Number(provider.blockedForMs || 0) > 0) return 0;
  const values = [provider.quota?.requests?.percent, provider.quota?.tokens?.percent]
    .map(clampPercent)
    .filter((value) => value !== null);
  return values.length ? Math.min(...values) : null;
}

export function aggregateAiResource(status = {}) {
  const providers = (status?.providers || []).filter((provider) => provider.configured);
  if (!providers.length) return { percent: 0, known: true, ready: false };

  const measured = providers.map(routePercent).filter((value) => value !== null);
  const available = providers.filter((provider) => Number(provider.blockedForMs || 0) <= 0).length;
  const availabilityPercent = Math.round((available / providers.length) * 100);

  if (!measured.length) {
    return { percent: availabilityPercent, known: false, ready: available > 0 };
  }

  const measuredAverage = Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length);
  return {
    percent: Math.min(measuredAverage, availabilityPercent),
    known: true,
    ready: available > 0,
  };
}

export function tabCounts(rankedSignals = [], allAssets = [], localStatus = {}) {
  return {
    new: rankedSignals.filter((signal) => !processedSignal(localStatus[signal.id] || signal.status)).length,
    done: rankedSignals.filter((signal) => processedSignal(localStatus[signal.id] || signal.status)).length,
    prompts: allAssets.filter((asset) => asset.kind === 'Prompt').length,
    tools: allAssets.filter((asset) => asset.kind === 'Tool').length,
    workflow: allAssets.filter((asset) => asset.kind === 'Workflow').length,
    ideas: allAssets.filter((asset) => asset.kind === 'Idea').length,
    materials: allAssets.filter((asset) => MATERIAL_KINDS.includes(asset.kind)).length,
    tasks: allAssets.filter((asset) => asset.kind === 'Task').length,
  };
}

export function signalToAssistantTarget(signal) {
  return {
    id: `signal-${signal.id}`,
    sourceId: signal.id,
    title: signal.title,
    status: signal.status,
    kind: 'signal',
    raw: signal,
  };
}

// "Чат с AI" from an extracted asset row (Prompt/Tool/Workflow/Idea/
// Material/Task) needs the ASSET's own content, not just its parent
// signal. Two things this must get right:
// 1. Stable, asset-specific identity. assistantChatHistory.js (unchanged)
//    keys a session by `target.sourceId || target.id` — if sourceId were
//    the parent signal's id, every asset extracted from the same signal
//    would collapse onto ONE shared session (and onto the signal's own
//    "Чат с AI" session too). So sourceId is left unset for an asset
//    target; `id` is the stable per-row key (asset.key already encodes
//    signal id + kind + category + title + index, so it's unique and
//    reused correctly if the same row is reopened). The parent signal's id
//    is kept as `raw.sourceSignalId` for the current live session only —
//    assistantChatHistory's compactTarget() only persists a fixed field
//    whitelist (title/summary/assistantNote/possibleUse/nextAction/
//    relatedProjects/sourceUrl/project/goalName) that does not include
//    sourceSignalId, so it will not survive a reload; that whitelist is
//    intentionally not being changed here.
// 2. Bounded content. content can be a full prompt/instruction body —
//    capped before it goes into summary/assistantNote so one asset can't
//    blow past what a chat context chip should hold.
const ASSET_DESCRIPTION_MAX = 600;
const ASSET_CONTENT_EXCERPT_MAX = 900;

function truncate(value = '', max) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function assetToAssistantTarget(asset = {}) {
  const source = asset.sourceSignal || {};
  const description = truncate(asset.description || '', ASSET_DESCRIPTION_MAX);
  const contentExcerpt = truncate(asset.content || '', ASSET_CONTENT_EXCERPT_MAX);
  return {
    id: `asset-${asset.key || [source.id, asset.kind, asset.category, asset.title].filter(Boolean).join('|')}`,
    sourceId: null,
    title: asset.title || source.title,
    status: source.status,
    kind: 'asset',
    raw: {
      title: asset.title || source.title,
      summary: description,
      assistantNote: contentExcerpt ? `Фрагмент содержимого: ${contentExcerpt}` : '',
      possibleUse: asset.suggestedUse || source.possibleUse || '',
      nextAction: '',
      relatedProjects: source.relatedProjects || [],
      sourceUrl: asset.url || source.sourceUrl || '',
      project: source.project || '',
      goalName: source.goalName || '',
      assetKind: asset.kind || '',
      assetCategory: asset.category || '',
      sourceSignalId: source.id || '',
      sourceSignalTitle: source.title || '',
    },
  };
}

// Category sub-filter for asset tabs (Prompts/Tools/Workflow/Idea/
// Materials/Tasks) — mirrors legacy AIInboxV2's per-tab category chips.
export function uniqueAssetCategories(tabAssets = []) {
  return [...new Set(tabAssets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}
