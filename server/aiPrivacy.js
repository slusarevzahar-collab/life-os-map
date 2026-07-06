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

function safeText(value, limit) {
  return sanitizeTextForAi(value, limit);
}

function safeTarget(target = {}) {
  return {
    id: safeText(target.id, 120),
    kind: safeText(target.kind, 80),
    title: safeText(target.title, 240),
    project: safeText(target.project, 160),
    goalName: safeText(target.goalName, 200),
    type: safeText(target.type, 80),
  };
}

function taskScore(task = {}, target = {}, currentFocus = {}) {
  let score = 0;
  const targetProject = String(target.project || '').toLowerCase();
  const targetGoal = String(target.goalName || target.title || '').toLowerCase();
  if (task.id && task.id === target.id) score += 100;
  if (task.id && task.id === currentFocus?.id) score += 90;
  if (targetProject && String(task.project || '').toLowerCase() === targetProject) score += 50;
  if (targetGoal && String(task.goalName || '').toLowerCase() === targetGoal) score += 40;
  if (/now|сейчас|in progress|в работе/i.test(String(task.status || ''))) score += 25;
  if (Number(task.priority) > 0) score += Math.max(0, 20 - Number(task.priority));
  return score;
}

function signalScore(signal = {}, target = {}) {
  const targetProject = String(target.project || target.title || '').toLowerCase();
  const related = Array.isArray(signal.relatedProjects) ? signal.relatedProjects : [];
  let score = /new|inbox|нов|вход/i.test(String(signal.status || '')) ? 20 : 0;
  if (targetProject && related.some((name) => String(name).toLowerCase() === targetProject)) score += 40;
  if (String(signal.priority || '').toLowerCase() === 'high') score += 15;
  return score;
}

export function projectNamesFromSnapshot(snapshot = {}) {
  return [...new Set([
    ...(snapshot.projectAreas || []).map((item) => item.name),
    ...(snapshot.tasks || []).map((task) => task.project),
  ].filter(Boolean).map((name) => safeText(name, 120)))].slice(0, 30);
}

export function compactForAssistant(snapshot = {}, target = {}) {
  const cleanTarget = safeTarget(target);
  const currentFocus = snapshot.currentFocus ? {
    id: safeText(snapshot.currentFocus.id, 120),
    code: safeText(snapshot.currentFocus.code, 40),
    title: safeText(snapshot.currentFocus.title, 240),
    project: safeText(snapshot.currentFocus.project, 160),
    status: safeText(snapshot.currentFocus.status, 80),
    progress: Number(snapshot.currentFocus.progress || 0),
    nextAction: safeText(snapshot.currentFocus.nextAction, 500),
  } : null;

  const tasks = [...(snapshot.tasks || [])]
    .sort((a, b) => taskScore(b, cleanTarget, currentFocus) - taskScore(a, cleanTarget, currentFocus))
    .slice(0, 16)
    .map((task) => ({
      id: safeText(task.id, 120), code: safeText(task.code, 40), title: safeText(task.title, 260),
      project: safeText(task.project, 160), goalName: safeText(task.goalName, 200),
      status: safeText(task.status, 80), priority: Number(task.priority || 0),
      progress: Number(task.progress || 0), nextAction: safeText(task.nextAction, 500),
    }));

  const goals = (snapshot.goals || []).slice(0, 10).map((goal) => ({
    id: safeText(goal.id, 120), title: safeText(goal.title, 240), area: safeText(goal.area, 160),
    status: safeText(goal.status, 80), progress: Number(goal.progress || 0), nextAction: safeText(goal.nextAction, 500),
  }));

  const signals = [...(snapshot.signals || [])]
    .sort((a, b) => signalScore(b, cleanTarget) - signalScore(a, cleanTarget))
    .slice(0, 8)
    .map((signal) => ({
      id: safeText(signal.id, 120), title: safeText(signal.title, 260), type: safeText(signal.type, 80),
      category: safeText(signal.aiCategory, 80), status: safeText(signal.status, 80), priority: safeText(signal.priority, 40),
      relatedProjects: (signal.relatedProjects || []).slice(0, 6).map((name) => safeText(name, 120)),
      summary: safeText(signal.summary || signal.assistantNote, 800), possibleUse: safeText(signal.possibleUse, 500),
    }));

  return {
    currentFocus,
    planning: {
      onTrack: Number(snapshot.planning?.onTrack || 0), next: Number(snapshot.planning?.next || 0),
      waiting: Number(snapshot.planning?.waiting || 0), overdue: Number(snapshot.planning?.overdue || 0), done: Number(snapshot.planning?.done || 0),
    },
    target: cleanTarget,
    projectNames: projectNamesFromSnapshot(snapshot),
    tasks,
    goals,
    signals,
  };
}

export function buildSafeInboxPayload(signal = {}, snapshot = {}) {
  return {
    availableProjects: projectNamesFromSnapshot(snapshot),
    currentFocus: snapshot.currentFocus ? {
      title: safeText(snapshot.currentFocus.title, 240),
      project: safeText(snapshot.currentFocus.project, 160),
      nextAction: safeText(snapshot.currentFocus.nextAction, 500),
    } : null,
    signal: {
      title: safeText(signal.title, 260),
      heuristicType: safeText(signal.type, 80),
      heuristicPriority: safeText(signal.priority, 40),
      text: safeText(signal.rawText || signal.summary, 7000),
      sourceHost: (() => { try { return new URL(signal.sourceUrl || '').hostname; } catch { return ''; } })(),
    },
  };
}
