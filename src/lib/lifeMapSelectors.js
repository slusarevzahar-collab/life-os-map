import { isDoneNode, isLeafNode } from './actionMapModel.js';
import { RENAMABLE_KINDS } from '../constants/lifeMap.js';

function legacyInboxBranch(node) {
  if (node?.id !== 'sphere-inbox') return null;
  return (node.children || []).find((item) => item?.id === 'inbox-signals') || null;
}

export function hasBranch(node) {
  if (legacyInboxBranch(node)) return false;
  return Boolean((node?.children || []).some((item) => !isLeafNode(item)));
}

export function topItems(node) {
  if (legacyInboxBranch(node)) return [];
  return (node?.children || []).filter((item) => !isLeafNode(item));
}

export function canPatchTask(node) {
  return node?.kind === 'task' && Boolean(node.sourceId);
}

export function canRenameNode(node) {
  return Boolean(node?.id && node.id !== 'root' && (node.sourceId || RENAMABLE_KINDS.has(node.kind) || node.id.startsWith('sphere-')));
}

export function listItems(node) {
  const inboxBranch = legacyInboxBranch(node);
  if (inboxBranch) {
    const directLeaves = (inboxBranch.children || []).filter((item) => isLeafNode(item));
    const taskList = inboxBranch.taskList || [];
    const merged = [...taskList, ...directLeaves];
    return merged.filter((item, index, arr) => item?.id && arr.findIndex((next) => next.id === item.id) === index);
  }

  const directLeaves = (node?.children || []).filter((item) => isLeafNode(item));
  const taskList = node?.taskList || [];
  const branchCards = topItems(node);
  const merged = [...taskList, ...directLeaves];
  const uniqLeaves = merged.filter((item, index, arr) => item?.id && arr.findIndex((next) => next.id === item.id) === index);
  if (uniqLeaves.length) return uniqLeaves;
  return branchCards;
}

export function flattenNodes(node, seen = new Set()) {
  if (!node || seen.has(node.id)) return [];
  seen.add(node.id);
  return [
    node,
    ...(node.children || []).flatMap((child) => flattenNodes(child, seen)),
    ...(node.taskList || []).flatMap((child) => flattenNodes(child, seen)),
  ];
}

export function uniqueBySource(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.sourceId || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyTitleAliases(node, aliases = {}) {
  if (!node) return node;
  const alias = aliases[node.id];
  const next = alias ? { ...node, title: alias } : { ...node };
  next.children = (node.children || []).map((child) => applyTitleAliases(child, aliases));
  next.taskList = (node.taskList || []).map((child) => applyTitleAliases(child, aliases));
  return next;
}

export function focusCandidateFromNode(node) {
  if (!node) return null;
  if (isLeafNode(node)) return node;
  const leaves = listItems(node).filter((item) => isLeafNode(item) && !isDoneNode(item));
  return leaves[0] || listItems(node)[0] || node;
}

export function toFocusItem(node) {
  if (!node) return null;
  return {
    id: node.id,
    sourceId: node.sourceId || null,
    title: node.title || 'Фокус',
    project: node.raw?.project || node.subtitle || node.status || '',
    status: node.status || '',
    progress: Number(node.progress) || 0,
    nextAction: node.raw?.nextAction || node.summary || 'Следующий шаг не указан.',
    kind: node.kind || 'node',
  };
}

export function dedupeFocusItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.sourceId || item?.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveFocus(rootMap, snapshot, focusQueue = []) {
  const nodes = flattenNodes(rootMap);
  for (const queued of focusQueue) {
    const match = nodes.find((node) => !isDoneNode(node) && ((queued.sourceId && node.sourceId === queued.sourceId) || node.id === queued.id));
    if (match) return toFocusItem(match);
    if (queued?.title) return queued;
  }

  const lifeMapFocus = nodes.find((node) => {
    if (node.kind !== 'task' || isDoneNode(node)) return false;
    const text = `${node.title} ${node.summary} ${node.raw?.project || ''} ${node.raw?.goalName || ''}`.toLowerCase();
    return text.includes('стабилизировать рабочий сценарий') ||
      text.includes('собрать рабочую life os map') ||
      text.includes('lifemap') ||
      text.includes('life os map + ai inbox mvp') ||
      text.includes('создать рабочую liveos map');
  });
  if (lifeMapFocus) return toFocusItem(lifeMapFocus);

  const lifeOsTask = nodes.find((node) => {
    if (node.kind !== 'task' || isDoneNode(node)) return false;
    const text = `${node.title} ${node.summary} ${node.raw?.project || ''} ${node.raw?.goalName || ''}`.toLowerCase();
    return text.includes('life os') || text.includes('live os') || text.includes('навигатор') || text.includes('notion data adapter');
  });
  if (lifeOsTask) return toFocusItem(lifeOsTask);

  return {
    id: snapshot.currentFocus?.id || 'snapshot-focus',
    sourceId: snapshot.currentFocus?.id || null,
    title: snapshot.currentFocus?.title || 'Фокус не выбран',
    project: snapshot.currentFocus?.project || '',
    status: snapshot.currentFocus?.status || '',
    progress: Number(snapshot.currentFocus?.progress) || 0,
    nextAction: snapshot.currentFocus?.nextAction || 'Выбери ближайший конкретный шаг.',
    kind: 'focus',
  };
}

export function buildFocusSequence(rootMap, activeFocus, queue = []) {
  const nodes = flattenNodes(rootMap);
  const resolved = queue.map((item) => nodes.find((node) => (item.sourceId && node.sourceId === item.sourceId) || node.id === item.id) || item);
  return dedupeFocusItems([activeFocus, ...resolved].filter(Boolean));
}