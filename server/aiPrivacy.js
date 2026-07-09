function clip(value = '', limit = 1200) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

export function sanitizeTextForAi(value = '', limit = 6000) {
  let text = String(value ?? '');
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
  text = text.replace(/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*([^\s"']+)/g, '$1=[REDACTED]');
  text = text.replace(/\b[A-Za-z0-9_-]{36,}\b/g, '[LONG_TOKEN]');
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]');
  text = text.replace(/(?<!\w)(?:\+?\d[\d\s().-]{8,}\d)(?!\w)/g, '[PHONE]');
  return clip(text, limit);
}

function canonicalLabel(value = '') {
  const text = String(value || '').trim();
  if (/^life\s*os$/i.test(text)) return 'LifeMap';
  if (/^ai\s*inbox$/i.test(text)) return 'LM Inbox';
  return text;
}

function safeText(value, limit) {
  return sanitizeTextForAi(value, limit);
}

function safeLabel(value, limit) {
  return safeText(canonicalLabel(value), limit);
}

function safeTarget(target = {}) {
  return {
    id: safeText(target.id, 120),
    kind: safeText(target.kind, 80),
    title: safeText(target.title, 240),
    project: safeLabel(target.project, 160),
    goalName: safeLabel(target.goalName, 200),
    type: safeText(target.type, 80),
  };
}

function taskScore(task = {}, target = {}, currentFocus = {}) {
  let score = 0;
  const targetProject = canonicalLabel(target.project).toLowerCase();
  const targetGoal = canonicalLabel(target.goalName || target.title).toLowerCase();
  if (task.id && task.id === target.id) score += 100;
  if (task.id && task.id === currentFocus?.id) score += 90;
  if (targetProject && canonicalLabel(task.project).toLowerCase() === targetProject) score += 50;
  if (targetGoal && canonicalLabel(task.goalName).toLowerCase() === targetGoal) score += 40;
  if (/now|сейчас|in progress|в работе/i.test(String(task.status || ''))) score += 25;
  if (Number(task.priority) > 0) score += Math.max(0, 20 - Number(task.priority));
  return score;
}

function signalScore(signal = {}, target = {}, currentFocus = {}) {
  const targetProject = canonicalLabel(target.project || target.title).toLowerCase();
  const focusProject = canonicalLabel(currentFocus?.project).toLowerCase();
  const related = Array.isArray(signal.relatedProjects) ? signal.relatedProjects.map((name) => canonicalLabel(name).toLowerCase()) : [];
  let score = Number(signal.relevanceScore || signal.relevance || 0);
  if (/new|inbox|нов|вход/i.test(String(signal.status || ''))) score += 12;
  if (targetProject && related.includes(targetProject)) score += 40;
  if (focusProject && related.includes(focusProject)) score += 35;
  if (String(signal.priority || '').toLowerCase() === 'high') score += 15;
  if (Array.isArray(signal.assets) && signal.assets.length) score += Math.min(12, signal.assets.length * 2);
  return score;
}

function activeTask(task = {}) {
  return !/done|готово|заверш|archived|архив/i.test(String(task.status || ''));
}

export function projectNamesFromSnapshot(snapshot = {}) {
  return [...new Set([
    ...(snapshot.projectAreas || []).map((item) => canonicalLabel(item.name)),
    ...(snapshot.tasks || []).map((task) => canonicalLabel(task.project)),
  ].filter(Boolean).map((name) => safeText(name, 120)))].slice(0, 30);
}

export function compactForAssistant(snapshot = {}, target = {}) {
  const cleanTarget = safeTarget(target);
  const currentFocus = snapshot.currentFocus ? {
    id: safeText(snapshot.currentFocus.id, 120),
    code: safeText(snapshot.currentFocus.code, 40),
    title: safeText(snapshot.currentFocus.title, 240),
    project: safeLabel(snapshot.currentFocus.project, 160),
    status: safeText(snapshot.currentFocus.status, 80),
    progress: Number(snapshot.currentFocus.progress || 0),
    nextAction: safeText(snapshot.currentFocus.nextAction, 500),
  } : null;

  const tasks = [...(snapshot.tasks || [])]
    .filter(activeTask)
    .sort((a, b) => taskScore(b, cleanTarget, currentFocus) - taskScore(a, cleanTarget, currentFocus))
    .slice(0, 18)
    .map((task) => ({
      id: safeText(task.id, 120),
      code: safeText(task.code, 40),
      title: safeText(task.title, 260),
      project: safeLabel(task.project, 160),
      goalName: safeLabel(task.goalName, 200),
      status: safeText(task.status, 80),
      priority: Number(task.priority || 0),
      progress: Number(task.progress || 0),
      nextAction: safeText(task.nextAction, 500),
      note: safeText(task.note || task.sessionNotes || '', 360),
    }));

  const goals = (snapshot.goals || []).slice(0, 10).map((goal) => ({
    id: safeText(goal.id, 120),
    title: safeText(goal.title, 240),
    area: safeLabel(goal.area, 160),
    status: safeText(goal.status, 80),
    progress: Number(goal.progress || 0),
    nextAction: safeText(goal.nextAction, 500),
  }));

  const signals = [...(snapshot.signals || [])]
    .sort((a, b) => signalScore(b, cleanTarget, currentFocus) - signalScore(a, cleanTarget, currentFocus))
    .slice(0, 10)
    .map((signal) => ({
      id: safeText(signal.id, 120),
      title: safeText(signal.title, 260),
      type: safeText(signal.type, 80),
      category: safeText(signal.aiCategory, 80),
      status: safeText(signal.status, 80),
      priority: safeText(signal.priority, 40),
      relevanceScore: Number(signal.relevanceScore || signal.relevance || 0),
      relatedProjects: (signal.relatedProjects || []).slice(0, 6).map((name) => safeLabel(name, 120)),
      summary: safeText(signal.summary, 700),
      assistantNote: safeText(signal.assistantNote, 520),
      possibleUse: safeText(signal.possibleUse, 500),
      nextAction: safeText(signal.nextAction, 360),
      assets: (signal.assets || []).slice(0, 6).map((asset) => ({
        kind: safeText(asset.kind, 60),
        category: safeText(asset.category, 80),
        title: safeText(asset.title, 180),
        description: safeText(asset.description, 260),
        suggestedUse: safeText(asset.suggestedUse, 260),
      })),
    }));

  return {
    currentFocus,
    planning: {
      onTrack: Number(snapshot.planning?.onTrack || 0),
      next: Number(snapshot.planning?.next || 0),
      waiting: Number(snapshot.planning?.waiting || 0),
      overdue: Number(snapshot.planning?.overdue || 0),
      done: Number(snapshot.planning?.done || 0),
    },
    target: cleanTarget,
    projectNames: projectNamesFromSnapshot(snapshot),
    tasks,
    goals,
    signals,
  };
}

export function buildSafeInboxPayload(signal = {}, snapshot = {}) {
  const document = signal.telegram?.document || signal.attachment || null;
  const focusProject = canonicalLabel(snapshot.currentFocus?.project).toLowerCase();
  const activeWork = [...(snapshot.tasks || [])]
    .filter(activeTask)
    .sort((a, b) => {
      const aFocus = focusProject && canonicalLabel(a.project).toLowerCase() === focusProject ? 1 : 0;
      const bFocus = focusProject && canonicalLabel(b.project).toLowerCase() === focusProject ? 1 : 0;
      if (aFocus !== bFocus) return bFocus - aFocus;
      return Number(a.priority || 999) - Number(b.priority || 999);
    })
    .slice(0, 6)
    .map((task) => ({
      title: safeText(task.title, 180),
      project: safeLabel(task.project, 100),
      nextAction: safeText(task.nextAction, 260),
    }));

  return {
    availableProjects: projectNamesFromSnapshot(snapshot),
    currentFocus: snapshot.currentFocus ? {
      title: safeText(snapshot.currentFocus.title, 220),
      project: safeLabel(snapshot.currentFocus.project, 140),
      nextAction: safeText(snapshot.currentFocus.nextAction, 360),
    } : null,
    activeWork,
    signal: {
      title: safeText(signal.title, 220),
      heuristicType: safeText(signal.type, 60),
      heuristicPriority: safeText(signal.priority, 30),
      text: safeText(signal.rawText || signal.summary, 5000),
      sourceHost: (() => { try { return new URL(signal.sourceUrl || '').hostname; } catch { return ''; } })(),
      attachment: document ? {
        fileName: safeText(document.fileName || document.file_name, 220),
        mimeType: safeText(document.mimeType || document.mime_type, 100),
        size: Number(document.fileSize || document.file_size || 0),
        textCaptured: document.textCaptured === true,
      } : null,
    },
  };
}
